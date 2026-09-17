"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "请填写邮箱和密码" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "邮箱或密码不正确" };
  }

  if (data.user) {
    // 兜底:如果这个用户当初注册时因为邮箱验证还没建 profiles 记录,这里补建。
    await ensureProfile(supabase, data.user);
  }

  redirect("/listings");
}
