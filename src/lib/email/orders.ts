import { calculateFees, formatMoney } from "@/lib/fees";
import { ESCROW_HOLD_DAYS, FREE_CANCEL_HOURS } from "@/lib/supabase/enums";
import { getUserEmail, sendEmail } from "./send";
import { formatBookingRange } from "@/lib/booking";
import { formatOrderNumber } from "@/lib/orders/orderNumber";
import { loadOrderSummary, type OrderSummary } from "@/lib/orders/summary";

// 订单各节点的通知邮件。调用方(webhook / server action)在状态已经成功推进之后
// 才调用,每个节点只调用一次(状态条件更新保证),所以这里不再做去重。
//
// 2026-09-24 起每封都带订单号(HFA-000118)和订单详情;买家邮件的按钮指向订单专属只读页
// /orders/<view_token>,guest 不用登录也能打开(见 README"订单号与订单查询")。

function price(summary: OrderSummary): string {
  const fees = calculateFees(Number(summary.order.amount), summary.order.currency);
  return formatMoney(fees.grossMinor, fees.currency);
}

function orderNo(summary: OrderSummary): string {
  return formatOrderNumber(summary.order.order_number);
}

// 买卖双方邮件共用的订单详情表。
function orderDetails(summary: OrderSummary): [string, string][] {
  const { order } = summary;
  return [
    ["Order number", orderNo(summary)],
    ["Ad", summary.listingTitle],
    ...(summary.adTypeLabel ? ([["Ad type", summary.adTypeLabel]] as [string, string][]) : []),
    ...(summary.placement ? ([["Runs on", summary.placement]] as [string, string][]) : []),
    ["Seller", summary.sellerName],
    ...(order.start_date && order.end_date
      ? ([
          ["Booked dates", `${formatBookingRange(order.start_date, order.end_date)} (UK time)`],
        ] as [string, string][])
      : []),
    ["Amount", price(summary)],
    ...(order.paid_at
      ? ([["Paid", new Date(order.paid_at).toUTCString().replace(" GMT", " UTC")]] as [
          string,
          string,
        ][])
      : []),
  ];
}

function buyerCta(summary: OrderSummary, label = "View my order") {
  return { label, path: `/orders/${summary.order.view_token}` };
}

async function buyerEmailOf(summary: OrderSummary): Promise<string | null> {
  return summary.order.buyer_email ?? (await getUserEmail(summary.order.buyer_id));
}

export async function sendOrderPaidEmails(orderId: string) {
  const summary = await loadOrderSummary({ id: orderId });
  if (!summary) return;
  const { order } = summary;
  const fees = calculateFees(Number(order.amount), order.currency);
  const booking = !!order.start_date;
  const [buyerEmail, sellerEmail] = await Promise.all([
    buyerEmailOf(summary),
    getUserEmail(order.seller_id),
  ]);

  await Promise.all([
    sendEmail(buyerEmail, {
      subject: `Order confirmed ${orderNo(summary)}: ${summary.listingTitle}`,
      paragraphs: [
        `Thanks for your order. We've received your payment of ${price(summary)}. Keep this email — your order number is ${orderNo(summary)}.`,
        ...(booking
          ? [
              "Your payment is held securely and released to the seller after the ad has run.",
              `You can cancel for a full refund within ${FREE_CANCEL_HOURS} hours of payment, as long as the booking starts more than ${FREE_CANCEL_HOURS} hours later.`,
            ]
          : [
              `Your payment is held securely and only released to the seller after they deliver and you confirm (or ${ESCROW_HOLD_DAYS} days after delivery if you don't respond).`,
              `You can cancel for a full refund within ${FREE_CANCEL_HOURS} hours of payment, as long as the seller hasn't delivered yet.`,
            ]),
      ],
      details: orderDetails(summary),
      cta: buyerCta(summary),
    }),
    sendEmail(sellerEmail, {
      subject: `New order ${orderNo(summary)}: ${summary.listingTitle}`,
      paragraphs: [
        `You have a new order${order.buyer_name ? ` from ${order.buyer_name}` : ""}. You'll receive ${formatMoney(fees.sellerNetMinor, fees.currency)} after fees once it's released.`,
        ...(booking
          ? [
              "Please put the ad live on the start date and submit the live link on your Sales page from that day.",
              `The buyer can cancel for a full refund within ${FREE_CANCEL_HOURS} hours of payment, unless the booking starts within ${FREE_CANCEL_HOURS} hours.`,
            ]
          : [
              "Please deliver within the agreed time and mark the order as delivered with a link the buyer can check.",
              `The buyer can cancel for a full refund within ${FREE_CANCEL_HOURS} hours of payment if you haven't delivered yet.`,
            ]),
      ],
      details: orderDetails(summary),
      cta: { label: "Go to your sales", path: "/dashboard/sales" },
    }),
  ]);
}

