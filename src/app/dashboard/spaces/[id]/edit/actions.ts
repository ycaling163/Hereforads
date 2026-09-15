"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SpaceFormState } from "@/components/SpaceForm";

const PHOTOS_BUCKET = "ad-space-photos";

export async function updateSpaceAction(
  spaceId: string,
  _prevState: SpaceFormState,
  formData: FormData
): Promise<SpaceFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("ad_spaces")
    .select("*")
    .eq("id", spaceId)
    .single();

  if (!existing) {
    return { error: "广告位不存在" };
  }
  if (existing.seller_id !== user.id) {
    return { error: "无权编辑这个广告位" };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const keyword = String(formData.get("keyword") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const priceAmountRaw = String(formData.get("price_amount") ?? "").trim();
  const priceCurrency = String(formData.get("price_currency") ?? "").trim();
  const durationDaysRaw = String(formData.get("duration_days") ?? "").trim();
  const newPhotoFiles = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

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

  const uploadedUrls: string[] = [];
  try {
    for (const file of newPhotoFiles) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });

      if (uploadError) {
        return { error: `图片上传失败:${uploadError.message}` };
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
      uploadedUrls.push(publicUrl);
    }
  } catch (err) {
    return {
      error: `图片上传失败:${err instanceof Error ? err.message : "未知错误"}`,
    };
  }

  const existingPhotoUrls = (existing.photo_urls as string[] | null) ?? [];

  const { error } = await supabase
    .from("ad_spaces")
    .update({
      title,
      description: description || null,
      keyword: keyword || null,
      city: city || null,
      price_amount: priceAmount,
      price_currency: priceCurrency,
      duration_days: durationDays,
      photo_urls: [...existingPhotoUrls, ...uploadedUrls],
    })
    .eq("id", spaceId);

  if (error) {
    return { error: error.message };
  }

  redirect(`/spaces/${spaceId}`);
}
