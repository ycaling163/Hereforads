"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { sendSignInLink } from "@/lib/orders/signInLink";
import { EMAIL_PATTERN } from "@/lib/supabase/guest-checkout";
import { LIMITS, checkRateLimits, clientIp, formatUkTime } from "@/lib/security/rateLimit";
import {
  TURNSTILE_FAILED_MESSAGE,
  missingSupabaseCaptcha,
  turnstileToken,
  verifyTurnstile,
} from "@/lib/security/turnstile";

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
  // Turnstile token 交给 Supabase 校验(Supabase 后台开了 CAPTCHA 之后),见 src/lib/security/turnstile.ts。
  const captchaToken = turnstileToken(formData);
  if (missingSupabaseCaptcha(captchaToken)) {
    return { error: TURNSTILE_FAILED_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: captchaToken || undefined },
  });

  if (error?.code === "captcha_failed") {
    return { error: TURNSTILE_FAILED_MESSAGE };
  }
  if (error) {
    // Guest 下单时建的账号没有密码,用密码登录一定失败——提示他们用登录链接。
    return {
      error:
        "Incorrect email or password. Bought as a guest or never set a password? Use \"Email me a sign-in link\" above.",
    };
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
  /** 发送成功后提示"这个小时还能再要几封"(产品负责人 2026-09-25 测试后要求)。 */
  quotaNote?: string;
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
  const captchaToken = turnstileToken(formData);
  if (missingSupabaseCaptcha(captchaToken)) {
    return { error: TURNSTILE_FAILED_MESSAGE };
  }
  const limit = await checkRateLimits(LIMITS.signInLink(await clientIp(), email));
  if (!limit.allowed) {
    return { error: limit.message };
  }
  const result = await sendSignInLink(email, captchaToken);
  if (result === "rate_limited") {
    return { error: "We just sent a link — please wait a minute before asking for another." };
  }
  if (result === "captcha_failed") {
    return { error: TURNSTILE_FAILED_MESSAGE };
  }
  const quotaNote =
    limit.remaining === null
      ? undefined
      : limit.remaining === 0
        ? `That was the last sign-in email you can ask for until ${formatUkTime(limit.resetAt)}.`
        : `You can ask for ${limit.remaining} more sign-in email${limit.remaining === 1 ? "" : "s"} before ${formatUkTime(limit.resetAt)}.`;
  return { sent: true, quotaNote };
}

export interface VerifyCodeState {
  error?: string;
}

// 登录邮件里的 6 位验证码(见 README"Guest 登录与设置密码"):在电脑上下单、在手机上看
// 邮件时,点手机里的链接登录的是手机浏览器;在电脑登录页填验证码就能在电脑上登录。
export async function verifySignInCodeAction(
  _prevState: VerifyCodeState,
  formData: FormData
): Promise<VerifyCodeState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = safeRedirectPath(formData.get("next") as string | null, "/dashboard/purchases");

  if (!EMAIL_PATTERN.test(email) || !/^\d{6,10}$/.test(token)) {
    return { error: "Please enter your email and the code from the email" };
  }

  // Supabase 的 /verify 接口不校验 CAPTCHA,这个入口由我们自己校验 Turnstile。
  // 先限流再校验,刷接口的请求不用每次都去问 Cloudflare。
  const ip = await clientIp();
  const limit = await checkRateLimits(LIMITS.verifyCode(ip, email));
  if (!limit.allowed) {
    return { error: limit.message };
  }
  if (!(await verifyTurnstile(turnstileToken(formData), ip))) {
    return { error: TURNSTILE_FAILED_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) {
    const attemptsLeft =
      limit.remaining === null
        ? ""
        : limit.remaining === 0
          ? ` No attempts left until ${formatUkTime(limit.resetAt)}.`
          : ` ${limit.remaining} attempt${limit.remaining === 1 ? "" : "s"} left.`;
    return {
      error: `That code is wrong, has expired, or was already used (each email's link and code work once, and asking for a new email cancels the old one).${attemptsLeft}`,
    };
  }

  await ensureProfile(supabase, data.user);
  redirect(next);
}
