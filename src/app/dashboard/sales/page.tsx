import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeliverOrderForm, EditProofUrlForm } from "@/components/DeliverOrderForm";
import { ProofLinkHistory } from "@/components/ProofLinkHistory";
import { OrderSponsorPanel } from "@/components/OrderSponsorPanel";
import { getOrderSponsors } from "@/lib/sponsorData";
import { CancelOrderForm } from "@/components/CancelOrderForm";
import {
  LISTING_ORDER_STATUS_LABELS,
  PAYOUT_HOLD_LABELS,
  freeCancelDeadline,
} from "@/lib/supabase/enums";
import { PARTY_ORDER_COLUMNS, type PartyListingOrder } from "@/lib/supabase/types";
import { bookingToday, formatBookingDate, formatBookingRange } from "@/lib/booking";
import { formatOrderNumber } from "@/lib/orders/orderNumber";
import type {
  Listing,
  ListingOrder,
  ListingOrderProofChange,
  Payment,
  Profile,
} from "@/lib/supabase/types";
import { ListingThumb, coverOf } from "@/components/ListingThumb";

// 订单按"钱现在在哪"分成 4 个标签页(2026-09-24 产品负责人要求,避免各种状态
// 混在一起):托管中(默认,卖家要处理的都在这)/ 待付款 / 已完成 / 已取消。
// `confirmed` 只是放款前的一瞬间锁定态,`expired_auto_confirmed` 是旧标签(见 README
// "平台责任边界"一节),这两个都并到 Completed。
type TabKey = "escrow" | "awaiting" | "completed" | "cancelled";
const TABS: {
  key: TabKey;
  label: string;
  sections: { title: string; statuses: ListingOrder["status"][] }[];
  empty: string;
}[] = [
  {
    key: "escrow",
    label: "In escrow",
    sections: [
      { title: "New orders — mark as delivered", statuses: ["paid_in_escrow"] },
      { title: "Delivered — awaiting buyer confirmation", statuses: ["delivered"] },
    ],
    empty: "No paid orders waiting on you right now.",
  },
  {
    key: "awaiting",
    label: "Awaiting payment",
    sections: [{ title: "Checkout started, not paid yet", statuses: ["pending_payment"] }],
    empty: "No unpaid checkouts.",
  },
  {
    key: "completed",
    label: "Completed",
    sections: [
      { title: "Released to your Stripe account", statuses: ["confirmed", "released", "expired_auto_confirmed"] },
    ],
    empty: "No completed orders yet.",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    sections: [{ title: "Cancelled and refunded", statuses: ["cancelled"] }],
    empty: "No cancelled orders.",
  },
];

