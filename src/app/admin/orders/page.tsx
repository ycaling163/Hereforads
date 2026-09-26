import Link from "next/link";
import { isExpiredCheckout } from "@/lib/orders/checkoutExpiry";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { LISTING_ORDER_STATUS_LABELS } from "@/lib/supabase/enums";
import type { Listing, ListingOrder, Payment, Profile } from "@/lib/supabase/types";
import { formatOrderNumber, parseOrderNumber } from "@/lib/orders/orderNumber";

const RECENT_LIMIT = 200;

// 平台用的是 Charges & Transfers:买家的钱先全部进平台自己的 Stripe 余额,Stripe 后台
// 的 Payments 列表本身看不出属于哪个卖家(见 README"在 Stripe 里区分卖家")。这个页面
// 是"这笔钱属于谁"的账本:每行带 Stripe 付款/转账的直达链接,点卖家名按卖家筛选并汇总。
const STRIPE_DASHBOARD = `https://dashboard.stripe.com${
  process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "" : "/test"
}`;

// 钱现在在哪:托管中(平台余额里、还没给卖家)/ 已转给卖家 / 已退给买家。
const ESCROW_STATUSES: ListingOrder["status"][] = ["paid_in_escrow", "delivered", "confirmed"];
const RELEASED_STATUSES: ListingOrder["status"][] = ["released", "expired_auto_confirmed"];

