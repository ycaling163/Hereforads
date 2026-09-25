"use server";

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserEmail } from "@/lib/email/send";
import { sendSignInLink } from "@/lib/orders/signInLink";
import { LIMITS, checkRateLimits, clientIp } from "@/lib/security/rateLimit";
import { missingSupabaseCaptcha, turnstileToken } from "@/lib/security/turnstile";

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 订单只读页上的 "Email me a sign-in link":只发到这张订单的买家邮箱(不接受页面上
// 填的任意邮箱),拿到链接的人没法借这个按钮给别人发邮件。限流跟登录页的"发登录链接"
// 共用同一组额度;Turnstile token 交给 Supabase 校验。
export async function sendOrderSignInLinkAction(token: string, formData: FormData): Promise<void> {
  if (!TOKEN_PATTERN.test(token)) {
    redirect("/orders/find");
  }
  const { data: order } = await createServiceClient()
    .from("listing_orders")
    .select("buyer_id,buyer_email")
    .eq("view_token", token)
    .maybeSingle();
  if (!order) {
    redirect("/orders/find");
  }

  const captchaToken = turnstileToken(formData);
  if (missingSupabaseCaptcha(captchaToken)) {
    redirect(`/orders/${token}?link=captcha`);
  }

  const email = order.buyer_email ?? (await getUserEmail(order.buyer_id));
  let result: Awaited<ReturnType<typeof sendSignInLink>> = "sent";
  if (email) {
    result = (await checkRateLimits(LIMITS.signInLink(await clientIp(), email)))
      ? await sendSignInLink(email, captchaToken)
      : "rate_limited";
  }
  const status = result === "rate_limited" ? "wait" : result === "captcha_failed" ? "captcha" : "sent";
  redirect(`/orders/${token}?link=${status}`);
}
