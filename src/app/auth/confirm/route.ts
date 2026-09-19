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

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
      token_hash: tokenHash,
    });

    if (!error && data.user) {
      await ensureProfile(supabase, data.user);
      redirect(next);
    }
  }

  redirect("/login?error=invalid_link");
}
