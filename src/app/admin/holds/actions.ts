"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { removePayoutHold } from "@/lib/orders/holds";

// 管理员解除暂停放款(拒付赢了、核对过退款、被封卖家的订单确认可以放款等)。解除后订单
// 按原来的流程继续:已到期的 delivered 订单和停在 confirmed 的订单,下一次 cron(每小时)
// 就会放款。要退款的,去 Stripe 后台退,charge.refunded webhook 会把订单同步成已取消。
export async function removeHoldAction(orderId: string): Promise<void> {
  const admin = await requireAdmin();
  try {
    await removePayoutHold(orderId, admin.id);
  } catch (err) {
    console.error("Failed to remove payout hold", orderId, err);
    redirect("/admin/holds?error=remove_failed");
  }
  redirect("/admin/holds?removed=1");
}
