"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { safeRedirectPath } from "@/lib/safeRedirect";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export interface RegisterState {
  error?: string;
  message?: string;
}

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const next = safeRedirectPath(formData.get("next") as string | null, "/listings");

  if (!email || !password) {
    return { error: "Please enter your email and password" };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match" };
  }

  const supabase = await createClient();
  // 开了邮箱验证时,用户点验证邮件后经 /auth/callback 换 session,再回到 next
  // (比如注册前正要买的那条广告,见 BuyListingButton)。回调地址跟 OAuth 登录
  // 用的是同一个,已经在 Supabase 的 Redirect URLs 白名单里。
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.user) {
    return { error: "Sign up failed, please try again" };
  }

  if (data.session) {
    // 邮箱验证已关闭:注册即登录,直接建 profiles 记录。
    await ensureProfile(supabase, data.user);
    redirect(next);
  }

  // 邮箱验证已开启:此时还没有 session,没法立刻写 profiles(RLS 需要 auth.uid()）。
  // 提示用户验证邮箱,真正的 profiles 记录会在其验证后首次登录时补建。
  return {
    message: "Account created! Check your email to verify it, then log in.",
  };
}
