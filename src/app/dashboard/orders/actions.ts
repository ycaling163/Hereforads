"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/supabase/enums";

async function respondToOrder(orderId: string, nextStatus: OrderStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: order } = await supabase
    .from("orders")
    .select("seller_id,status")
    .eq("id", orderId)
    .single();

  if (!order || order.seller_id !== user.id || order.status !== "pending_payment") {
    redirect("/dashboard/orders");
  }

  // .update() 在 RLS 拒绝写入时不会报错,只会静默影响 0 行,
  // 所以用 .select() 拿回受影响的行来判断是否真的改了状态。
  const { data: updatedRows, error } = await supabase
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", orderId)
    .select("id");

  if (error || !updatedRows || updatedRows.length === 0) {
    redirect("/dashboard/orders?error=update_failed");
  }

  redirect("/dashboard/orders");
}

export async function confirmOrderAction(orderId: string): Promise<void> {
  await respondToOrder(orderId, "confirmed");
}

export async function rejectOrderAction(orderId: string): Promise<void> {
  await respondToOrder(orderId, "rejected");
}
