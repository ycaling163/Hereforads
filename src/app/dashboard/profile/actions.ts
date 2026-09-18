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
  const contentCategories = formData
    .getAll("content_categories")
    .map(String)
    .filter((c): c is ListingCategory =>
      (LISTING_CATEGORIES as readonly string[]).includes(c)
    );

  let avatarUrl: string | undefined;
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const ext = avatarFile.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, avatarFile, { contentType: avatarFile.type || undefined });

    if (uploadError) {
      return { error: `Avatar upload failed: ${uploadError.message}` };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    avatarUrl = publicUrl;
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
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    },
    { onConflict: "user_id" }
  );

  if (sellerError) {
    return { error: sellerError.message };
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
