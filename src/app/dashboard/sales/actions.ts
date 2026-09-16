"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface DeliverOrderState {
  error?: string;
}

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
