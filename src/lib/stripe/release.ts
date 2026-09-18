import type Stripe from "stripe";
import { stripe } from "./server";
import { createServiceClient } from "@/lib/supabase/service";
import { PLATFORM_COMMISSION_RATE } from "@/lib/supabase/enums";

/**
 * 买家提前主动放款,或资金冻结期(ESCROW_HOLD_DAYS)到了自动放款,触发的都是这一个
 * 函数 —— 真正把钱从平台账户转给卖家的 Connect 账户。平台不裁定"是否已交付",这里
 * 不检查任何交付状态,调用方(release action / 定时任务)已经用条件更新把 listing_orders
 * 锁到 confirmed 状态,保证同一笔订单不会被并发触发两次转账。
 * 用 service_role client 写 payments/listing_orders —— 这两张表故意没给认证用户开
 * insert/update 的 RLS 口子(payments 完全没有,listing_orders 的状态流转合法性也
 * 不该交给前端 session 的 client 来把关),调用方(手动确认 action / 定时任务)已经
 * 在各自入口做过身份校验,这里可以放心用高权限 client。
 *
 * 手续费口径:卖家到手 = 实际入账净额(已经扣掉 Stripe 手续费的 balance_transaction.net)
 * 再扣平台 12% 佣金(按订单原价算,不受 Stripe 手续费波动影响,见 README)。
 */
export async function releaseOrderPayout(order: {
  id: string;
  seller_id: string;
  amount: number;
  currency: string;
}) {
  const supabase = createServiceClient();

  const [{ data: payment }, { data: sellerProfile }] = await Promise.all([
    supabase
      .from("payments")
      .select("stripe_payment_intent_id")
      .eq("order_id", order.id)
      .single(),
    supabase
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", order.seller_id)
      .single(),
  ]);

  if (!payment?.stripe_payment_intent_id) {
    throw new Error(`No payment record for order ${order.id}`);
  }
  if (!sellerProfile?.stripe_connect_account_id) {
    throw new Error(`Seller has no Stripe Connect account for order ${order.id}`);
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(
    payment.stripe_payment_intent_id,
    { expand: ["latest_charge.balance_transaction"] }
  );
  const charge = paymentIntent.latest_charge as Stripe.Charge | null;
  const balanceTransaction = charge?.balance_transaction as
    | Stripe.BalanceTransaction
    | null;

  // 正常情况下 balance_transaction 应该总是能展开到;这个兜底只是防止 Stripe 那边
  // 数据还没结算完(极少见的时序问题)导致这里直接抛异常。
  const netCents = balanceTransaction?.net ?? Math.round(order.amount * 100);

  const platformFeeCents = Math.round(order.amount * PLATFORM_COMMISSION_RATE * 100);
  const transferAmountCents = Math.max(netCents - platformFeeCents, 0);
  // balance_transaction.fee 是 Stripe 实报的处理手续费(卡组织+Stripe 自己那部分),
  // 跟平台佣金是两笔完全独立的扣款,分开存起来才能在"你的收入"页给卖家拆明细。
  const stripeFeeCents = balanceTransaction?.fee ?? 0;

  const transfer = await stripe.transfers.create({
    amount: transferAmountCents,
    currency: order.currency.toLowerCase(),
    destination: sellerProfile.stripe_connect_account_id,
    transfer_group: order.id,
  });

  await supabase.from("listing_orders").update({ status: "released" }).eq("id", order.id);

  await supabase
    .from("payments")
    .update({
      stripe_transfer_id: transfer.id,
      platform_fee_amount: platformFeeCents / 100,
      stripe_fee_amount: stripeFeeCents / 100,
      net_amount: transferAmountCents / 100,
      status: "released",
    })
    .eq("order_id", order.id);
}
