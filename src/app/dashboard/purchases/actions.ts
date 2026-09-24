"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { releaseOrderPayout } from "@/lib/stripe/release";
import { PayoutHeldError } from "@/lib/orders/holds";

// 只有卖家已经标记交付(`delivered`)之后,买家才有东西可以核对,才允许提前放款 ——
// 不用等确认窗口自动到期,但也不能在卖家什么都没做的情况下就把钱放出去
// (见 README"平台责任边界"一节)。
export async function releaseNowAction(orderId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: order } = await supabase
    .from("listing_orders")
    .select("id,buyer_id,seller_id,amount,currency,status,start_date,payout_hold")
    .eq("id", orderId)
    .single();

  // 日历预订的订单不能提前确认放款(2026-09-24 确认:MVP 不做),按预订期自动放款。
  if (
    !order ||
    order.buyer_id !== user.id ||
    order.status !== "delivered" ||
    order.start_date
  ) {
    redirect("/dashboard/purchases?error=invalid_state");
  }
  if (order.payout_hold) {
    redirect("/dashboard/purchases?error=on_hold");
  }

  // 条件更新当"锁",防止跟定时任务的自动放款同时跑,同一笔订单被转两次账。
  // 订单写入走 service_role(见 README"费用、取消与退款规则"第 8 条),上面已经
  // 校验过是这单的买家、状态是 delivered。
  const { data: updatedRows, error } = await createServiceClient()
    .from("listing_orders")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "delivered")
    // 暂停放款的订单(拒付/退款/卖家被封)不能确认,见 src/lib/orders/holds.ts。
    .is("payout_hold", null)
    .select("id");

  if (error || !updatedRows || updatedRows.length === 0) {
    redirect("/dashboard/purchases?error=update_failed");
  }

  try {
    await releaseOrderPayout(order);
  } catch (err) {
    if (err instanceof PayoutHeldError) {
      redirect("/dashboard/purchases?error=on_hold");
    }
    console.error("Failed to release payout for order", orderId, err);
    redirect("/dashboard/purchases?error=payout_failed");
  }

  redirect("/dashboard/purchases");
}
