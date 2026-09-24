import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { safeRedirectPath } from "@/lib/safeRedirect";

// OAuth(Google/Facebook)回调落地页 —— oauth-actions.ts 里 signInWithOAuth
// 生成的 authorize URL 把 redirectTo 指到这里,用户同意授权后 Supabase 会带着
// `code` 跳回来,这里用 exchangeCodeForSession 换 session(写 cookie)。跟
// auth/confirm/route.ts(邮箱验证走 token_hash + verifyOtp)是两条不同的换
// session 路径,不能共用同一个 route。注册的邮箱验证链接(registerAction 的
// emailRedirectTo)也落到这里,同样是 PKCE 的 code。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/listings");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      await ensureProfile(supabase, data.user);
      redirect(next);
    }
  }

  // 保留 next:比如注册验证邮件在另一个浏览器打开、换不出 session 时,用户登录后
  // 仍然回到原来要去的页面。
  redirect(`/login?error=oauth_failed&next=${encodeURIComponent(next)}`);
}
