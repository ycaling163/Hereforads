"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { safeRedirectPath } from "@/lib/safeRedirect";

const OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
type OtpType = (typeof OTP_TYPES)[number];

// 登录邮件链接的真正登录动作:用户在 /auth/continue 点了按钮才执行(POST),
// 邮箱安全扫描只会 GET 页面,不会点按钮,一次性的链接/验证码不会被它提前用掉。
export async function continueSignInAction(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "");
  const next = safeRedirectPath(formData.get("next") as string | null, "/dashboard/purchases");

  const supabase = await createClient();
  if (tokenHash && (OTP_TYPES as readonly string[]).includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as OtpType,
      token_hash: tokenHash,
    });
    if (!error && data.user) {
      await ensureProfile(supabase, data.user);
      redirect(next);
    }
  }

  // 链接已经用过(比如先填了同一封邮件里的验证码)或过期了:这个浏览器已经登录着就直接进 next。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(next);
  }
  redirect("/login?error=invalid_link");
}
