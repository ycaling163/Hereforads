"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseListingFormFields } from "@/lib/listingFormValidation";

// listing 图片/视频复用已有的 ad-space-photos bucket,不用重新建。
const MEDIA_BUCKET = "ad-space-photos";

export interface NewListingState {
  error?: string;
}

export async function createListingAction(
  _prevState: NewListingState,
  formData: FormData
): Promise<NewListingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: sellerProfile }, { data: ownAccounts }] =
    await Promise.all([
      supabase.from("profiles").select("stripe_onboarded").eq("id", user.id).single(),
      supabase
        .from("seller_profiles")
        .select("website_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("social_accounts").select("id").eq("user_id", user.id),
    ]);

  const parsed = parseListingFormFields(
    formData,
    (ownAccounts ?? []).map((account) => account.id),
    !!sellerProfile?.website_url
  );
  if ("error" in parsed) {
    return { error: parsed.error };
  }
  const { fields } = parsed;

  const mediaFiles = formData
    .getAll("media")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  // Carried over when duplicating another listing (ListingForm's hidden
  // "existing_media" inputs) — only accept ones that are actually this
  // user's own storage objects, never an arbitrary client-submitted URL.
  const ownedMediaMarker = `/object/public/${MEDIA_BUCKET}/${user.id}/`;
  const existingMediaUrls = formData
    .getAll("existing_media")
    .map(String)
    .filter((url) => url.includes(ownedMediaMarker));

  const mediaUrls: string[] = [...existingMediaUrls];
  try {
    for (const file of mediaFiles) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/listings/${randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });

      if (uploadError) {
        return { error: `Media upload failed: ${uploadError.message}` };
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      mediaUrls.push(publicUrl);
    }
  } catch (err) {
    return {
      error: `Media upload failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  // 没开通 Stripe 的卖家也能填表,但落库状态强制是 draft —— 买家看不到、也下不了单,
  // 光靠前端隐藏发布入口挡不住有人直接提交表单绕过去,所以这里再校验一次。
  // 2026-09-18 起,连好 Stripe 也不会直接 active 了,先进 pending_review 等管理员审核,
  // 管理员在 /admin/listings 通过后才会变成 active、买家才能看到。
  const status = profile?.stripe_onboarded ? "pending_review" : "draft";

  const { data, error } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id,
      title: fields.title,
      description: fields.description,
      categories: fields.categories,
      ad_type: fields.adType,
      price_amount: fields.priceAmount,
      price_currency: fields.priceCurrency,
      pricing_unit: fields.pricingUnit,
      media_urls: mediaUrls,
      status,
      social_account_id: fields.socialAccountId,
      is_website_placement: fields.isWebsitePlacement,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to publish, please try again" };
  }

  redirect(`/listings/${data.id}`);
}
