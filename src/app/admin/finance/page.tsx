import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/admin";
import { recordSettlement } from "@/lib/stripe/settlement";
import { calculateFees, fromMinorUnits, SERVICE_FEE_RATE } from "@/lib/fees";
import { LISTING_ORDER_STATUS_LABELS } from "@/lib/supabase/enums";
import type { Listing, ListingOrder, Payment, Profile } from "@/lib/supabase/types";

// 平台账本(2026-09-24 加,见 README"平台记账:/admin/finance"):每一单拆成
// 买家付了多少 / 12% Service fee / Payment processing fee / 卖家实收 / Stripe 实际
// 手续费 / 平台净收入,顶部按结算币种汇总。钱在 Stripe 那边是一整个平台余额,
// "哪部分是卖家的、哪部分是平台的"只能在这里算清楚。
const RECENT_LIMIT = 500;
// 老订单付款时还没记 settlement,打开页面时顺手从 Stripe 补,每次最多补这么多笔,
// 免得一次打开页面调几百次 Stripe API。
const BACKFILL_LIMIT = 25;

const RELEASED_STATUSES: ListingOrder["status"][] = ["released", "expired_auto_confirmed"];

type PaymentRow = Pick<
  Payment,
  | "order_id"
  | "stripe_payment_intent_id"
  | "status"
  | "settlement_currency"
  | "settlement_amount"
  | "stripe_actual_fee"
  | "transfer_amount"
  | "transfer_currency"
>;

interface Row {
  order: ListingOrder;
  title: string;
  sellerName: string;
  gross: number;
  serviceFee: number;
  processingFee: number;
  sellerNet: number;
  // 以下是平台结算币种(一般 GBP),可能为 null(还没从 Stripe 拿到)。
  settlementCurrency: string | null;
  settlementAmount: number | null;
  stripeFee: number | null;
  sellerPayoutSettled: number | null;
  platformNet: number | null;
  bucket: "escrow" | "released" | "cancelled";
}

function money(amount: number | null, currency: string | null): string {
  if (amount === null || !currency) return "—";
  return `${amount.toFixed(currency === "JPY" ? 0 : 2)} ${currency}`;
}

function addTo(map: Map<string, number>, currency: string | null, amount: number | null) {
  if (!currency || amount === null) return;
  map.set(currency, (map.get(currency) ?? 0) + amount);
}

