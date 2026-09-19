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

  const [{ data: sellerProfile }, { data: ownAccounts }] = await Promise.all([
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

  // 发布免审核 + KYC 后置(2026-09-19 加,见 README 同名一节)之后,这两个勾选框
  // 是唯一还挡在"提交就能上线"前面的东西——降低虚假/侵权内容的法律责任风险,
  // 不是内容审核。前端 ListingForm.tsx 两个都是 required,这里是服务端兜底,
  // 防止有人绕过表单直接提交。
  const rightsConfirmed = formData.get("rights_confirmed") === "on";
  const termsAccepted = formData.get("terms_accepted") === "on";
  if (!rightsConfirmed || !termsAccepted) {
    return {
      error: "Please confirm you have the rights to this content and agree to the Terms",
    };
  }

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

  // 发布免审核 + KYC 后置(2026-09-19 决策记录,见 README 同名一节):不再要求
  // stripe_onboarded、也不再进 pending_review 排队等管理员批准,发布就是
  // active,买家立刻能看到/能下单。卖家不用先做 Stripe KYC 才能发布——真正
  // 需要 KYC 的时刻是订单放款那一刻(见 src/lib/stripe/release.ts),中间会在
  // /dashboard/my-listings 和标记交付时提醒卖家去连 Stripe(见那两处代码)。
  // 平台不再做发布前的内容审核,靠 /admin/listings 的 Remove(见 admin/listings
  // /actions.ts,任何状态都能下架)做事后监督。
  const now = new Date().toISOString();

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
      status: "active",
      social_account_id: fields.socialAccountId,
      is_website_placement: fields.isWebsitePlacement,
      rights_attested_at: now,
      terms_accepted_at: now,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to publish, please try again" };
  }

  redirect(`/listings/${data.id}`);
}
