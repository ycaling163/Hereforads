import type Stripe from "stripe";
import { stripe } from "./server";
import { createServiceClient } from "@/lib/supabase/service";
import { fromMinorUnits } from "@/lib/fees";

/**
 * 记下一笔付款在平台 Stripe 余额里的实际入账:结算币种(平台是英国账户,一般是 GBP)、
 * 入账金额、Stripe 实际扣的手续费。有了这三项,/admin/finance 才能算出每单平台
 * 实际赚/亏多少(固定费率向卖家收的手续费 vs Stripe 真实成本,见 README 第 2 条)。
 * 付款成功时由 webhook 调用;老订单在财务页打开时补。失败只记日志。
 */
export async function recordSettlement(orderId: string, paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = paymentIntent.latest_charge as Stripe.Charge | null;
    const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
    if (!bt) return null;

    const currency = bt.currency.toUpperCase();
    const settlement = {
      settlement_currency: currency,
      settlement_amount: fromMinorUnits(bt.amount, currency),
      stripe_actual_fee: fromMinorUnits(bt.fee, currency),
    };
    const { error } = await createServiceClient()
      .from("payments")
      .update(settlement)
      .eq("order_id", orderId)
      .eq("stripe_payment_intent_id", paymentIntentId);
    if (error) {
      console.error("Failed to save settlement for order", orderId, error.message);
    }
    return settlement;
  } catch (err) {
    console.error("Failed to fetch settlement for order", orderId, err);
    return null;
  }
}
