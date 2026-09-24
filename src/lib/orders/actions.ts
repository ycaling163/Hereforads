"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";
import { FREE_CANCEL_HOURS } from "@/lib/supabase/enums";

/**
 * 付款后 24 小时内免费取消(README"费用、取消与退款规则"第 4 条第一行):买家或卖家
 * 都能发起,不需要对方同意;前提是卖家还没交付(订单还在 paid_in_escrow)。全额退给
 * 买家,卖家不承担任何费用(Stripe 退款拿不回的原手续费由平台承担),不算进"90 天
 * 3 单"。
 *
 * 顺序:先用条件更新把订单锁成 cancelled(防止跟卖家同时点"标记交付"撞车,也防止
 * 双击退两次),再发起 Stripe 退款(带 idempotency key);退款失败就把订单还原成
 * paid_in_escrow,让用户重试。
 */
export async function cancelWithin24hAction(
  orderId: string,
  returnTo: "sales" | "purchases"
): Promise<void> {
  // bind 进来的参数客户端可以改,只接受这两个值。
  const back = returnTo === "sales" ? "/dashboard/sales" : "/dashboard/purchases";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const service = createServiceClient();
  const { data: order } = await service
    .from("listing_orders")
    .select("id,buyer_id,seller_id,status,paid_at")
    .eq("id", orderId)
    .single();

  const isParty = order && (order.buyer_id === user.id || order.seller_id === user.id);
  if (!order || !isParty || order.status !== "paid_in_escrow" || !order.paid_at) {
    redirect(`${back}?error=cancel_invalid_state`);
  }

  const windowStart = new Date(
    Date.now() - FREE_CANCEL_HOURS * 60 * 60 * 1000
  ).toISOString();
  if (order.paid_at < windowStart) {
    redirect(`${back}?error=cancel_window_passed`);
  }

  const { data: payment } = await service
    .from("payments")
    .select("id,stripe_payment_intent_id")
    .eq("order_id", orderId)
    .eq("status", "paid_in_escrow")
    .single();
  if (!payment?.stripe_payment_intent_id) {
    redirect(`${back}?error=cancel_failed`);
  }

  const { data: locked, error: lockError } = await service
    .from("listing_orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      cancel_reason: "free_24h",
    })
    .eq("id", orderId)
    .eq("status", "paid_in_escrow")
    .gte("paid_at", windowStart)
    .select("id");

  if (lockError || !locked || locked.length === 0) {
    if (lockError) console.error("Failed to lock order for cancellation:", lockError.message);
    redirect(`${back}?error=cancel_invalid_state`);
  }

  let refundId: string;
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: payment.stripe_payment_intent_id,
        reason: "requested_by_customer",
        metadata: { order_id: orderId, cancel_reason: "free_24h" },
      },
      { idempotencyKey: `order-${orderId}-cancel-refund` }
    );
    refundId = refund.id;
  } catch (err) {
    console.error("Refund failed for cancelled order", orderId, err);
    await service
      .from("listing_orders")
      .update({ status: "paid_in_escrow", cancelled_at: null, cancelled_by: null, cancel_reason: null })
      .eq("id", orderId)
      .eq("status", "cancelled");
    redirect(`${back}?error=cancel_failed`);
  }

  const { error: paymentUpdateError } = await service
    .from("payments")
    .update({ status: "refunded", stripe_refund_id: refundId })
    .eq("id", payment.id);
  if (paymentUpdateError) {
    // 钱已经退了、订单也已经是 cancelled,只是 payments 记录没写上:不影响资金安全
    // (放款只认 payments.status = paid_in_escrow 且订单在 confirmed),记日志人工补。
    console.error(
      "Refund succeeded but payment row update failed",
      orderId,
      refundId,
      paymentUpdateError.message
    );
  }

  redirect(`${back}?cancelled=1`);
}
