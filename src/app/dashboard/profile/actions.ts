"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseFollowerCount } from "@/lib/format";
import { storagePathFromPublicUrl } from "@/lib/storage";
import { normalizeUsername } from "@/lib/username";
import { normalizeWebUrl } from "@/lib/url";
import {
  AD_TYPES,
  CURRENCIES,
  LISTING_CATEGORIES,
  SOCIAL_PLATFORMS,
  type AdType,
  type ListingCategory,
  type SocialPlatform,
} from "@/lib/supabase/enums";

const AVATAR_BUCKET = "ad-space-photos";

export interface ProfileFormState {
  error?: string;
  success?: boolean;
}

// Sellers usually type "example.com" rather than "https://example.com" —
// normalizeWebUrl adds the scheme before validating instead of rejecting the
// common case (shared with social account links and delivery links).
function normalizeWebsiteUrl(raw: string): { value: string | null } | { error: string } {
  if (!raw.trim()) return { value: null };
  const result = normalizeWebUrl(raw);
  return "error" in result ? { error: "Please enter a valid website, e.g. example.com" } : result;
}

export async function updateProfileAction(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const avatarFile = formData.get("avatar");
  const bannerFile = formData.get("banner");
  const contentCategories = formData
    .getAll("content_categories")
    .map(String)
    .filter((c): c is ListingCategory =>
      (LISTING_CATEGORIES as readonly string[]).includes(c)
    );

  const websiteResult = normalizeWebsiteUrl(
    String(formData.get("website_url") ?? "")
  );
  if ("error" in websiteResult) {
    return { error: websiteResult.error };
  }

  const usernameResult = normalizeUsername(String(formData.get("username") ?? ""));
  if ("error" in usernameResult) {
    return { error: usernameResult.error };
  }

  const { data: existingSellerProfile } = await supabase
    .from("seller_profiles")
    .select("avatar_url, banner_url")
    .eq("user_id", user.id)
    .maybeSingle();

  async function uploadImage(
    file: File,
    folder: "avatar" | "banner"
  ): Promise<string | { error: string }> {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user!.id}/${folder}/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { contentType: file.type || undefined });

    if (uploadError) {
      return { error: `${folder === "avatar" ? "Avatar" : "Banner"} upload failed: ${uploadError.message}` };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return publicUrl;
  }

  let avatarUrl: string | undefined;
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const result = await uploadImage(avatarFile, "avatar");
    if (typeof result !== "string") return result;
    avatarUrl = result;
  }

  let bannerUrl: string | undefined;
  if (bannerFile instanceof File && bannerFile.size > 0) {
    const result = await uploadImage(bannerFile, "banner");
    if (typeof result !== "string") return result;
    bannerUrl = result;
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null, username: usernameResult.value })
    .eq("id", user.id)
    .select("id");

  if (profileError) {
    // Postgres unique_violation — someone else already has this username.
    if (profileError.code === "23505") {
      return { error: "That username is already taken — please choose another." };
    }
    return { error: profileError.message };
  }
  if (!updatedProfile || updatedProfile.length === 0) {
    return {
      error:
        "Save failed — the database rejected the update (permission policy issue). Please contact an admin to check the profiles table's UPDATE RLS policy.",
    };
  }

  const { error: sellerError } = await supabase.from("seller_profiles").upsert(
    {
      user_id: user.id,
      bio: bio || null,
      content_categories: contentCategories,
      website_url: websiteResult.value,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      ...(bannerUrl ? { banner_url: bannerUrl } : {}),
    },
    { onConflict: "user_id" }
  );

  if (sellerError) {
    return { error: sellerError.message };
  }

  // Only remove the old file once the new URL is safely saved, so a storage
  // hiccup never leaves the profile pointing at a file we've deleted.
  const oldPathsToDelete = [
    avatarUrl ? existingSellerProfile?.avatar_url : null,
    bannerUrl ? existingSellerProfile?.banner_url : null,
  ]
    .map((url) => (url ? storagePathFromPublicUrl(url, AVATAR_BUCKET) : null))
    .filter((path): path is string => path !== null);

  if (oldPathsToDelete.length > 0) {
    await supabase.storage.from(AVATAR_BUCKET).remove(oldPathsToDelete);
  }

  return { success: true };
}

export interface SocialAccountFormState {
  error?: string;
}