function sumByCurrency(orders: ListingOrder[]): string {
  const totals = new Map<string, number>();
  for (const o of orders) {
    totals.set(o.currency, (totals.get(o.currency) ?? 0) + Number(o.amount));
  }
  if (totals.size === 0) return "—";
  return [...totals].map(([currency, total]) => `${total.toFixed(2)} ${currency}`).join(" · ");
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ seller?: string; q?: string }>;
}) {
  await requireAdmin();
  const { seller: sellerFilter, q } = await searchParams;
  // 按订单号(HFA-000118 / 118)或买家邮箱搜索,见 README"订单号与订单查询"。
  const search = (q ?? "").trim();
  const searchOrderNumber = search ? parseOrderNumber(search) : null;
  const admin = createServiceClient();
  let orderQuery = admin
    .from("listing_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);
  if (sellerFilter) {
    orderQuery = orderQuery.eq("seller_id", sellerFilter);
  }
  if (searchOrderNumber) {
    orderQuery = orderQuery.eq("order_number", searchOrderNumber);
  } else if (search) {
    // ilike 的 % 和 _ 是通配符,转义掉,按字面匹配邮箱片段。
    orderQuery = orderQuery.ilike("buyer_email", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  }
  const { data: orderRows, error } = await orderQuery;

  const orders = (orderRows ?? []) as ListingOrder[];
  // eslint-disable-next-line react-hooks/purity
  const loadedAt = Date.now();
  const orderIds = orders.map((o) => o.id);

  const listingIds = [...new Set(orders.map((o) => o.listing_id))];
  const userIds = [...new Set(orders.flatMap((o) => [o.buyer_id, o.seller_id]))];
  const [{ data: listingRows }, { data: userRows }, { data: paymentRows }] = await Promise.all([
    listingIds.length
      ? admin.from("listings").select("id,title").in("id", listingIds)
      : Promise.resolve({ data: [] as Pick<Listing, "id" | "title">[] }),
    userIds.length
      ? admin.from("profiles").select("id,display_name").in("id", userIds)
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "display_name">[] }),
    orderIds.length
      ? admin
          .from("payments")
          .select("order_id,stripe_payment_intent_id,stripe_transfer_id,status")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as Payment[] }),
  ]);
  const paymentByOrderId = new Map(
    ((paymentRows ?? []) as Pick<
      Payment,
      "order_id" | "stripe_payment_intent_id" | "stripe_transfer_id" | "status"
    >[])
      .filter((p) => p.status !== "amount_mismatch")
      .map((p) => [p.order_id, p])
  );
  const listingTitleById = new Map(
    ((listingRows ?? []) as Pick<Listing, "id" | "title">[]).map((l) => [l.id, l.title])
  );
  const nameById = new Map(
    ((userRows ?? []) as Pick<Profile, "id" | "display_name">[]).map((p) => [
      p.id,
      p.display_name ?? "Anonymous",
    ])
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Orders
      </h1>
      <p className="mt-2 text-zinc-600">
        Read-only view of the {RECENT_LIMIT} most recent orders platform-wide
        — for dispute/support lookups, not for editing order state.
      </p>

      <form action="/admin/orders" className="mt-6 flex gap-2">
        {sellerFilter && <input type="hidden" name="seller" value={sellerFilter} />}
        <input
          name="q"
          defaultValue={search}
          placeholder={`Order number (${formatOrderNumber(118)}) or buyer email`}
          className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
        />
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Search
        </button>
        {search && (
          <Link
            href={sellerFilter ? `/admin/orders?seller=${sellerFilter}` : "/admin/orders"}
            className="self-center text-sm text-zinc-500 underline"
          >
            Clear
          </Link>
        )}
      </form>

      {sellerFilter && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-700">
              Seller: <span className="font-medium">{nameById.get(sellerFilter) ?? sellerFilter}</span>
            </p>
            <Link href="/admin/orders" className="text-sm text-zinc-500 underline">
              Show all sellers
            </Link>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">In escrow (held by platform)</dt>
              <dd className="mt-1 text-zinc-900">
                {sumByCurrency(orders.filter((o) => ESCROW_STATUSES.includes(o.status)))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Released to seller</dt>
              <dd className="mt-1 text-zinc-900">
                {sumByCurrency(orders.filter((o) => RELEASED_STATUSES.includes(o.status)))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">Refunded to buyers</dt>
              <dd className="mt-1 text-zinc-900">
                {sumByCurrency(orders.filter((o) => o.status === "cancelled"))}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-zinc-400">Order amounts (what buyers paid), before fees.</p>
        </div>
      )}

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
              <th className="py-2 pr-4">Order</th>
              <th className="py-2 pr-4">Listing</th>
              <th className="py-2 pr-4">Buyer</th>
              <th className="py-2 pr-4">Buyer contact</th>
              <th className="py-2 pr-4">Seller</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-zinc-100">
                <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs text-zinc-600">
                  <Link href={`/orders/${order.view_token}`} className="hover:underline">
                    {formatOrderNumber(order.order_number)}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-zinc-900">
                  <Link href={`/listings/${order.listing_id}`} className="hover:underline">
                    {listingTitleById.get(order.listing_id) ?? "Listing"}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-zinc-600">
                  {nameById.get(order.buyer_id) ?? "Anonymous"}
                </td>
                {/* Guest 结账时从 Stripe Checkout 收集来的电话/地址(见 README
                    "Guest 联系方式留底"一节)——只在这个管理后台页面展示,纠纷/
                    支持排查用;/dashboard/sales 卖家看到的订单卡片不带这两列,
                    卖家不该看到买家的电话/地址。登录买家没走这段收集,电话/地址是空;
                    邮箱(buyer_email,2026-09-24 起下单时就存)所有买家都有。 */}
                <td className="py-2 pr-4 text-zinc-500">
                  {order.buyer_email || order.buyer_phone || order.buyer_address ? (
                    <div className="flex flex-col">
                      {order.buyer_email && <span>{order.buyer_email}</span>}
                      {order.buyer_phone && <span>{order.buyer_phone}</span>}
                      {order.buyer_address && (
                        <span className="text-xs text-zinc-400">{order.buyer_address}</span>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-4 text-zinc-600">
                  <Link
                    href={`/admin/orders?seller=${order.seller_id}`}
                    className="underline decoration-zinc-300 hover:decoration-zinc-900"
                    title="Show only this seller's orders"
                  >
                    {nameById.get(order.seller_id) ?? "Anonymous"}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-zinc-600">
                  {order.amount} {order.currency}
                </td>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {isExpiredCheckout(order, loadedAt)
                      ? "Checkout expired (not paid)"
                      : LISTING_ORDER_STATUS_LABELS[order.status]}
                  </span>
                </td>
                <td className="py-2 pr-4 text-zinc-500">
                  {new Date(order.created_at).toLocaleDateString()}
                </td>
                <td className="py-2 pr-4 text-xs text-zinc-500">
                  {(() => {
                    const payment = paymentByOrderId.get(order.id);
                    if (!payment?.stripe_payment_intent_id) return "—";
                    return (
                      <div className="flex flex-col">
                        <a
                          href={`${STRIPE_DASHBOARD}/payments/${payment.stripe_payment_intent_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Payment
                        </a>
                        {payment.stripe_transfer_id && (
                          <a
                            href={`${STRIPE_DASHBOARD}/connect/transfers/${payment.stripe_transfer_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            Payout
                          </a>
                        )}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && !error && (
          <p className="mt-8 text-center text-zinc-500">No orders yet.</p>
        )}
      </div>
    </div>
  );
}
