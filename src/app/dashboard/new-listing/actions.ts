"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  LISTING_CATEGORIES,
  MIN_LISTING_PRICE,
  PRICING_UNITS,
  type ListingCategory,
  type PricingUnit,
} from "@/lib/supabase/enums";

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

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceAmountRaw = String(formData.get("price_amount") ?? "").trim();
  const priceCurrency = String(formData.get("price_currency") ?? "").trim();
  const pricingUnitRaw = String(formData.get("pricing_unit") ?? "");
  const categories = formData
    .getAll("categories")
    .map(String)
    .filter((c): c is ListingCategory =>
      (LISTING_CATEGORIES as readonly string[]).includes(c)
    );
  const mediaFiles = formData
    .getAll("media")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const placementRaw = String(formData.get("placement") ?? "");

  if (!title) {
    return { error: "Please enter a title" };
  }
  if (!placementRaw) {
    return { error: "Please choose where this ad runs" };
  }

  // Validate against the seller's own accounts/website server-side — never
  // trust a client-submitted account id without checking ownership.
  let socialAccountId: string | null = null;
  let isWebsitePlacement = false;
  if (placementRaw === "website") {
    if (!sellerProfile?.website_url) {
      return { error: "You don't have a website on file — add one on your profile first" };
    }
    isWebsitePlacement = true;
  } else if (placementRaw !== "other") {
    const accountId = placementRaw.startsWith("account:")
      ? placementRaw.slice("account:".length)
      : "";
    const ownsAccount = (ownAccounts ?? []).some((account) => account.id === accountId);
    if (!accountId || !ownsAccount) {
      return { error: "Please choose a valid ad placement" };
    }
    socialAccountId = accountId;
  }
  const priceAmount = Number(priceAmountRaw);
  if (!priceAmountRaw || Number.isNaN(priceAmount) || priceAmount < MIN_LISTING_PRICE) {
    return { error: `Please enter a valid price (minimum $${MIN_LISTING_PRICE})` };
  }
  if (!priceCurrency) {
    return { error: "Please choose a currency" };
  }
  if (!(PRICING_UNITS as readonly string[]).includes(pricingUnitRaw)) {
    return { error: "Please choose a pricing unit" };
  }
  const pricingUnit = pricingUnitRaw as PricingUnit;
  if (categories.length === 0) {
    return { error: "Please select at least one category" };
  }

  const mediaUrls: string[] = [];
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
      title,
      description: description || null,
      categories,
      price_amount: priceAmount,
      price_currency: priceCurrency,
      pricing_unit: pricingUnit,
      media_urls: mediaUrls,
      status,
      social_account_id: socialAccountId,
      is_website_placement: isWebsitePlacement,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to publish, please try again" };
  }

  redirect(`/listings/${data.id}`);
}
