import { createClient } from "@/lib/supabase/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * 给已有账号发一封免密码登录链接(Supabase magic link)。Guest 买家下单时建的账号没有
 * 密码,下单那封登录链接过期后只能靠这个再登录(见 README"订单号与订单查询")。
 * shouldCreateUser: false —— 这里不建新账号。跳转地址跟 guest 结账用的是同一个固定的
 * /auth/confirm(Supabase 后台 Redirect URLs 白名单里已经有),登录后默认进 Purchases 页。
 *
 * 返回 "rate_limited" 时让用户稍后再试;"captcha_failed" 时让用户重新过一次 Turnstile
 * (captchaToken 由 Supabase 校验,见 src/lib/security/turnstile.ts);其他错误(包括
 * 邮箱没有账号)一律当成功处理,不让人借这个接口探测某个邮箱有没有注册。
 */
export async function sendSignInLink(
  email: string,
  captchaToken: string
): Promise<"sent" | "rate_limited" | "captcha_failed"> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${SITE_URL}/auth/confirm`,
      captchaToken: captchaToken || undefined,
    },
  });
  if (error) {
    if (error.status === 429) return "rate_limited";
    if (error.code === "captcha_failed") return "captcha_failed";
    console.error("Sign-in link failed:", error.message);
  }
  return "sent";
}
