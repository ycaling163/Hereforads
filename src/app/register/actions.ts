"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { safeRedirectPath } from "@/lib/safeRedirect";
import {
  TURNSTILE_FAILED_MESSAGE,
  missingSupabaseCaptcha,
  turnstileToken,
} from "@/lib/security/turnstile";

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
  // Turnstile token 交给 Supabase 校验(Supabase 后台开了 CAPTCHA 之后),见 src/lib/security/turnstile.ts。
  const captchaToken = turnstileToken(formData);
  if (missingSupabaseCaptcha(captchaToken)) {
    return { error: TURNSTILE_FAILED_MESSAGE };
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
      captchaToken: captchaToken || undefined,
    },
  });

  if (error?.code === "captcha_failed") {
    return { error: TURNSTILE_FAILED_MESSAGE };
  }

  // 这个邮箱已经有账号(常见情况:之前用这个邮箱以访客身份下过单,系统自动建了一个没有
  // 密码的账号)。开了邮箱验证时 Supabase 不报错,而是返回一个 identities 为空的 user;
  // 没开时报 user_already_exists。两种都引导去用登录链接登录、再设密码。
  const alreadyRegistered =
    error?.code === "user_already_exists" ||
    (!error && data.user && (data.user.identities?.length ?? 0) === 0);
  if (alreadyRegistered) {
    return {
      error:
        "This email already has an account — maybe from an order you placed as a guest. On the login page, choose \"Email me a sign-in link\", then set a password under Dashboard → Password.",
    };
  }

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
