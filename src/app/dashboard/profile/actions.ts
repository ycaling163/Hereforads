"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/supabase/enums";

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

  let avatarUrl: string | undefined;
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const ext = avatarFile.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, avatarFile, { contentType: avatarFile.type || undefined });

    if (uploadError) {
      return { error: `头像上传失败:${uploadError.message}` };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    avatarUrl = publicUrl;
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null })
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: sellerError } = await supabase.from("seller_profiles").upsert(
    {
      user_id: user.id,
      bio: bio || null,
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
  const followerCount = String(formData.get("follower_count") ?? "").trim();

  if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) {
    return { error: "请选择平台" };
  }
  // 有些平台(比如小红书)没有好分享的主页链接,账号名足够标识账号,
  // 所以链接和账号名只要求填一个,不强制必须是链接。
  if (!handle && !url) {
    return { error: "请至少填写账号名或主页链接" };
  }

  const { error } = await supabase.from("social_accounts").insert({
    user_id: user.id,
    platform,
    handle: handle || null,
    url: url || null,
    follower_count: followerCount || null,
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
  const followerCount = String(formData.get("follower_count") ?? "").trim();

  if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) {
    return { error: "请选择平台" };
  }
  if (!handle && !url) {
    return { error: "请至少填写账号名或主页链接" };
  }

  // 同样要用 .select() 拿回被改的行,不然 RLS 拒绝时 .update() 会静默影响 0 行。
  const { data: updatedRows, error } = await supabase
    .from("social_accounts")
    .update({
      platform,
      handle: handle || null,
      url: url || null,
      follower_count: followerCount || null,
    })
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return { error: error.message };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "保存失败,数据库拒绝了这次操作" };
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
