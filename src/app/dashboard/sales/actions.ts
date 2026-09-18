"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface DeliverOrderState {
  error?: string;
}

// 只是给买家留一个能核实的链接(比如广告实际上线的页面),纯信息性质,不影响放款——
// 平台不裁定"是否已交付",托管期到了或买家主动确认,都会照常放款,跟这个链接填没填无关。
export async function addDeliveryLinkAction(
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
    return { error: "Please provide a link the buyer can use to check" };
  }

  const { data: order } = await supabase
    .from("listing_orders")
    .select("seller_id,status")
    .eq("id", orderId)
    .single();

  if (!order || order.seller_id !== user.id || order.status !== "paid_in_escrow") {
    return { error: "This order can't be updated right now" };
  }

  const { data: updatedRows, error } = await supabase
    .from("listing_orders")
    .update({ proof_url: proofUrl, delivered_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "paid_in_escrow")
    .select("id");

  if (error || !updatedRows || updatedRows.length === 0) {
    return { error: error?.message ?? "Couldn't save, please try again" };
  }

  redirect("/dashboard/sales");
}
