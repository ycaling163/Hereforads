"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBlockingRanges, getNextAvailableStart } from "@/lib/booking";
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

  // 重新从数据库算一遍"下一个可预订档期",而不是直接信任表单里的值,
  // 防止两个人几乎同时提交时抢到同一段日期。
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("*")
    .eq("ad_space_id", adSpaceId);

  const blockingRanges = getBlockingRanges((existingOrders ?? []) as Order[]);
  const actualStart = getNextAvailableStart(
    blockingRanges,
    adSpace.duration_days
  );

  if (actualStart !== requestedStart) {
    return {
      error: "这个档期刚刚被别人订走了,页面已刷新,请重新选择。",
    };
  }

  const startDate = new Date(actualStart);
  const endDate = new Date(
    startDate.getTime() + (adSpace.duration_days - 1) * 24 * 60 * 60 * 1000
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
    start_date: actualStart,
    end_date: endDate.toISOString().slice(0, 10),
  });

  if (insertError) {
    return { error: insertError.message };
  }

  return { success: true };
}
