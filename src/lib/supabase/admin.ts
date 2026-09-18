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
 * 普通 dashboard 首页,都不是往下走。返回的是当前用户,方便调用方判断"是不是在操作自己"
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
  return user;
}
