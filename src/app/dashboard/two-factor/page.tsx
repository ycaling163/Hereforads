import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/supabase/admin";
import { TwoFactorForm } from "./TwoFactorForm";

// 管理员两步验证(README"管理员两步验证"):requireAdmin 发现这次登录没做两步验证
// (会话不是 aal2)就跳到这里。第一次来:扫二维码绑定验证器 App;以后每次登录:输 6 位码。
export default async function TwoFactorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isAdmin(supabase, user.id))) redirect("/dashboard");

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Two-factor sign-in</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Admin pages can move money, so they need a code from an authenticator app (Google
        Authenticator, 1Password, Authy…) as well as your password.
      </p>
      <div className="mt-8">
        <TwoFactorForm />
      </div>
    </div>
  );
}
