"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { releaseOrderPayout } from "@/lib/stripe/release";

export async function confirmReceiptAction(orderId: string): Promise<void> {
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

  if (!order || order.buyer_id !== user.id || order.status !== "delivered") {
    redirect("/dashboard/purchases?error=invalid_state");
  }

  const { data: updatedRows, error } = await supabase
    .from("listing_orders")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "delivered")
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
