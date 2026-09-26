import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "./server";

/**
 * admins 表除了"能查自己那一行"的 select 策略,没给 authenticated 开任何
 * insert/update/delete 权限 —— 加管理员只能去 Supabase 后台手动插入一行,
 * 代码里没有任何路径能自我提权成管理员。见 README"管理员系统"一节。
 */
export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * 管理员专用 server action 的入口校验:没登录踢去登录页,登录了但不是管理员踢回
 * 普通 dashboard 首页,这次登录没做两步验证的去 /dashboard/two-factor,都不是往下走。返回的是当前用户,方便调用方判断"是不是在操作自己"
 * (比如管理员不能把自己封禁掉)。
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  if (!(await isAdmin(supabase, user.id))) {
    redirect("/dashboard");
  }
  // 管理员必须两步验证(产品负责人 2026-09-26,README"管理员两步验证"):这次登录没用
  // 验证器 App 验证过(会话不是 aal2)就先去验证/设置,光有密码进不了后台、也调不了
  // 任何管理员 action。上面 getUser() 已经向 Supabase 校验过这个会话的令牌,aal 读的就是它。
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || aal?.currentLevel !== "aal2") {
    redirect("/dashboard/two-factor");
  }
  return user;
}
