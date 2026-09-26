import { stripe } from "@/lib/stripe/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { PayoutHold } from "@/lib/supabase/types";

// 暂停放款(listing_orders.payout_hold,2026-09-24 安全核查第 1 批,见 README"安全核查 →
// 第 1 批")。拒付、Stripe 后台退款、卖家被封都走这里:订单 status 不变,只加一个"不许动钱"
// 的标记;确认收货、cron 放款、免费取消的条件更新都带 payout_hold is null,
// releaseOrderPayout 转账前也会再查一次。只有管理员能在 /admin/holds 解除。

// 放款时发现订单被暂停,调用方(cron / 确认收货)据此区分"被挡下"和"真的失败"。
export class PayoutHeldError extends Error {
  constructor(orderId: string, readonly reason: string) {
    super(`Payout for order ${orderId} is on hold (${reason})`);
    this.name = "PayoutHeldError";
  }
}

// 管理员解除暂停时写进备注的标记。releaseOrderPayout 看到它就不再按 Stripe 上的
// 拒付/退款状态自动重新暂停——管理员已经看过并决定放款(比如拒付赢了之后,
// Stripe 上这笔 charge 的 disputed 仍然是 true)。
export const HOLD_REMOVED_MARKER = "Hold removed by admin";

// 管理员批准"放款审核"(payout_hold = review,见 src/lib/orders/payoutReview.ts)时写的标记。
// 跟上面的 HOLD_REMOVED_MARKER 分开:批准审核只表示"这单可以放款",**不能**让
// releaseOrderPayout 跳过转账前对 Stripe 拒付/退款状态的检查。
export const REVIEW_APPROVED_MARKER = "Payout approved by admin";

function stamp(note: string): string {
  return `[${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC] ${note}`;
}

/**
 * 给订单加暂停标记。已经暂停(不管什么原因)的不改原因,只追加备注——最早的原因最能
 * 说明问题,也避免管理员看到的原因被后来的事件覆盖。
 */
export async function placePayoutHold(orderId: string, reason: PayoutHold, note: string) {
  const service = createServiceClient();
  const { data: order, error } = await service
    .from("listing_orders")
    .select("payout_hold,payout_hold_note")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) {
    throw new Error(`placePayoutHold: order ${orderId} not found: ${error?.message ?? ""}`);
  }
  const payoutHoldNote = [order.payout_hold_note, stamp(note)].filter(Boolean).join("\n");
  const { error: updateError } = await service
    .from("listing_orders")
    .update(
      order.payout_hold
        ? { payout_hold_note: payoutHoldNote }
        : { payout_hold: reason, payout_hold_at: new Date().toISOString(), payout_hold_note: payoutHoldNote }
    )
    .eq("id", orderId);
  if (updateError) {
    throw new Error(`placePayoutHold: update failed for ${orderId}: ${updateError.message}`);
  }
}

/** 只追加一条管理员备注,不改暂停状态(比如拒付结案的结果)。 */
export async function appendHoldNote(orderId: string, note: string) {
  const service = createServiceClient();
  const { data: order } = await service
    .from("listing_orders")
    .select("payout_hold_note")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  await service
    .from("listing_orders")
    .update({
      payout_hold_note: [order.payout_hold_note, stamp(note)].filter(Boolean).join("\n"),
    })
    .eq("id", orderId);
}

// 钱还没到卖家手里、可能还要动钱的订单状态。
const MONEY_PENDING_STATUSES = ["paid_in_escrow", "delivered", "confirmed"];

/** 封号时暂停这个卖家所有托管中的订单(产品负责人 2026-09-24 确认:停止放款,管理员人工处理)。 */
export async function holdSellerOrders(sellerId: string): Promise<number> {
  const service = createServiceClient();
  const { data: orders, error } = await service
    .from("listing_orders")
    .select("id")
    .eq("seller_id", sellerId)
    .in("status", MONEY_PENDING_STATUSES);
  if (error) {
    throw new Error(`holdSellerOrders: ${error.message}`);
  }
  for (const order of orders ?? []) {
    await placePayoutHold(order.id, "seller_banned", "Seller was banned by an admin.");
  }
  return orders?.length ?? 0;
}

/**
 * 按 Stripe PaymentIntent 找订单(拒付/退款事件只带 charge 和 payment_intent)。先查
 * payments 表,查不到再读 PaymentIntent 的 metadata.order_id(下单时写进去的)。
 */
export async function findOrderIdByPaymentIntent(paymentIntentId: string): Promise<string | null> {
  const { data: payment } = await createServiceClient()
    .from("payments")
    .select("order_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .neq("status", "amount_mismatch")
    .limit(1)
    .maybeSingle();
  if (payment?.order_id) return payment.order_id as string;

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent.metadata?.order_id || null;
}

/** 管理员解除暂停(/admin/holds)。订单按原来的流程继续:cron 会放款到期的订单。 */
export async function removePayoutHold(orderId: string, adminId: string) {
  const service = createServiceClient();
  const { data: order } = await service
    .from("listing_orders")
    .select("payout_hold,payout_hold_note")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.payout_hold) return false;
  const { error } = await service
    .from("listing_orders")
    .update({
      payout_hold: null,
      payout_hold_note: [
        order.payout_hold_note,
        stamp(
          order.payout_hold === "review"
            ? `${REVIEW_APPROVED_MARKER} (${adminId}).`
            : `${HOLD_REMOVED_MARKER} (${adminId}); was: ${order.payout_hold}.`
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    })
    .eq("id", orderId)
    .eq("payout_hold", order.payout_hold);
  if (error) {
    throw new Error(`removePayoutHold: ${error.message}`);
  }
  return true;
}
