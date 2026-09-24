"use server";

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { parseOrderNumber } from "@/lib/orders/orderNumber";

export interface FindOrderState {
  error?: string;
}

// 查订单(2026-09-24 产品负责人确认):订单号 + 下单邮箱两个都要对上。订单号是连续编号,
// 只凭订单号或只凭邮箱都能被别人猜到/试出来,所以缺一不可;对不上时不说是哪一个错,
// 统一报同一句,避免借这里试出别人的邮箱或订单号。
export async function findOrderAction(
  _prevState: FindOrderState,
  formData: FormData
): Promise<FindOrderState> {
  const orderNumber = parseOrderNumber(String(formData.get("order_number") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const notFoundError = {
    error: "We couldn't find an order with that order number and email. Check both and try again.",
  };

  if (!orderNumber || !email) {
    return notFoundError;
  }

  const { data: order } = await createServiceClient()
    .from("listing_orders")
    .select("view_token,buyer_email")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (!order?.buyer_email || order.buyer_email.trim().toLowerCase() !== email) {
    return notFoundError;
  }

  redirect(`/orders/${order.view_token}`);
}
