"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseFollowerCount } from "@/lib/format";
import {
  LISTING_CATEGORIES,
  SOCIAL_PLATFORMS,
  type ListingCategory,
  type SocialPlatform,
} from "@/lib/supabase/enums";

const AVATAR_BUCKET = "ad-space-photos";

export interface ProfileFormState {
  error?: string;
  success?: boolean;
}

// Sellers usually type "example.com" rather than "https://example.com" —
// add the scheme before validating instead of rejecting the common case.
function normalizeWebsiteUrl(raw: string): { value: string | null } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return { value: new URL(withScheme).toString() };
  } catch {
    return { error: "Please enter a valid website, e.g. example.com" };
  }
}

// Turns a public storage URL back into the bucket-relative path .remove()
// wants, so replacing an avatar/banner doesn't leave the old file behind.
function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
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
    .update({ display_name: displayName || null })
    .eq("id", user.id)
    .select("id");

  if (profileError) {
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
    url: url || "",
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
      url: url || "",
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
