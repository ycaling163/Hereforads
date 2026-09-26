import { PENDING_HOLD_MINUTES } from "@/config/site";

// 待付款订单的付款链接什么时候失效(产品负责人 2026-09-26:过期的待付款订单不该一直堆在
// 卖家的 Awaiting payment 里)。
//
// 所有订单的 Stripe 付款链接都是 CHECKOUT_EXPIRES_MINUTES(31 分钟)有效;日历订单的日期
// 占用到 hold_expires_at(下单后 PENDING_HOLD_MINUTES = 36 分钟,换日期/过期时会提前改成
// 当时)。这里统一按"36 分钟或 hold_expires_at,以早的为准"判断。
//
// 只影响页面显示,**订单状态不改**,仍是 pending_payment(跟日历占用过期的处理一致,见
// src/lib/orders/releaseHold.ts):"cancelled" 在财务、退款统计里代表退过款,不能混进
// 没付过钱的订单;万一买家在最后一刻付了款,webhook 照常把它推进到 paid_in_escrow。

type CheckoutFields = {
  status: string;
  created_at: string;
  hold_expires_at?: string | null;
};

export function checkoutExpiresAt(order: CheckoutFields): number {
  const byAge = new Date(order.created_at).getTime() + PENDING_HOLD_MINUTES * 60_000;
  const hold = order.hold_expires_at ? new Date(order.hold_expires_at).getTime() : Infinity;
  return Math.min(byAge, hold);
}

/** 还在付款中:待付款且付款链接没过期。 */
export function isLiveCheckout(order: CheckoutFields, now: number): boolean {
  return order.status === "pending_payment" && checkoutExpiresAt(order) > now;
}

/** 付款链接已经过期、买家没付款的订单——卖家/买家页面上不再显示。 */
export function isExpiredCheckout(order: CheckoutFields, now: number): boolean {
  return order.status === "pending_payment" && checkoutExpiresAt(order) <= now;
}
