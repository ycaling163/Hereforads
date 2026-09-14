"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AD_SPACE_TYPES, type AdSpaceType } from "@/lib/supabase/enums";

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
  const spaceType = String(formData.get("space_type") ?? "") as AdSpaceType;
  const city = String(formData.get("city") ?? "").trim();
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const priceAmountRaw = String(formData.get("price_amount") ?? "").trim();
  const priceCurrency = String(formData.get("price_currency") ?? "").trim();
  const durationDaysRaw = String(formData.get("duration_days") ?? "").trim();
  const photoUrlsRaw = String(formData.get("photo_urls") ?? "");

  if (!title) {
    return { error: "请填写标题" };
  }
  if (!AD_SPACE_TYPES.includes(spaceType)) {
    return { error: "请选择广告位类型" };
  }
  const priceAmount = Number(priceAmountRaw);
  if (!priceAmountRaw || Number.isNaN(priceAmount) || priceAmount < 0) {
    return { error: "请填写有效的价格" };
  }
  if (!priceCurrency) {
    return { error: "请填写币种" };
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
      space_type: spaceType,
      city: city || null,
      latitude: latitudeRaw ? Number(latitudeRaw) : null,
      longitude: longitudeRaw ? Number(longitudeRaw) : null,
      price_amount: priceAmount,
      price_currency: priceCurrency,
      duration_days: durationDaysRaw ? Number(durationDaysRaw) : null,
      photo_urls: photoUrls.length > 0 ? photoUrls : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "发布失败,请稍后再试" };
  }

  redirect(`/spaces/${data.id}`);
}
