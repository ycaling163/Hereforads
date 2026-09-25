import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { safeRedirectPath } from "@/lib/safeRedirect";

// Supabase 官方推荐的 SSR 邮件确认落地页(见 README"Guest 结账"一节):
// Magic Link 邮件里的链接带 token_hash + type,这里用它换一个真正的 session
// (写 cookie),再跳到 next。依赖 Supabase 后台把 Magic Link 邮件模板换成
// token_hash 格式(见 README)——这一步需要项目已经配了 custom SMTP(自带的
// 邮件服务不让编辑模板),2026-09-19 接入 Resend 之后才具备这个前提。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard/purchases");

  // 带 token_hash 的登录邮件链接:不在这里直接登录,转到 /auth/continue 让用户点按钮
  // 再登录——邮箱安全扫描(Hotmail/Outlook Safe Links 等)会先 GET 一遍链接,直接登录的话
  // 一次性凭证会被扫描器用掉,用户自己再点就"已过期"(2026-09-25 产品负责人测试反馈)。
  if (tokenHash && type) {
    const params = new URLSearchParams({ token_hash: tokenHash, type, next });
    redirect(`/auth/continue?${params.toString()}`);
  }

  // 2026-09-24 之前用 signInWithOtp 建的 guest 账号没确认过邮箱,他们要登录链接时 Supabase
  // 发的是 "Confirm sign up" 邮件({{ .ConfirmationURL }} 格式),点开后 Supabase 带着 PKCE
  // 的 code 跳回这里(emailRedirectTo 是 /auth/confirm)。按 code 换 session,跟
  // /auth/callback 一样;换不出来(比如在另一个浏览器打开)就去登录页重新要链接。
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await ensureProfile(supabase, data.user);
      redirect(next);
    }
  }

  // 链接已经用过(比如先在登录页填了同一封邮件里的验证码)或过期了:如果这个浏览器已经
  // 登录着,直接进 next,不要显示"链接失效"吓人;否则去登录页重新要链接。
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (user) {
    redirect(next);
  }
  redirect("/login?error=invalid_link");
}
