import type { SupabaseClient, User } from "@supabase/supabase-js";
import { DEFAULT_USER_ROLE } from "./enums";

/**
 * 保证已登录用户在 profiles 表里有一条记录。
 * 注册成功后立刻拿到 session 时会调用一次；如果 Supabase 项目开启了邮箱验证、
 * 注册时还没有 session,则会在用户验证后第一次登录时补建这条记录。
 * 用 upsert + ignoreDuplicates 保证重复调用是安全的。
 */
export async function ensureProfile(supabase: SupabaseClient, user: User) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      role: DEFAULT_USER_ROLE,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("ensureProfile failed:", error.message);
  }
}