export async function addSocialAccountAction(
  _prevState: SocialAccountFormState,
  formData: FormData
): Promise<SocialAccountFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const platform = String(formData.get("platform") ?? "");
  const handle = String(formData.get("handle") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const followerCountRaw = String(formData.get("follower_count") ?? "").trim();

  if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) {
    return { error: "Please choose a platform" };
  }
  if (!url && !handle) {
    return { error: "Fill in either a handle or a profile link" };
  }
  const normalizedUrl = url ? normalizeWebUrl(url) : { value: "" };
  if ("error" in normalizedUrl) {
    return { error: normalizedUrl.error };
  }

  let followerCount: number | null = null;
  if (followerCountRaw) {
    followerCount = parseFollowerCount(followerCountRaw);
    if (followerCount === null) {
      return {
        error: "Please enter a valid follower count, e.g. 25000 or 25k",
      };
    }
  }

  const { error } = await supabase.from("social_accounts").insert({
    user_id: user.id,
    platform,
    handle: handle || null,
    url: normalizedUrl.value,
    follower_count: followerCount,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard/profile");
}

export async function updateSocialAccountAction(
  accountId: string,
  _prevState: SocialAccountFormState,
  formData: FormData
): Promise<SocialAccountFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const platform = String(formData.get("platform") ?? "");
  const handle = String(formData.get("handle") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const followerCountRaw = String(formData.get("follower_count") ?? "").trim();

  if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) {
    return { error: "Please choose a platform" };
  }
  if (!url && !handle) {
    return { error: "Fill in either a handle or a profile link" };
  }
  const normalizedUrl = url ? normalizeWebUrl(url) : { value: "" };
  if ("error" in normalizedUrl) {
    return { error: normalizedUrl.error };
  }

  let followerCount: number | null = null;
  if (followerCountRaw) {
    followerCount = parseFollowerCount(followerCountRaw);
    if (followerCount === null) {
      return {
        error: "Please enter a valid follower count, e.g. 25000 or 25k",
      };
    }
  }

  // 同样要用 .select() 拿回被改的行,不然 RLS 拒绝时 .update() 会静默影响 0 行。
  const { data: updatedRows, error } = await supabase
    .from("social_accounts")
    .update({
      platform,
      handle: handle || null,
      url: normalizedUrl.value,
      follower_count: followerCount,
    })
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Save failed — the database rejected the request" };
  }

  redirect("/dashboard/profile");
}

export async function deleteSocialAccountAction(accountId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // .delete() 在 RLS 拒绝时不会报错,只会静默影响 0 行,
  // 所以用 .select() 拿回被删的行来判断是否真的删除了。
  const { data: deletedRows, error } = await supabase
    .from("social_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id");

  if (error || !deletedRows || deletedRows.length === 0) {
    redirect("/dashboard/profile?error=delete_failed");
  }

  redirect("/dashboard/profile");
}

// ===== Price card(2026-09-19 加,见 README"Price Card"一节)=====
// 背景图那版(seller_profiles.price_card_image_url)上线测试后发现自由上传的
// 图片很容易跟站内其他卡片的极简风格不搭、还可能盖住价格文字,2026-09-19 当天
// 就去掉了,只留干净的列表样式(见 src/components/PriceCard.tsx)。这一列还
// 留在数据库里(没删,历史遗留、允许为空),只是没有代码再读写它了。
//
// 价目行是独立的 seller_price_card_items 表,增删改跟 social_accounts 是
// 同一套模式(用 .select() 拿返回行判断 RLS 是不是真的放行了,而不是只看
// error 是不是 null)。

export interface PriceCardItemFormState {
  error?: string;
}

// 三个字段(Ad type/起价+币种)必填,Platform/备注可选——加/改两个 action 共用,
// 避免同一份校验写两遍。
function parsePriceCardItemFields(
  formData: FormData
):
  | {
      adType: AdType;
      platform: string | null;
      priceAmount: number;
      priceCurrency: string;
      note: string | null;
    }
  | { error: string } {
  const adType = String(formData.get("ad_type") ?? "");
  const platform = String(formData.get("platform") ?? "").trim();
  const priceAmountRaw = String(formData.get("price_amount") ?? "").trim();
  const priceCurrency = String(formData.get("price_currency") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!(AD_TYPES as readonly string[]).includes(adType)) {
    return { error: "Please choose an ad type" };
  }

  const priceAmount = Number(priceAmountRaw);
  if (!priceAmountRaw || Number.isNaN(priceAmount) || priceAmount < 0) {
    return { error: "Please enter a valid starting price" };
  }
  if (!(CURRENCIES as readonly string[]).includes(priceCurrency)) {
    return { error: "Please choose a currency" };
  }

  return {
    adType: adType as AdType,
    platform: platform || null,
    priceAmount,
    priceCurrency,
    note: note || null,
  };
}

export async function addPriceCardItemAction(
  _prevState: PriceCardItemFormState,
  formData: FormData
): Promise<PriceCardItemFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parsePriceCardItemFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { data: lastItem } = await supabase
    .from("seller_price_card_items")
    .select("sort_order")
    .eq("seller_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("seller_price_card_items").insert({
    seller_id: user.id,
    ad_type: parsed.adType,
    platform: parsed.platform,
    price_amount: parsed.priceAmount,
    price_currency: parsed.priceCurrency,
    note: parsed.note,
    sort_order: (lastItem?.sort_order ?? -1) + 1,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard/profile");
}

export async function updatePriceCardItemAction(
  itemId: string,
  _prevState: PriceCardItemFormState,
  formData: FormData
): Promise<PriceCardItemFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = parsePriceCardItemFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { data: updatedRows, error } = await supabase
    .from("seller_price_card_items")
    .update({
      ad_type: parsed.adType,
      platform: parsed.platform,
      price_amount: parsed.priceAmount,
      price_currency: parsed.priceCurrency,
      note: parsed.note,
    })
    .eq("id", itemId)
    .eq("seller_id", user.id)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Save failed — the database rejected the request" };
  }

  redirect("/dashboard/profile");
}

export async function deletePriceCardItemAction(itemId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: deletedRows, error } = await supabase
    .from("seller_price_card_items")
    .delete()
    .eq("id", itemId)
    .eq("seller_id", user.id)
    .select("id");

  if (error || !deletedRows || deletedRows.length === 0) {
    redirect("/dashboard/profile?error=delete_failed");
  }

  redirect("/dashboard/profile");
}
