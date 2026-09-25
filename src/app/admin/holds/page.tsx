import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import { LISTING_ORDER_STATUS_LABELS, PAYOUT_HOLD_LABELS } from "@/lib/supabase/enums";
import { formatOrderNumber } from "@/lib/orders/orderNumber";
import type { ListingOrder, Payment, Profile } from "@/lib/supabase/types";
import { removeHoldAction } from "./actions";

const STRIPE_DASHBOARD = `https://dashboard.stripe.com${
  process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "" : "/test"
}`;

// 在 Stripe 后台退款/拒付之后被取消的订单(不是买卖双方自己在 24 小时内取消的)。
const REFUND_CANCEL_REASONS = ["manual_refund", "dispute_lost"];
const RECENT_LIMIT = 50;

// 拒付、退款纠纷、被封卖家的订单(2026-09-24 安全核查第 1 批,产品负责人要求管理员能一眼
// 看到这类订单)。暂停中的订单任何钱都不会动,直到管理员在这里点 "Remove hold"。
export default async function AdminHoldsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string; error?: string }>;
}) {
  await requireAdmin();
  const { removed, error } = await searchParams;
  const admin = createServiceClient();

  const [{ data: heldRows, error: heldError }, { data: refundedRows }] = await Promise.all([
    admin
      .from("listing_orders")
      .select("*")
      .not("payout_hold", "is", null)
      .order("payout_hold_at", { ascending: false }),
    admin
      .from("listing_orders")
      .select("*")
      .eq("status", "cancelled")
      .in("cancel_reason", REFUND_CANCEL_REASONS)
      .is("payout_hold", null)
      .order("cancelled_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);
  const held = (heldRows ?? []) as ListingOrder[];
  const refunded = (refundedRows ?? []) as ListingOrder[];
  const all = [...held, ...refunded];

  const orderIds = all.map((o) => o.id);
  const userIds = [...new Set(all.flatMap((o) => [o.buyer_id, o.seller_id]))];
  const listingIds = [...new Set(all.map((o) => o.listing_id))];
  const [{ data: userRows }, { data: paymentRows }, { data: listingRows }] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id,display_name,is_banned").in("id", userIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? admin
          .from("payments")
          .select("order_id,stripe_payment_intent_id,stripe_transfer_id,status")
          .in("order_id", orderIds)
          .neq("status", "amount_mismatch")
      : Promise.resolve({ data: [] }),
    listingIds.length
      ? admin.from("listings").select("id,title").in("id", listingIds)
      : Promise.resolve({ data: [] }),
  ]);
  const people = new Map(
    ((userRows ?? []) as Pick<Profile, "id" | "display_name" | "is_banned">[]).map((p) => [p.id, p])
  );
  const paymentByOrderId = new Map(
    ((paymentRows ?? []) as Pick<
      Payment,
      "order_id" | "stripe_payment_intent_id" | "stripe_transfer_id" | "status"
    >[]).map((p) => [p.order_id, p])
  );
  const titleById = new Map(
    ((listingRows ?? []) as { id: string; title: string }[]).map((l) => [l.id, l.title])
  );

  function stripeLinks(orderId: string) {
    const payment = paymentByOrderId.get(orderId);
    if (!payment?.stripe_payment_intent_id) return <span>—</span>;
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
            Payout (paid)
          </a>
        )}
      </div>
    );
  }

  function orderCell(order: ListingOrder) {
    const seller = people.get(order.seller_id);
    return (
      <div className="flex flex-col gap-0.5">
        <Link href={`/orders/${order.view_token}`} className="font-mono text-xs hover:underline">
          {formatOrderNumber(order.order_number)}
        </Link>
        <Link href={`/listings/${order.listing_id}`} className="text-zinc-900 hover:underline">
          {titleById.get(order.listing_id) ?? "Listing"}
        </Link>
        <span className="text-xs text-zinc-500">
          Seller:{" "}
          <Link href={`/admin/orders?seller=${order.seller_id}`} className="underline">
            {seller?.display_name ?? "Anonymous"}
          </Link>
          {seller?.is_banned && <span className="ml-1 text-red-600">(banned)</span>}
        </span>
        <span className="text-xs text-zinc-500">
          Buyer: {people.get(order.buyer_id)?.display_name ?? "Anonymous"}
          {order.buyer_email ? ` · ${order.buyer_email}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Disputes &amp; holds</h1>
      <p className="mt-2 max-w-3xl text-zinc-600">
        Orders with a paused payout — the buyer disputed the payment, money was refunded in
        Stripe outside the normal flow, or the seller was banned. No money moves on these
        orders until you remove the hold. To refund the buyer, refund the payment in Stripe;
        the order updates automatically. To pay the seller, remove the hold — the normal
        payout runs within the hour if the order is due.
      </p>

      {removed && (
        <p className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">
          Hold removed.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          Couldn&apos;t remove the hold, please try again.
        </p>
      )}
      {heldError && <p className="mt-4 text-sm text-red-600">{heldError.message}</p>}

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-zinc-500">
        On hold ({held.length})
      </h2>
      {held.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">Nothing on hold.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Why</th>
                <th className="py-2 pr-4">History</th>
                <th className="py-2 pr-4">Stripe</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {held.map((order) => (
                <tr key={order.id} className="border-b border-zinc-100 align-top">
                  <td className="py-3 pr-4">{orderCell(order)}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-zinc-600">
                    {order.amount} {order.currency}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-600">
                    {LISTING_ORDER_STATUS_LABELS[order.status]}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {order.payout_hold ? PAYOUT_HOLD_LABELS[order.payout_hold] : ""}
                    </span>
                    {order.payout_hold_at && (
                      <p className="mt-1 text-xs text-zinc-400">
                        since {new Date(order.payout_hold_at).toUTCString().replace(" GMT", " UTC")}
                      </p>
                    )}
                  </td>
                  <td className="max-w-sm whitespace-pre-wrap py-3 pr-4 text-xs text-zinc-500">
                    {order.payout_hold_note ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-500">{stripeLinks(order.id)}</td>
                  <td className="py-3 pr-4">
                    <ConfirmSubmitForm
                      action={removeHoldAction.bind(null, order.id)}
                      confirmMessage="Remove the hold? The order goes back to the normal flow, and the seller may be paid out automatically within the hour."
                      label="Remove hold"
                      className="whitespace-nowrap rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Refunded in Stripe / disputes lost (last {RECENT_LIMIT})
      </h2>
      {refunded.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">None.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">History</th>
                <th className="py-2 pr-4">Stripe</th>
              </tr>
            </thead>
            <tbody>
              {refunded.map((order) => (
                <tr key={order.id} className="border-b border-zinc-100 align-top">
                  <td className="py-3 pr-4">{orderCell(order)}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-zinc-600">
                    {order.amount} {order.currency}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-600">
                    {order.cancel_reason === "dispute_lost" ? "Dispute lost" : "Refunded in Stripe"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-500">
                    {order.cancelled_at ? new Date(order.cancelled_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="max-w-sm whitespace-pre-wrap py-3 pr-4 text-xs text-zinc-500">
                    {order.payout_hold_note ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-500">{stripeLinks(order.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
