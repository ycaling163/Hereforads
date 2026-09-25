import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProofLinkHistory } from "@/components/ProofLinkHistory";
import { createServiceClient } from "@/lib/supabase/service";
import { loadOrderSummary } from "@/lib/orders/summary";
import { formatOrderNumber } from "@/lib/orders/orderNumber";
import { formatBookingRange } from "@/lib/booking";
import {
  ESCROW_HOLD_DAYS,
  LISTING_ORDER_STATUS_LABELS,
  freeCancelDeadline,
} from "@/lib/supabase/enums";
import type { ListingOrder, ListingOrderProofChange } from "@/lib/supabase/types";
import { sendOrderSignInLinkAction } from "./actions";
import { Turnstile } from "@/components/Turnstile";
import { TURNSTILE_FAILED_MESSAGE } from "@/lib/security/turnstile";

// 带 view_token 的链接只在买家邮件里,不要被搜索引擎收录,也不要通过 Referer 泄露出去。
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nextStep(order: ListingOrder): string {
  const booking = !!order.start_date;
  switch (order.status) {
    case "pending_payment":
      return "Payment hasn't been completed for this order.";
    case "paid_in_escrow":
      return booking
        ? "Your payment is held securely. The seller will put your ad live on the start date and share the live link here."
        : "Your payment is held securely until the seller delivers. You'll get an email when they do.";
    case "delivered":
      return booking
        ? "The seller says your ad is live — check the link below. If it isn't, message the seller. Payment is released to the seller after the booking ends."
        : `The seller has delivered — check the link below. Sign in to confirm, or payment is released to the seller automatically ${ESCROW_HOLD_DAYS} days after delivery. If something's wrong, message the seller before then.`;
    case "confirmed":
    case "released":
    case "expired_auto_confirmed":
      return "Completed — payment has been released to the seller.";
    case "cancelled":
      return "This order was cancelled and refunded to your original payment method.";
  }
}

// 订单只读页(2026-09-24 加,见 README"订单号与订单查询"):买家邮件里的 "View my order"
// 链接,或者 /orders/find 用订单号 + 邮箱查到后跳到这里。不需要登录;取消、确认收货这类
// 操作仍然要登录后在 Purchases 页做(防止拿到链接的人替买家操作)。
export default async function OrderViewPage({
  params,
  searchParams,
}: PageProps<"/orders/[token]">) {
  const { token } = await params;
  const { link } = await searchParams;
  if (!TOKEN_PATTERN.test(token)) notFound();

  const summary = await loadOrderSummary({ viewToken: token });
  if (!summary) notFound();
  const { order } = summary;

  const { data: changeRows } = await createServiceClient()
    .from("listing_order_proof_changes")
    .select("*")
    .eq("order_id", order.id)
    .order("changed_at", { ascending: true });

  // Server Component, re-rendered fresh on every request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const cancelDeadline = freeCancelDeadline(order);
  const canCancel =
    !order.payout_hold &&
    order.status === "paid_in_escrow" && cancelDeadline !== null && cancelDeadline.getTime() > now;

  const rows: [string, React.ReactNode][] = [
    ["Order number", formatOrderNumber(order.order_number)],
    [
      "Ad",
      <Link key="ad" href={`/listings/${order.listing_id}`} className="underline">
        {summary.listingTitle}
      </Link>,
    ],
    ...(summary.adTypeLabel ? ([["Ad type", summary.adTypeLabel]] as [string, string][]) : []),
    ...(summary.placement ? ([["Runs on", summary.placement]] as [string, string][]) : []),
    [
      "Seller",
      <Link key="seller" href={`/sellers/${order.seller_id}`} className="underline">
        {summary.sellerName}
      </Link>,
    ],
    ...(order.start_date && order.end_date
      ? ([
          ["Booked dates", `${formatBookingRange(order.start_date, order.end_date)} (UK time)`],
        ] as [string, string][])
      : []),
    ["Amount", `${order.amount} ${order.currency}`],
    ...(order.paid_at
      ? ([["Paid", new Date(order.paid_at).toUTCString().replace(" GMT", " UTC")]] as [
          string,
          string,
        ][])
      : []),
    ["Status", LISTING_ORDER_STATUS_LABELS[order.status]],
  ];

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <p className="text-sm text-zinc-500">HereForAds order</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
        {formatOrderNumber(order.order_number)}
      </h1>

      <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        {nextStep(order)}
      </p>
      {order.payout_hold && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This order is on hold while our team reviews it. No money will move until then —
          we&apos;ll be in touch by email.
        </p>
      )}

      <dl className="mt-6 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="text-right text-zinc-900">{value}</dd>
          </div>
        ))}
        {order.proof_url && (
          <div className="px-4 py-2.5">
            <dt className="text-zinc-500">Delivery link</dt>
            <dd className="mt-1 break-all">
              <a href={order.proof_url} target="_blank" rel="noreferrer" className="underline">
                {order.proof_url}
              </a>
              <ProofLinkHistory changes={(changeRows ?? []) as ListingOrderProofChange[]} />
            </dd>
          </div>
        )}
      </dl>

      {canCancel && cancelDeadline && (
        <p className="mt-4 text-sm text-zinc-600">
          You can cancel for a full refund until{" "}
          {cancelDeadline.toUTCString().replace(" GMT", " UTC")} — sign in to cancel.
        </p>
      )}

      <div className="mt-8 flex flex-col gap-2 rounded-xl border border-zinc-200 p-4">
        <p className="text-sm text-zinc-700">
          To message the seller, confirm delivery or cancel, sign in with the email you used
          for this order. No password needed — we&apos;ll email you a link.
        </p>
        {link === "sent" && (
          <p className="text-sm text-green-700">
            Sign-in email sent — check your inbox (and spam folder). Click the link, or{" "}
            <Link href="/login?code=1" className="underline">
              enter the 6-digit code
            </Link>{" "}
            on the login page.
          </p>
        )}
        {link === "wait" && (
          <p className="text-sm text-red-600">
            We just sent one — please wait a while before asking for another.
          </p>
        )}
        {link === "captcha" && (
          <p className="text-sm text-red-600">{TURNSTILE_FAILED_MESSAGE}</p>
        )}
        <form
          action={sendOrderSignInLinkAction.bind(null, token)}
          className="flex flex-col gap-2"
        >
          <Turnstile resetKey={link} />
          <button
            type="submit"
            className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Email me a sign-in link
          </button>
        </form>
      </div>
    </div>
  );
}
