import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./service";
import { DEFAULT_USER_ROLE } from "./enums";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResolveGuestBuyerResult =
  | { buyerId: string; error?: undefined }
  | { buyerId?: undefined; error: string };

/**
 * Guest 结账(不强制先注册):用传入的匿名 key client 触发一封 magic link
 * 邮件——这个邮箱没有账号就静默建一个(不设密码),已经有账号就直接发登录
 * 链接,见 supabase.auth.signInWithOtp() 文档。signInWithOtp 本身不会把新建
 * 用户的 id 返回给调用方,所以紧接着用 service_role 调 get_user_id_by_email()
 * 把邮箱查回 id,再补一条 profiles 记录(跟 ensureProfile 一样用
 * ignoreDuplicates,已存在的账号不会被这次调用覆盖)。
 *
 * 依赖三处手动配置,见 README"Guest 结账"一节:1) 数据库里的
 * get_user_id_by_email() 函数;2) Supabase 后台 Authentication → URL
 * Configuration 把 `{站点域名}/auth/confirm` 加进 Redirect URLs 白名单
 * (故意不带 query string,保持这个跳转地址是个固定字面量,白名单那边照抄就行);
 * 3) 配了 custom SMTP(2026-09-19 接入 Resend)之后,把 Magic Link 邮件模板
 * 换成 token_hash 格式,落地到 src/app/auth/confirm/route.ts。这几步没做完,
 * 买家会收不到邮件/邮件里的链接打不开对应的登录态,但下单本身(建
 * profiles/listing_orders、走 Stripe Checkout)不受影响。
 */
export async function resolveGuestBuyerId(
  anonClient: SupabaseClient,
  email: string
): Promise<ResolveGuestBuyerResult> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error: otpError } = await anonClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (otpError) {
    return { error: "Couldn't send you a login link, please try again" };
  }

  const service = createServiceClient();
  const { data: buyerId, error: lookupError } = await service.rpc(
    "get_user_id_by_email",
    { p_email: email }
  );

  if (lookupError || !buyerId) {
    return { error: "Couldn't set up your order, please try again" };
  }

  const { error: profileError } = await service.from("profiles").upsert(
    { id: buyerId, role: DEFAULT_USER_ROLE },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (profileError) {
    console.error("Failed to ensure guest profile:", profileError.message);
  }

  return { buyerId: buyerId as string };
}