function formatTotals(map: Map<string, number>): string {
  if (map.size === 0) return "—";
  return [...map].map(([c, v]) => money(v, c)).join(" · ");
}

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ seller?: string }>;
}) {
  // layout 已经校验过,这里再校验一次:这个页面会调 Stripe、展示平台收入,不只靠 layout。
  await requireAdmin();
  const { seller: sellerFilter } = await searchParams;
  const admin = createServiceClient();

  let orderQuery = admin
    .from("listing_orders")
    .select("*")
    .not("status", "eq", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (sellerFilter) orderQuery = orderQuery.eq("seller_id", sellerFilter);
  const { data: orderRows, error } = await orderQuery;
  const orders = (orderRows ?? []) as ListingOrder[];

  const orderIds = orders.map((o) => o.id);
  const listingIds = [...new Set(orders.map((o) => o.listing_id))];
  const sellerIds = [...new Set(orders.map((o) => o.seller_id))];
  const [{ data: paymentRows }, { data: listingRows }, { data: sellerRows }] = await Promise.all([
    orderIds.length
      ? admin
          .from("payments")
          .select(
            "order_id,stripe_payment_intent_id,status,settlement_currency,settlement_amount,stripe_actual_fee,transfer_amount,transfer_currency"
          )
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as PaymentRow[] }),
    listingIds.length
      ? admin.from("listings").select("id,title").in("id", listingIds)
      : Promise.resolve({ data: [] as Pick<Listing, "id" | "title">[] }),
    sellerIds.length
      ? admin.from("profiles").select("id,display_name").in("id", sellerIds)
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "display_name">[] }),
  ]);

  const paymentByOrderId = new Map(
    ((paymentRows ?? []) as PaymentRow[])
      .filter((p) => p.status !== "amount_mismatch" && p.stripe_payment_intent_id)
      .map((p) => [p.order_id, { ...p }])
  );
  const titleById = new Map(
    ((listingRows ?? []) as Pick<Listing, "id" | "title">[]).map((l) => [l.id, l.title])
  );
  const sellerNameById = new Map(
    ((sellerRows ?? []) as Pick<Profile, "id" | "display_name">[]).map((p) => [
      p.id,
      p.display_name ?? "Anonymous",
    ])
  );

  // 老订单补 Stripe 实际入账/手续费。
  const missing = [...paymentByOrderId.values()]
    .filter((p) => p.settlement_amount === null)
    .slice(0, BACKFILL_LIMIT);
  await Promise.all(
    missing.map(async (p) => {
      const settlement = await recordSettlement(p.order_id, p.stripe_payment_intent_id!);
      if (settlement) Object.assign(p, settlement);
    })
  );

  const rows: Row[] = orders
    .filter((o) => paymentByOrderId.has(o.id))
    .map((order) => {
      const payment = paymentByOrderId.get(order.id)!;
      const fees = calculateFees(Number(order.amount), order.currency);
      const gross = fromMinorUnits(fees.grossMinor, fees.currency);
      const sellerNet = fromMinorUnits(fees.sellerNetMinor, fees.currency);
      const bucket: Row["bucket"] = RELEASED_STATUSES.includes(order.status)
        ? "released"
        : order.status === "cancelled"
          ? "cancelled"
          : "escrow";

      const settlementCurrency = payment.settlement_currency;
      const settlementAmount =
        payment.settlement_amount === null ? null : Number(payment.settlement_amount);
      const stripeFee =
        payment.stripe_actual_fee === null ? null : Number(payment.stripe_actual_fee);

      let sellerPayoutSettled: number | null = null;
      let platformNet: number | null = null;
      if (settlementAmount !== null && stripeFee !== null) {
        if (bucket === "cancelled") {
          // 全额退款,Stripe 不退原手续费:这笔手续费就是平台的亏损。
          sellerPayoutSettled = 0;
          platformNet = -stripeFee;
        } else {
          sellerPayoutSettled =
            bucket === "released" && payment.transfer_amount !== null
              ? Number(payment.transfer_amount)
              : // 还没放款:按这笔付款实际的汇率估算(同币种就是原值)。
                sellerNet * (settlementAmount / gross);
          platformNet = settlementAmount - sellerPayoutSettled - stripeFee;
        }
      }

      return {
        order,
        title: titleById.get(order.listing_id) ?? "Listing",
        sellerName: sellerNameById.get(order.seller_id) ?? "Anonymous",
        gross,
        serviceFee: fromMinorUnits(fees.serviceFeeMinor, fees.currency),
        processingFee: fromMinorUnits(fees.processingFeeMinor, fees.currency),
        sellerNet,
        settlementCurrency,
        settlementAmount,
        stripeFee,
        sellerPayoutSettled,
        platformNet,
        bucket,
      };
    });

  // 汇总(结算币种)。
  const totals = {
    received: new Map<string, number>(),
    escrowOwed: new Map<string, number>(),
    paidOut: new Map<string, number>(),
    refunded: new Map<string, number>(),
    platformFees: new Map<string, number>(),
    stripeFees: new Map<string, number>(),
    platformNet: new Map<string, number>(),
  };
  for (const r of rows) {
    const c = r.settlementCurrency;
    addTo(totals.received, c, r.settlementAmount);
    addTo(totals.stripeFees, c, r.stripeFee);
    addTo(totals.platformNet, c, r.platformNet);
    if (r.bucket === "cancelled") {
      addTo(totals.refunded, c, r.settlementAmount);
    } else {
      if (r.bucket === "escrow") addTo(totals.escrowOwed, c, r.sellerPayoutSettled);
      if (r.bucket === "released") addTo(totals.paidOut, c, r.sellerPayoutSettled);
      if (r.settlementAmount !== null && r.sellerPayoutSettled !== null) {
        addTo(totals.platformFees, c, r.settlementAmount - r.sellerPayoutSettled);
      }
    }
  }
  const unsettledCount = rows.filter((r) => r.settlementAmount === null).length;

  const cards: { label: string; value: string; hint: string }[] = [
    { label: "Buyers paid", value: formatTotals(totals.received), hint: "What landed in the platform's Stripe balance" },
    { label: "Owed to sellers (in escrow)", value: formatTotals(totals.escrowOwed), hint: "Not the platform's money — pay out on release" },
    { label: "Released to sellers", value: formatTotals(totals.paidOut), hint: "Transfers already sent to sellers' Stripe accounts" },
    { label: "Refunded to buyers", value: formatTotals(totals.refunded), hint: "Cancelled orders" },
    { label: "Platform fees earned", value: formatTotals(totals.platformFees), hint: `${SERVICE_FEE_RATE * 100}% service fee + processing fee` },
    { label: "Stripe fees paid", value: formatTotals(totals.stripeFees), hint: "Stripe's real cost, incl. refunded orders" },
    { label: "Platform net", value: formatTotals(totals.platformNet), hint: "Fees earned − Stripe fees" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Finance</h1>
      <p className="mt-2 text-zinc-600">
        Who each paid order&apos;s money belongs to: the seller&apos;s share, the platform&apos;s
        fees, and what Stripe actually charged. Platform-side totals are in the currency
        Stripe settled into (usually GBP).
      </p>

      {sellerFilter && (
        <p className="mt-4 text-sm text-zinc-700">
          Seller: <span className="font-medium">{sellerNameById.get(sellerFilter) ?? sellerFilter}</span>{" "}
          ·{" "}
          <Link href="/admin/finance" className="text-zinc-500 underline">
            Show all sellers
          </Link>
        </p>
      )}

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">{card.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{card.value}</p>
            <p className="mt-1 text-xs text-zinc-400">{card.hint}</p>
          </div>
        ))}
      </div>
      {unsettledCount > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {unsettledCount} order(s) still missing Stripe settlement data — reload the page to
          fetch more.
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
              <th className="py-2 pr-4">Order</th>
              <th className="py-2 pr-4">Seller</th>
              <th className="py-2 pr-4 text-right">Buyer paid</th>
              <th className="py-2 pr-4 text-right">Service fee</th>
              <th className="py-2 pr-4 text-right">Processing fee</th>
              <th className="py-2 pr-4 text-right">Seller receives</th>
              <th className="py-2 pr-4 text-right">Stripe fee (actual)</th>
              <th className="py-2 pr-4 text-right">Platform net</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cur = r.order.currency;
              const cancelled = r.bucket === "cancelled";
              return (
                <tr key={r.order.id} className="border-b border-zinc-100 align-top">
                  <td className="py-2 pr-4 text-zinc-900">
                    <div>{r.title}</div>
                    <div className="text-xs text-zinc-400">
                      {new Date(r.order.created_at).toLocaleDateString()} · {r.order.id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-zinc-600">
                    <Link
                      href={`/admin/finance?seller=${r.order.seller_id}`}
                      className="underline decoration-zinc-300 hover:decoration-zinc-900"
                    >
                      {r.sellerName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-900">
                    {money(r.gross, cur)}
                    {r.settlementCurrency && r.settlementCurrency !== cur && (
                      <div className="text-xs text-zinc-400">
                        ≈ {money(r.settlementAmount, r.settlementCurrency)}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-600">
                    {cancelled ? "—" : money(r.serviceFee, cur)}
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-600">
                    {cancelled ? "—" : money(r.processingFee, cur)}
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-900">
                    {cancelled ? "Refunded" : money(r.sellerNet, cur)}
                    {!cancelled &&
                      r.settlementCurrency &&
                      r.settlementCurrency !== cur &&
                      r.sellerPayoutSettled !== null && (
                        <div className="text-xs text-zinc-400">
                          {r.bucket === "released" ? "" : "≈ "}
                          {money(r.sellerPayoutSettled, r.settlementCurrency)}
                        </div>
                      )}
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-600">
                    {r.stripeFee === null ? "—" : `−${money(r.stripeFee, r.settlementCurrency)}`}
                  </td>
                  <td
                    className={`py-2 pr-4 text-right font-medium ${
                      r.platformNet !== null && r.platformNet < 0 ? "text-red-600" : "text-zinc-900"
                    }`}
                  >
                    {money(r.platformNet, r.settlementCurrency)}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {LISTING_ORDER_STATUS_LABELS[r.order.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && !error && (
          <p className="mt-8 text-center text-zinc-500">No paid orders yet.</p>
        )}
      </div>
    </div>
  );
}
