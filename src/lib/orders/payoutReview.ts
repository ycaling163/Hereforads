import { PAYOUT_REVIEW_FIRST_ORDERS, PAYOUT_REVIEW_THRESHOLDS } from "@/config/site";
import { REVIEW_APPROVED_MARKER } from "@/lib/orders/holds";
import { createServiceClient } from "@/lib/supabase/service";

// 放款前人工审核(README"放款审核"一节)。releaseOrderPayout 转账前调用:需要审核、
// 且管理员还没批准过的订单,由调用方加 payout_hold = review 暂停,管理员在
// /admin/holds 点 "Approve payout" 之后,下一次 cron 放款。

/** 返回需要审核的原因;不需要审核(或管理员已批准)返回 null。 */
export async function payoutReviewReason(
  order: { id: string; seller_id: string; amount: number; currency: string },
  holdNote: string | null | undefined
): Promise<string | null> {
  if (holdNote?.includes(REVIEW_APPROVED_MARKER)) return null;

  const reasons: string[] = [];
  const threshold = PAYOUT_REVIEW_THRESHOLDS[order.currency.toUpperCase()];
  if (threshold === undefined || Number(order.amount) >= threshold) {
    reasons.push(
      threshold === undefined
        ? `currency ${order.currency} has no review threshold`
        : `amount ${order.amount} ${order.currency} is at or above ${threshold}`
    );
  }

  // 这个卖家已经成功放款的订单数(不含这一单)。查不到就当新卖家——宁可多审一单。
  const { count, error } = await createServiceClient()
    .from("listing_orders")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", order.seller_id)
    .in("status", ["released", "expired_auto_confirmed"])
    .neq("id", order.id);
  const released = error ? 0 : (count ?? 0);
  if (released < PAYOUT_REVIEW_FIRST_ORDERS) {
    reasons.push(
      `new seller (${released} completed payout${released === 1 ? "" : "s"}, review until ${PAYOUT_REVIEW_FIRST_ORDERS})`
    );
  }

  return reasons.length > 0 ? reasons.join("; ") : null;
}
