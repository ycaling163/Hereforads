import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import { CancelOrderForm } from "@/components/CancelOrderForm";
import { ProofLinkHistory } from "@/components/ProofLinkHistory";
import { isExpiredCheckout } from "@/lib/orders/checkoutExpiry";
import { OrderSponsorPanel } from "@/components/OrderSponsorPanel";
import { getOrderSponsors } from "@/lib/sponsorData";
import {
  LISTING_ORDER_STATUS_LABELS,
  PAYOUT_HOLD_LABELS,
  freeCancelDeadline,
} from "@/lib/supabase/enums";
import { formatBookingRange } from "@/lib/booking";
import { formatOrderNumber } from "@/lib/orders/orderNumber";
import { releaseNowAction } from "./actions";
import {
  PARTY_ORDER_COLUMNS,
  type Listing,
  type ListingOrderProofChange,
  type PartyListingOrder,
} from "@/lib/supabase/types";
import { ListingThumb, coverOf } from "@/components/ListingThumb";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "This order can't be confirmed right now.",
  update_failed: "Couldn't update the order, please try again.",
  payout_failed:
    "Order was confirmed, but releasing the payout to the seller failed — we'll retry automatically.",
  cancel_invalid_state: "This order can't be cancelled right now.",
  cancel_window_passed: "The 24-hour free cancellation window has passed.",
  cancel_starts_soon: "Bookings starting within 24 hours can't be cancelled for free.",
  cancel_failed: "Couldn't cancel the order, please try again.",
  cancel_pending:
    "The order is cancelled, but we couldn't confirm the refund with our payment provider yet — our team is checking it and will email you.",
  on_hold: "This order is on hold while we review it — we'll be in touch by email.",
};

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkout?: string; cancelled?: string }>;
}) {
  const { error, checkout, cancelled } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: orderRows } = await supabase
    .from("listing_orders")
    .select(PARTY_ORDER_COLUMNS)
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  // 付款链接已过期、没付款的订单不显示(想买可以回广告页重新下单),见
  // src/lib/orders/checkoutExpiry.ts。
  // eslint-disable-next-line react-hooks/purity
  const loadedAt = Date.now();
  const orders = ((orderRows ?? []) as unknown as PartyListingOrder[]).filter(
    (o) => !isExpiredCheckout(o, loadedAt)
  );

  const listingIds = [...new Set(orders.map((o) => o.listing_id))];
  const orderIds = orders.map((o) => o.id);
  const sponsorsByOrderId = await getOrderSponsors(orderIds);
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

  const { data: listingRows } = listingIds.length
    ? await supabase.from("listings").select("id,title,media_urls").in("id", listingIds)
    : { data: [] };
  // Server Component, re-rendered fresh on every request (see dashboard/page.tsx).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const listingRowsTyped = (listingRows ?? []) as Pick<Listing, "id" | "title" | "media_urls">[];
  const listingsById = new Map(listingRowsTyped.map((l) => [l.id, l.title]));
  const coversById = new Map(listingRowsTyped.map((l) => [l.id, coverOf(l.media_urls)]));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Purchases
      </h1>
      <p className="mt-2 text-zinc-600">Orders you&apos;ve placed on other sellers&apos; listings</p>

      {checkout === "success" && (
        <p className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">
          Payment received — it&apos;s held in escrow until the seller delivers.
        </p>
      )}
      {cancelled && (
        <p className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">
          Order cancelled — you&apos;ll be refunded in full to your original payment method.
        </p>
      )}
      {error && ERROR_MESSAGES[error] && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          {ERROR_MESSAGES[error]}
        </p>
      )}

      {orders.length === 0 ? (
        <p className="mt-16 text-center text-zinc-500">No purchases yet.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {orders.map((order) => {
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
              <p className="mt-1 text-sm text-zinc-500">
                {order.amount} {order.currency}
              </p>
              {order.start_date && order.end_date && (
                <p className="mt-1 text-sm text-zinc-700">
                  Booked: {formatBookingRange(order.start_date, order.end_date)}{" "}
                  <span className="text-zinc-400">(UK time)</span>
                </p>
              )}

              {order.payout_hold && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  On hold — under review ({PAYOUT_HOLD_LABELS[order.payout_hold]}). No money will
                  move on this order until our team has looked at it.
                </p>
              )}

              {order.status === "delivered" && (
                <div className="mt-3 flex flex-col gap-2">
                  {order.proof_url && (
                    <a
                      href={order.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-zinc-600 underline"
                    >
                      Check delivery: {order.proof_url}
                    </a>
                  )}
                  {order.start_date ? (
                    <p className="text-xs text-zinc-400">
                      The seller says your ad is live. If it isn&apos;t, message the seller.
                      Payment is released to the seller after the booking ends.
                    </p>
                  ) : order.payout_hold ? null : (
                    <>
                      <ConfirmSubmitForm
                        action={releaseNowAction.bind(null, order.id)}
                        confirmMessage="Confirm you received this? This releases payment to the seller."
                        label="Confirm receipt"
                        className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                      />
                      <p className="text-xs text-zinc-400">
                        Auto-confirms 3 days after delivery if you don&apos;t respond.
                      </p>
                    </>
                  )}
                </div>
              )}

              <ProofLinkHistory changes={proofChangesByOrderId.get(order.id) ?? []} />

              {sponsorsByOrderId.has(order.id) && (
                <OrderSponsorPanel
                  orderId={order.id}
                  sponsor={sponsorsByOrderId.get(order.id)!}
                  role="buyer"
                />
              )}

              {canCancel && cancelDeadline && (
                <CancelOrderForm
                  orderId={order.id}
                  returnTo="purchases"
                  deadline={cancelDeadline}
                />
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
