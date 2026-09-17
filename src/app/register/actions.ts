"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";

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

  if (!email || !password) {
    return { error: "请填写邮箱和密码" };
  }
  if (password.length < 6) {
    return { error: "密码至少需要 6 位" };
  }
  if (password !== confirmPassword) {
    return { error: "两次输入的密码不一致" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  if (!data.user) {
    return { error: "注册失败,请稍后再试" };
  }

  if (data.session) {
    // 邮箱验证已关闭:注册即登录,直接建 profiles 记录。
    await ensureProfile(supabase, data.user);
    redirect("/listings");
  }

  // 邮箱验证已开启:此时还没有 session,没法立刻写 profiles(RLS 需要 auth.uid()）。
  // 提示用户验证邮箱,真正的 profiles 记录会在其验证后首次登录时补建。
  return {
    message: "注册成功!请查收邮箱完成验证,验证后即可登录。",
  };
}
