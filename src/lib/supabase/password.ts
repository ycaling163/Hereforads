import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * 这个账号有没有设过密码(2026-09-24 加,见 README"Guest 登录与设置密码")。Guest 下单
 * 时建的账号没有密码,只能用免密码登录链接/验证码登录;登录后在 Dashboard 顶部提醒他们
 * 设一个密码。Supabase 的 user 对象里看不出有没有密码,靠数据库函数
 * current_user_has_password() 查 auth.users(只能查自己)。函数还没建(SQL 没执行)时
 * 返回 null,调用方当成"不知道",不提醒也不报错。
 */
export async function hasPassword(supabase: SupabaseClient): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("current_user_has_password");
  if (error) return null;
  return data === true;
}

/** 用 Google/Facebook 登录的账号不需要密码,不提醒。 */
export function usesSocialLogin(user: User): boolean {
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [
    user.app_metadata?.provider as string,
  ];
  return providers.some((p) => p && p !== "email");
}
