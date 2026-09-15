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

  if (order && order.seller_id === user.id && order.status === "pending_payment") {
    await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", orderId);
  }

  redirect("/dashboard/orders");
}

export async function confirmOrderAction(orderId: string): Promise<void> {
  await respondToOrder(orderId, "confirmed");
}

export async function rejectOrderAction(orderId: string): Promise<void> {
  await respondToOrder(orderId, "rejected");
}
