import type { SupabaseClient, User } from "@supabase/supabase-js";
import { DEFAULT_USER_ROLE } from "./enums";

/**
 * 保证已登录用户在 profiles 表里有一条记录。
 * 注册成功后立刻拿到 session 时会调用一次；如果 Supabase 项目开启了邮箱验证、
 * 注册时还没有 session,则会在用户验证后第一次登录时补建这条记录。
 * 用 upsert + ignoreDuplicates 保证重复调用是安全的。
 */
export async function ensureProfile(supabase: SupabaseClient, user: User) {
  // OAuth(Google/Facebook)登录时 user_metadata 里带着 full_name/name,借这个
  // 机会顺手填一下 display_name,省得用户还要手动去 /dashboard/profile 填一遍。
  // 邮箱注册没有这些字段,取出来是 undefined,不影响原来的行为。
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      role: DEFAULT_USER_ROLE,
      display_name: displayName,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("ensureProfile failed:", error.message);
  }
}
