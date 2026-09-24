import { createServiceClient } from "./service";
import { DEFAULT_USER_ROLE } from "./enums";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResolveGuestBuyerResult =
  | { buyerId: string; error?: undefined }
  | { buyerId?: undefined; error: string };

/**
 * Guest 结账(不强制先注册):用买家填的邮箱找到或新建一个账号,把订单挂在这个账号下。
 *
 * 2026-09-24 起新账号用 service_role 的 admin.createUser 直接建成"邮箱已确认"、不设密码,
 * **下单时不发任何 Supabase 邮件**(之前用 signInWithOtp 建号,Supabase 会给新邮箱发一封
 * "Confirm your email",guest 会同时收到它和我们的订单确认邮件,而且这种没确认的账号之后
 * 要登录链接也只会再收到确认邮件)。买家要登录时用登录页/订单页的 "Email me a sign-in
 * link"(免密码登录链接 + 6 位验证码),登录后会提示设密码,见 README"Guest 登录与设置
 * 密码"。
 *
 * 标记成"已确认"不等于有人冒用了这个邮箱:这个账号没有密码,要登录只能点发到这个邮箱
 * 的登录链接,只有邮箱主人收得到。
 *
 * 依赖数据库里的 get_user_id_by_email() 函数(见 README"Guest 结账"一节)。
 */
export async function resolveGuestBuyerId(email: string): Promise<ResolveGuestBuyerResult> {
  const service = createServiceClient();

  const lookup = async () => {
    const { data, error } = await service.rpc("get_user_id_by_email", { p_email: email });
    if (error) console.error("Guest checkout: get_user_id_by_email failed:", error.message);
    return (data as string | null) ?? null;
  };

  let buyerId = await lookup();
  if (!buyerId) {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (created?.user) {
      buyerId = created.user.id;
    } else {
      // 两个请求同时用同一个新邮箱下单时,另一个可能刚建好——再查一次。
      buyerId = await lookup();
      if (!buyerId) {
        console.error("Guest checkout: createUser failed:", createError?.message);
        return { error: "Couldn't set up your order, please try again" };
      }
    }
  }

  const { error: profileError } = await service.from("profiles").upsert(
    { id: buyerId, role: DEFAULT_USER_ROLE },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (profileError) {
    console.error("Failed to ensure guest profile:", profileError.message);
  }

  return { buyerId };
}
