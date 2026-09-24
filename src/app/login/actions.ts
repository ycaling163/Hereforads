"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { sendSignInLink } from "@/lib/orders/signInLink";
import { EMAIL_PATTERN } from "@/lib/supabase/guest-checkout";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(formData.get("next") as string | null, "/listings");

  if (!email || !password) {
    return { error: "Please enter your email and password" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Incorrect email or password" };
  }

  if (data.user) {
    // 兜底:如果这个用户当初注册时因为邮箱验证还没建 profiles 记录,这里补建。
    await ensureProfile(supabase, data.user);
  }

  redirect(next);
}

export interface SignInLinkState {
  error?: string;
  sent?: boolean;
}

// 免密码登录:给已有账号发一封登录链接。主要给 guest 买家用——他们下单时建的账号没有
// 密码,下单那封登录链接过期后靠这个再进来(见 README"订单号与订单查询")。不管这个
// 邮箱有没有账号都显示"已发送",不让人借这里探测谁注册过。
export async function sendSignInLinkAction(
  _prevState: SignInLinkState,
  formData: FormData
): Promise<SignInLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Please enter a valid email address" };
  }
  const result = await sendSignInLink(email);
  if (result === "rate_limited") {
    return { error: "We just sent a link — please wait a minute before asking for another." };
  }
  return { sent: true };
}
