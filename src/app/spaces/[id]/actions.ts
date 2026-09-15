"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addDays, getBlockingRanges, isRangeFree, toDateOnly } from "@/lib/booking";
import type { AdSpace, Order } from "@/lib/supabase/types";

export interface BookSpaceState {
  error?: string;
  success?: boolean;
}

export async function bookSpaceAction(
  _prevState: BookSpaceState,
  formData: FormData
): Promise<BookSpaceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const adSpaceId = String(formData.get("ad_space_id") ?? "");
  const requestedStart = String(formData.get("start_date") ?? "");

  const { data: space, error: spaceError } = await supabase
    .from("ad_spaces")
    .select("*")
    .eq("id", adSpaceId)
    .single();

  if (spaceError || !space) {
    return { error: "广告位不存在" };
  }
  const adSpace = space as AdSpace;

  if (adSpace.seller_id === user.id) {
    return { error: "不能预订自己发布的广告位" };
  }

  if (!requestedStart || Number.isNaN(new Date(requestedStart).getTime())) {
    return { error: "请选择一个起租日期" };
  }

  const today = toDateOnly(new Date());
  if (requestedStart < today) {
    return { error: "不能选择过去的日期" };
  }

  // 重新从数据库拉一遍已有预订,而不是直接信任表单里算好的值,
  // 防止两个人几乎同时提交时抢到同一段日期,或者用户拿着过期的页面提交。
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("*")
    .eq("ad_space_id", adSpaceId);

  const blockingRanges = getBlockingRanges((existingOrders ?? []) as Order[]);

  if (!isRangeFree(blockingRanges, requestedStart, adSpace.duration_days)) {
    return {
      error: "这段日期刚刚被别人订走了,页面已刷新,请重新选择。",
    };
  }

  const endDate = toDateOnly(
    addDays(new Date(requestedStart), adSpace.duration_days - 1)
  );

  const { error: insertError } = await supabase.from("orders").insert({
    ad_space_id: adSpaceId,
    buyer_id: user.id,
    seller_id: adSpace.seller_id,
    amount: adSpace.price_amount,
    currency: adSpace.price_currency,
    status: "pending_payment",
    // 还没接支付,先占位成 stripe;真正扣款渠道等接入支付后由买家选择。
    payment_channel: "stripe",
    start_date: requestedStart,
    end_date: endDate,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  return { success: true };
}
