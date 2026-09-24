import type Stripe from "stripe";
import { stripe } from "./server";
import { createServiceClient } from "@/lib/supabase/service";
import { calculateFees, currencyDecimals, fromMinorUnits } from "@/lib/fees";

/**
 * 买家确认收货,或卖家标记交付后 ESCROW_HOLD_DAYS 天超时自动确认,触发的都是这一个
 * 函数 —— 真正把钱从平台账户转给卖家的 Connect 账户。调用方(release action / 定时
 * 任务)已经用条件更新把 listing_orders 锁到 confirmed 状态,保证同一笔订单不会被
 * 并发触发两次转账。
 * 用 service_role client 写 payments/listing_orders —— 这两张表都没给认证用户开
 * insert/update 权限,调用方已经在各自入口做过身份校验。
 *
 * 手续费口径(2026-09-23 起,README"费用、取消与退款规则"第 2 条):固定费率,
 * 卖家到手 = 订单金额 − 12% Service fee − (4% + 固定部分) Payment processing fee,
 * 跟 Stripe 实际扣多少手续费无关(那笔由平台承担)。
 *
 * 资金安全(同一节第 8 条):
 * - Transfer 带 source_transaction 绑定原始付款,钱从这笔付款里出,不依赖平台当时的
 *   可用余额(平台提现改手动之后,托管中的钱也不会被提走);
 * - 幂等:先按 transfer_group 查这笔订单是不是已经转过账(上次转账成功、但写库失败
 *   的情况),再带 idempotency key 创建,同一笔订单最多转一次。
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
      .eq("status", "paid_in_escrow")
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

  const fees = calculateFees(Number(order.amount), order.currency);

  const existing = await stripe.transfers.list({ transfer_group: order.id, limit: 1 });
  let transfer: Stripe.Transfer | undefined = existing.data[0];

  if (!transfer) {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      payment.stripe_payment_intent_id,
      { expand: ["latest_charge.balance_transaction"] }
    );
    const charge = paymentIntent.latest_charge as Stripe.Charge | null;
    const balanceTransaction = charge?.balance_transaction as
      | Stripe.BalanceTransaction
      | null;
    if (!charge || !balanceTransaction) {
      throw new Error(`Charge not settled yet for order ${order.id}`);
    }

    // source_transaction 的 Transfer 必须用这笔付款的结算币种(平台账户没开对应
    // 币种的结算时,比如 USD 付款会被换成 GBP 入账)。币种不同就按 Stripe 这笔付款
    // 实际用的汇率换算卖家到手金额,换汇差由平台承担(第 2 条"国际卡 + 换汇会亏")。
    const settlementCurrency = balanceTransaction.currency.toUpperCase();
    let transferMinor = fees.sellerNetMinor;
    if (settlementCurrency !== fees.currency) {
      const rate = balanceTransaction.exchange_rate ?? 1;
      transferMinor = Math.round(
        fromMinorUnits(fees.sellerNetMinor, fees.currency) *
          rate *
          10 ** currencyDecimals(settlementCurrency)
      );
    }
    // source_transaction 要求转账金额不超过原付款金额。
    transferMinor = Math.min(transferMinor, balanceTransaction.amount);

    transfer = await stripe.transfers.create(
      {
        amount: transferMinor,
        currency: settlementCurrency.toLowerCase(),
        destination: sellerProfile.stripe_connect_account_id,
        transfer_group: order.id,
        source_transaction: charge.id,
        description: `Payout for order ${order.id.slice(0, 8)}`,
        metadata: { order_id: order.id, seller_id: order.seller_id },
      },
      { idempotencyKey: `order-${order.id}-transfer` }
    );
  }

  const { error: orderUpdateError } = await supabase
    .from("listing_orders")
    .update({ status: "released" })
    .eq("id", order.id)
    .eq("status", "confirmed");
  if (orderUpdateError) {
    throw new Error(`Transfer ${transfer.id} sent but order update failed: ${orderUpdateError.message}`);
  }

  const { error: paymentUpdateError } = await supabase
    .from("payments")
    .update({
      stripe_transfer_id: transfer.id,
      // 实际转给卖家的金额和币种(可能是换汇后的结算币种,跟订单币种不同)。
      transfer_amount: fromMinorUnits(transfer.amount, transfer.currency),
      transfer_currency: transfer.currency.toUpperCase(),
      platform_fee_amount: fromMinorUnits(fees.serviceFeeMinor, fees.currency),
      stripe_fee_amount: fromMinorUnits(fees.processingFeeMinor, fees.currency),
      net_amount: fromMinorUnits(fees.sellerNetMinor, fees.currency),
      status: "released",
    })
    .eq("order_id", order.id)
    .eq("status", "paid_in_escrow");
  if (paymentUpdateError) {
    throw new Error(`Transfer ${transfer.id} sent but payment update failed: ${paymentUpdateError.message}`);
  }
}
