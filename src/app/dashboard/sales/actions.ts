"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface DeliverOrderState {
  error?: string;
}

// 平台不裁定"交付质量",也不验证这个链接是否属实 —— 但要求卖家先做这个自证式的
// "我已交付"动作,才能开始买家确认窗口的计时,避免卖家什么都不做、光靠超时就能拿到钱
// (见 README"平台责任边界"一节)。
export async function markDeliveredAction(
  _prevState: DeliverOrderState,
  formData: FormData
): Promise<DeliverOrderState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const orderId = String(formData.get("order_id") ?? "");
  const proofUrl = String(formData.get("proof_url") ?? "").trim();

  if (!proofUrl) {
    return { error: "Please provide a link the buyer can use to verify delivery" };
  }

  const { data: order } = await supabase
    .from("listing_orders")
    .select("seller_id,status")
    .eq("id", orderId)
    .single();

  if (!order || order.seller_id !== user.id || order.status !== "paid_in_escrow") {
    return { error: "This order can't be marked as delivered right now" };
  }

  const { data: updatedRows, error } = await supabase
    .from("listing_orders")
    .update({
      status: "delivered",
      proof_url: proofUrl,
      delivered_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "paid_in_escrow")
    .select("id");

  if (error || !updatedRows || updatedRows.length === 0) {
    return { error: error?.message ?? "Couldn't save, please try again" };
  }

  redirect("/dashboard/sales");
}
