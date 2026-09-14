"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 目前产品定位是"个人广告位=一面墙"这一个统一概念(参考 thewall.ink),
// 不让用户选分类,统一落库为 'wall'(这是 ad_space_type 枚举里最贴切的值)。
const DEFAULT_SPACE_TYPE = "wall";

export interface NewSpaceState {
  error?: string;
}

export async function createSpaceAction(
  _prevState: NewSpaceState,
  formData: FormData
): Promise<NewSpaceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const keyword = String(formData.get("keyword") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const priceAmountRaw = String(formData.get("price_amount") ?? "").trim();
  const priceCurrency = String(formData.get("price_currency") ?? "").trim();
  const durationDaysRaw = String(formData.get("duration_days") ?? "").trim();
  const photoUrlsRaw = String(formData.get("photo_urls") ?? "");

  if (!title) {
    return { error: "请填写标题" };
  }
  const priceAmount = Number(priceAmountRaw);
  if (!priceAmountRaw || Number.isNaN(priceAmount) || priceAmount < 0) {
    return { error: "请填写有效的价格" };
  }
  if (!priceCurrency) {
    return { error: "请填写币种" };
  }
  const durationDays = Number(durationDaysRaw);
  if (!durationDaysRaw || Number.isNaN(durationDays) || durationDays <= 0) {
    return { error: "请填写有效的租期天数" };
  }

  const photoUrls = photoUrlsRaw
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);

  const { data, error } = await supabase
    .from("ad_spaces")
    .insert({
      seller_id: user.id,
      title,
      description: description || null,
      keyword: keyword || null,
      space_type: DEFAULT_SPACE_TYPE,
      city: city || null,
      // 不采集经纬度了;这两列在库里非空,先给 0 兜底(不用于任何展示/计算)。
      latitude: 0,
      longitude: 0,
      price_amount: priceAmount,
      price_currency: priceCurrency,
      duration_days: durationDays,
      // photo_urls is NOT NULL in the database — always send an array,
      // empty when no photos were provided.
      photo_urls: photoUrls,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "发布失败,请稍后再试" };
  }

  redirect(`/spaces/${data.id}`);
}