const ERROR_MESSAGES: Record<string, string> = {
  cancel_invalid_state: "This order can't be cancelled right now.",
  cancel_window_passed: "The 24-hour free cancellation window has passed.",
  cancel_starts_soon: "Bookings starting within 24 hours can't be cancelled for free.",
  cancel_failed: "Couldn't cancel the order, please try again.",
  cancel_pending:
    "The order is cancelled, but we couldn't confirm the refund with our payment provider yet — our team is checking it and will email you.",
  on_hold: "This order is on hold while we review it — we'll be in touch by email.",
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    cancelled?: string;
    tab?: string;
    link_updated?: string;
  }>;
}) {
  const { error: actionError, cancelled, tab, link_updated: linkUpdated } = await searchParams;
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: orderRows, error } = await supabase
    .from("listing_orders")
    .select(PARTY_ORDER_COLUMNS)
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const orders = (orderRows ?? []) as unknown as PartyListingOrder[];

  const orderIds = orders.map((o) => o.id);
  const sponsorsByOrderId = await getOrderSponsors(orderIds);
  const listingIds = [...new Set(orders.map((o) => o.listing_id))];
  const buyerIds = [...new Set(orders.map((o) => o.buyer_id))];
  const [{ data: listingRows }, { data: paymentRows }, { data: buyerRows }] =
    await Promise.all([
      listingIds.length
        ? supabase.from("listings").select("id,title,media_urls").in("id", listingIds)
        : Promise.resolve({ data: [] as Pick<Listing, "id" | "title" | "media_urls">[] }),
      orderIds.length
        ? supabase.from("payments").select("*").in("order_id", orderIds)
        : Promise.resolve({ data: [] as Payment[] }),
      buyerIds.length
        ? supabase.from("profiles").select("id,display_name").in("id", buyerIds)
        : Promise.resolve({ data: [] as Pick<Profile, "id" | "display_name">[] }),
    ]);
  const listingRowsTyped = (listingRows ?? []) as Pick<Listing, "id" | "title" | "media_urls">[];
  const listingsById = new Map(listingRowsTyped.map((l) => [l.id, l.title]));
  const coversById = new Map(listingRowsTyped.map((l) => [l.id, coverOf(l.media_urls)]));
  // 卖家改过交付链接的记录(RLS 只返回自己订单的)。
  const { data: proofChangeRows } = orderIds.length
    ? await supabase
        .from("listing_order_proof_changes")
        .select("*")
        .in("order_id", orderIds)
        .order("changed_at", { ascending: true })
    : { data: [] };
  const proofChangesByOrderId = new Map<string, ListingOrderProofChange[]>();
  for (const change of (proofChangeRows ?? []) as ListingOrderProofChange[]) {
    proofChangesByOrderId.set(change.order_id, [
      ...(proofChangesByOrderId.get(change.order_id) ?? []),
      change,
    ]);
  }

  // amount_mismatch 行(webhook 核对金额没通过时留的记录)不是真正的托管付款,不展示。
  const paymentsByOrderId = new Map(
    ((paymentRows ?? []) as Payment[])
      .filter((p) => p.status !== "amount_mismatch")
      .map((p) => [p.order_id, p])
  );
  // Server Component, re-rendered fresh on every request (see dashboard/page.tsx).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const today = bookingToday(new Date(now));
  const buyerNameById = new Map(
    ((buyerRows ?? []) as Pick<Profile, "id" | "display_name">[]).map((b) => [
      b.id,
      b.display_name ?? "Anonymous buyer",
    ])
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Sales
      </h1>
      <p className="mt-2 text-zinc-600">Orders buyers placed on your listings</p>

      {linkUpdated && (
        <p className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">
          Delivery link updated — we&apos;ve emailed the buyer, and their 3-day check has restarted.
        </p>
      )}
      {cancelled && (
        <p className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">
          Order cancelled — the buyer has been refunded in full.
        </p>
      )}
      {actionError && ERROR_MESSAGES[actionError] && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          {ERROR_MESSAGES[actionError]}
        </p>
      )}

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      {!error && orders.length === 0 && (
        <p className="mt-16 text-center text-zinc-500">No orders yet.</p>
      )}

      {!error && orders.length > 0 && (
        <nav className="mt-8 flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
          {TABS.map((t) => {
            const count = orders.filter((o) =>
              t.sections.some((section) => section.statuses.includes(o.status))
            ).length;
            const isActive = t.key === activeTab.key;
            return (
              <Link
                key={t.key}
                href={`/dashboard/sales?tab=${t.key}`}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {t.label} ({count})
              </Link>
            );
          })}
        </nav>
      )}

      {!error &&
        orders.length > 0 &&
        !orders.some((o) =>
          activeTab.sections.some((section) => section.statuses.includes(o.status))
        ) && <p className="mt-10 text-center text-sm text-zinc-500">{activeTab.empty}</p>}

      {activeTab.sections.map(({ title, statuses }) => {
        const sectionOrders = orders.filter((o) => statuses.includes(o.status));
        if (sectionOrders.length === 0) return null;

        return (
          <div key={title} className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              {title} ({sectionOrders.length})
            </h2>
            <div className="mt-3 flex flex-col gap-4">
              {sectionOrders.map((order) => {
                const payment = paymentsByOrderId.get(order.id);
                const cancelDeadline = freeCancelDeadline(order);
                const canCancel =
                  !order.payout_hold &&
                  order.status === "paid_in_escrow" &&
                  cancelDeadline !== null &&
                  cancelDeadline.getTime() > now;
                return (
                  <div key={order.id} className="rounded-xl border border-zinc-200 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/listings/${order.listing_id}`}
                        className="flex items-center gap-3 font-medium text-zinc-900 hover:underline"
                      >
                        <ListingThumb url={coversById.get(order.listing_id)} />
                        {listingsById.get(order.listing_id) ?? "Listing"}
                      </Link>
                      <span className="text-xs text-zinc-400">
                        {formatOrderNumber(order.order_number)}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                        {LISTING_ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
                      <span>
                        {order.amount} {order.currency}
                      </span>
                      <span>·</span>
                      <span>
                        Buyer:{" "}
                        <Link href={`/sellers/${order.buyer_id}`} className="underline">
                          {buyerNameById.get(order.buyer_id) ?? "Anonymous buyer"}
                        </Link>
                      </span>
                      <Link
                        href={`/dashboard/messages/${order.listing_id}/${order.buyer_id}`}
                        className="underline"
                      >
                        Message buyer
                      </Link>
                    </div>
                    {order.start_date && order.end_date && (
                      <p className="mt-1 text-sm text-zinc-700">
                        Booked: {formatBookingRange(order.start_date, order.end_date)}{" "}
                        <span className="text-zinc-400">(UK time)</span>
                      </p>
                    )}

                    {order.payout_hold && (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        On hold — under review ({PAYOUT_HOLD_LABELS[order.payout_hold]}). The
                        payout is paused until our team has looked at it; we&apos;ll email you.
                      </p>
                    )}

                    {payment && order.status === "cancelled" && (
                      <p className="mt-3 text-xs text-zinc-500">
                        {order.cancel_reason === "free_24h"
                          ? "Refunded to the buyer in full — no fees charged to you."
                          : "Refunded to the buyer."}
                      </p>
                    )}

                    {payment && order.status !== "cancelled" && (
                      <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
                        <div className="flex justify-between">
                          <span>Gross sale</span>
                          <span>
                            {order.amount} {order.currency}
                          </span>
                        </div>
                        {payment.platform_fee_amount !== null && (
                          <div className="flex justify-between">
                            <span>Service fee</span>
                            <span>
                              −{payment.platform_fee_amount} {order.currency}
                            </span>
                          </div>
                        )}
                        {payment.stripe_fee_amount !== null && (
                          <div className="flex justify-between">
                            <span>Payment processing fee</span>
                            <span>
                              −{payment.stripe_fee_amount} {order.currency}
                            </span>
                          </div>
                        )}
                        {payment.net_amount !== null && (
                          <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1 font-medium text-zinc-900">
                            <span>
                              {payment.status === "released" ? "You received" : "You'll receive"}
                            </span>
                            <span>
                              {payment.net_amount} {order.currency}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {order.status === "paid_in_escrow" &&
                      (order.start_date && order.start_date > today ? (
                        <p className="mt-3 text-xs text-zinc-500">
                          Put the ad live on {formatBookingDate(order.start_date)} and submit
                          the live link here from that day.
                        </p>
                      ) : (
                        <DeliverOrderForm orderId={order.id} />
                      ))}

                    {canCancel && cancelDeadline && (
                      <CancelOrderForm
                        orderId={order.id}
                        returnTo="sales"
                        deadline={cancelDeadline}
                      />
                    )}

                    {order.proof_url && (
                      <p className="mt-3 text-sm text-zinc-500">
                        Proof:{" "}
                        <a
                          href={order.proof_url}
                          className="underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {order.proof_url}
                        </a>
                      </p>
                    )}
                    {order.proof_url && order.status === "delivered" && (
                      <EditProofUrlForm orderId={order.id} currentUrl={order.proof_url} />
                    )}
                    <ProofLinkHistory changes={proofChangesByOrderId.get(order.id) ?? []} />

                    {sponsorsByOrderId.has(order.id) && (
                      <OrderSponsorPanel
                        orderId={order.id}
                        sponsor={sponsorsByOrderId.get(order.id)!}
                        role="seller"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
