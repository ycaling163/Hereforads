"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { passwordProblem } from "@/lib/passwordRules";

export interface SetPasswordState {
  error?: string;
}

// 设置/修改密码(见 README"Guest 登录与设置密码")。免密码登录链接进来的 guest 账号没有
// 密码,设了以后下次能用邮箱 + 密码登录。最短 6 位,跟注册页一致。
export async function setPasswordAction(
  _prevState: SetPasswordState,
  formData: FormData
): Promise<SetPasswordState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const weakPassword = passwordProblem(password);
  if (weakPassword) {
    return { error: weakPassword };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Supabase 开了"Secure password change"时,登录太久的 session 改密码要重新验证。
    if (error.code === "reauthentication_needed" || error.status === 401) {
      return {
        error:
          "For your security, please log in again (you can use an email sign-in link), then set your password.",
      };
    }
    if (error.code === "same_password") {
      return { error: "That's already your password" };
    }
    console.error("Set password failed:", error.message);
    return { error: error.message };
  }

  redirect("/dashboard/password?saved=1");
}
