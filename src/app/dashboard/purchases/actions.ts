"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { releaseOrderPayout } from "@/lib/stripe/release";

// 买家不用等"卖家标记交付"——钱在托管期内随时可以主动放款给卖家,平台不裁定
// 履约结果(见 README"平台责任边界"一节),这个动作纯粹是买家自愿提前结束冻结期。
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
    .select("id,buyer_id,seller_id,amount,currency,status")
    .eq("id", orderId)
    .single();

  if (!order || order.buyer_id !== user.id || order.status !== "paid_in_escrow") {
    redirect("/dashboard/purchases?error=invalid_state");
  }

  // 条件更新当"锁",防止跟定时任务的自动放款同时跑,同一笔订单被转两次账。
  const { data: updatedRows, error } = await supabase
    .from("listing_orders")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "paid_in_escrow")
    .select("id");

  if (error || !updatedRows || updatedRows.length === 0) {
    redirect("/dashboard/purchases?error=update_failed");
  }

  try {
    await releaseOrderPayout(order);
  } catch (err) {
    console.error("Failed to release payout for order", orderId, err);
    redirect("/dashboard/purchases?error=payout_failed");
  }

  redirect("/dashboard/purchases");
}
