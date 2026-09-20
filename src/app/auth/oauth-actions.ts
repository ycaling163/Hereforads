"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safeRedirect";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export type OAuthProvider = "google" | "facebook";

// Login/RegisterForm 里的按钮用 `oauthSignIn.bind(null, "google", next)` 当
// form action 调用(Next.js 官方推荐的"给 server action 多绑一个参数"写法)。
// signInWithOAuth 本身不建 session,只是拿到 provider 的 authorize URL,真正
// 换 session 在 /auth/callback 里(用户在 Google/Facebook 那边同意后跳回来)。
export async function oauthSignIn(provider: OAuthProvider, next: string | undefined) {
  const safeNext = safeRedirectPath(next, "/listings");
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext)}`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth_failed");
  }

  redirect(data.url);
}
