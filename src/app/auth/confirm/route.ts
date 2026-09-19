import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { safeRedirectPath } from "@/lib/safeRedirect";

// Supabase 官方推荐的 SSR 邮件确认落地页(见 README"Guest 结账"一节):
// magic link / 邮箱验证邮件里的链接带 token_hash + type,这里用它换一个真正
// 的 session(写 cookie),再跳到 next。目前唯一会打这个链接的邮件模板是
// Guest 结账用的 Magic Link(见 src/lib/supabase/guest-checkout.ts)——
// Supabase 后台的模板要先换成 token_hash 格式,不然默认模板走的是 GoTrue
// 自己托管的 /verify,根本不会到这个路由。
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
