import { createServiceClient } from "@/lib/supabase/service";
import { calculateFees, formatMoney } from "@/lib/fees";
import { ESCROW_HOLD_DAYS, FREE_CANCEL_HOURS } from "@/lib/supabase/enums";
import { getUserEmail, sendEmail } from "./send";
import { formatBookingRange } from "@/lib/booking";

// 订单各节点的通知邮件。调用方(webhook / server action)在状态已经成功推进之后
// 才调用,每个节点只调用一次(状态条件更新保证),所以这里不再做去重。

interface OrderForEmail {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  currency: string;
  buyer_email?: string | null;
  proof_url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

async function loadOrder(orderId: string): Promise<(OrderForEmail & { title: string }) | null> {
  const service = createServiceClient();
  const { data: order } = await service
    .from("listing_orders")
    .select("id,listing_id,buyer_id,seller_id,amount,currency,buyer_email,proof_url,start_date,end_date")
    .eq("id", orderId)
    .single();
  if (!order) return null;
  const { data: listing } = await service
    .from("listings")
    .select("title")
    .eq("id", order.listing_id)
    .single();
  return { ...(order as OrderForEmail), title: listing?.title ?? "your ad" };
}

// 日历预订的订单:"Booked: 12 Oct – 21 Oct 2026 (UK time)"。
function bookedDates(order: OrderForEmail): string | null {
  return order.start_date && order.end_date
    ? `Booked dates: ${formatBookingRange(order.start_date, order.end_date)} (UK time).`
    : null;
}

function price(order: OrderForEmail): string {
  const fees = calculateFees(Number(order.amount), order.currency);
  return formatMoney(fees.grossMinor, fees.currency);
}

export async function sendOrderPaidEmails(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order) return;
  const fees = calculateFees(Number(order.amount), order.currency);
  const dates = bookedDates(order);
  const [buyerEmail, sellerEmail] = await Promise.all([
    order.buyer_email ? Promise.resolve(order.buyer_email) : getUserEmail(order.buyer_id),
    getUserEmail(order.seller_id),
  ]);

  await Promise.all([
    sendEmail(buyerEmail, {
      subject: `Order confirmed: ${order.title}`,
      paragraphs: [
        `Thanks for your order. We've received your payment of ${price(order)} for "${order.title}".`,
        ...(dates
          ? [
              dates,
              "Your payment is held securely and released to the seller after the ad has run.",
              `You can cancel for a full refund within ${FREE_CANCEL_HOURS} hours of payment, as long as the booking starts more than ${FREE_CANCEL_HOURS} hours later.`,
            ]
          : [
              "Your payment is held securely and only released to the seller after they deliver and you confirm (or 3 days after delivery if you don't respond).",
              `You can cancel for a full refund within ${FREE_CANCEL_HOURS} hours of payment, as long as the seller hasn't delivered yet.`,
            ]),
        "If you checked out as a guest, log in with the link we emailed you to track this order.",
      ],
      cta: { label: "View your order", path: "/dashboard/purchases" },
    }),
    sendEmail(sellerEmail, {
      subject: `New order: ${order.title}`,
      paragraphs: [
        `You have a new order for "${order.title}" (${price(order)}). You'll receive ${formatMoney(fees.sellerNetMinor, fees.currency)} after fees once it's released.`,
        ...(dates
          ? [
              dates,
              "Please put the ad live on the start date and submit the live link on your Sales page from that day.",
              `The buyer can cancel for a full refund within ${FREE_CANCEL_HOURS} hours of payment, unless the booking starts within ${FREE_CANCEL_HOURS} hours.`,
            ]
          : [
              "Please deliver within the agreed time and mark the order as delivered with a link the buyer can check.",
              `The buyer can cancel for a full refund within ${FREE_CANCEL_HOURS} hours of payment if you haven't delivered yet.`,
            ]),
      ],
      cta: { label: "Go to your sales", path: "/dashboard/sales" },
    }),
  ]);
}

export async function sendOrderDeliveredEmail(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order) return;
  const buyerEmail = order.buyer_email ?? (await getUserEmail(order.buyer_id));
  await sendEmail(buyerEmail, {
    subject: `Delivered: ${order.title}`,
    paragraphs: [
      `The seller has marked "${order.title}" as delivered.`,
      ...(order.proof_url ? [`Check the delivery here: ${order.proof_url}`] : []),
      order.start_date
        ? "Please check your ad is live. If it isn't, message the seller. Payment is released to the seller after the booking ends."
        : `Please check it and confirm. If you don't respond within ${ESCROW_HOLD_DAYS} days, payment is released to the seller automatically. If something's wrong, message the seller before then.`,
    ],
    cta: { label: "Review and confirm", path: "/dashboard/purchases" },
  });
}

export async function sendOrderProofUpdatedEmail(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order) return;
  const buyerEmail = order.buyer_email ?? (await getUserEmail(order.buyer_id));
  await sendEmail(buyerEmail, {
    subject: `Delivery link updated: ${order.title}`,
    paragraphs: [
      `The seller has changed the delivery link for "${order.title}".`,
      ...(order.proof_url ? [`New link: ${order.proof_url}`] : []),
      order.start_date
        ? "Please check your ad is live. If it isn't, message the seller. Payment is released to the seller after the booking ends."
        : `Your ${ESCROW_HOLD_DAYS}-day check starts again from now. If you don't respond within ${ESCROW_HOLD_DAYS} days, payment is released to the seller automatically. If something's wrong, message the seller before then.`,
    ],
    cta: { label: "Review and confirm", path: "/dashboard/purchases" },
  });
}

export async function sendOrderCancelledEmails(orderId: string, cancelledBy: string) {
  const order = await loadOrder(orderId);
  if (!order) return;
  const [buyerEmail, sellerEmail] = await Promise.all([
    order.buyer_email ? Promise.resolve(order.buyer_email) : getUserEmail(order.buyer_id),
    getUserEmail(order.seller_id),
  ]);
  const byBuyer = cancelledBy === order.buyer_id;

  await Promise.all([
    sendEmail(buyerEmail, {
      subject: `Order cancelled: ${order.title}`,
      paragraphs: [
        byBuyer
          ? `You cancelled your order for "${order.title}".`
          : `The seller cancelled your order for "${order.title}".`,
        `A full refund of ${price(order)} is on its way to your original payment method. It usually shows up within 5–10 business days.`,
      ],
      cta: { label: "View your orders", path: "/dashboard/purchases" },
    }),
    sendEmail(sellerEmail, {
      subject: `Order cancelled: ${order.title}`,
      paragraphs: [
        byBuyer
          ? `The buyer cancelled their order for "${order.title}" within the free cancellation window.`
          : `You cancelled the order for "${order.title}".`,
        "The buyer has been refunded in full. No fees were charged to you.",
      ],
      cta: { label: "Go to your sales", path: "/dashboard/sales" },
    }),
  ]);
}