export async function sendOrderDeliveredEmail(orderId: string) {
  const summary = await loadOrderSummary({ id: orderId });
  if (!summary) return;
  const { order } = summary;
  await sendEmail(await buyerEmailOf(summary), {
    subject: `Delivered ${orderNo(summary)}: ${summary.listingTitle}`,
    paragraphs: [
      `The seller has marked your order ${orderNo(summary)} as delivered.`,
      ...(order.proof_url ? [`Check the delivery here: ${order.proof_url}`] : []),
      order.start_date
        ? "Please check your ad is live. If it isn't, message the seller. Payment is released to the seller after the booking ends."
        : `Please check it and confirm. If you don't respond within ${ESCROW_HOLD_DAYS} days, payment is released to the seller automatically. If something's wrong, message the seller before then.`,
    ],
    details: orderDetails(summary),
    cta: buyerCta(summary, "Review my order"),
  });
}

export async function sendOrderProofUpdatedEmail(orderId: string) {
  const summary = await loadOrderSummary({ id: orderId });
  if (!summary) return;
  const { order } = summary;
  await sendEmail(await buyerEmailOf(summary), {
    subject: `Delivery link updated ${orderNo(summary)}: ${summary.listingTitle}`,
    paragraphs: [
      `The seller has changed the delivery link for your order ${orderNo(summary)}.`,
      ...(order.proof_url ? [`New link: ${order.proof_url}`] : []),
      order.start_date
        ? "Please check your ad is live. If it isn't, message the seller. Payment is released to the seller after the booking ends."
        : `Your ${ESCROW_HOLD_DAYS}-day check starts again from now. If you don't respond within ${ESCROW_HOLD_DAYS} days, payment is released to the seller automatically. If something's wrong, message the seller before then.`,
    ],
    details: orderDetails(summary),
    cta: buyerCta(summary, "Review my order"),
  });
}

export async function sendOrderCancelledEmails(orderId: string, cancelledBy: string) {
  const summary = await loadOrderSummary({ id: orderId });
  if (!summary) return;
  const { order } = summary;
  const [buyerEmail, sellerEmail] = await Promise.all([
    buyerEmailOf(summary),
    getUserEmail(order.seller_id),
  ]);
  const byBuyer = cancelledBy === order.buyer_id;

  await Promise.all([
    sendEmail(buyerEmail, {
      subject: `Order cancelled ${orderNo(summary)}: ${summary.listingTitle}`,
      paragraphs: [
        byBuyer
          ? `You cancelled your order ${orderNo(summary)}.`
          : `The seller cancelled your order ${orderNo(summary)}.`,
        `A full refund of ${price(summary)} is on its way to your original payment method. It usually shows up within 5–10 business days.`,
      ],
      details: orderDetails(summary),
      cta: buyerCta(summary),
    }),
    sendEmail(sellerEmail, {
      subject: `Order cancelled ${orderNo(summary)}: ${summary.listingTitle}`,
      paragraphs: [
        byBuyer
          ? `The buyer cancelled order ${orderNo(summary)} within the free cancellation window.`
          : `You cancelled order ${orderNo(summary)}.`,
        "The buyer has been refunded in full. No fees were charged to you.",
      ],
      details: orderDetails(summary),
      cta: { label: "Go to your sales", path: "/dashboard/sales" },
    }),
  ]);
}
