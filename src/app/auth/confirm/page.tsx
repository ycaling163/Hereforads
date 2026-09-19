"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/safeRedirect";

// Guest 结账(见 README"Guest 结账"一节)的 Magic Link 邮件落地页。走的是
// Supabase 默认邮件模板(后台不装 custom SMTP 改不了模板,见 2026-09-19 的
// 调整)——默认模板的链接是 GoTrue 自己托管的 /verify,验证完把
// access_token/refresh_token 塞进跳转回来的 URL **fragment**
// (`#access_token=...`),fragment 浏览器不会发给服务器,所以只能靠这个
// 客户端页面来处理:createBrowserClient() 默认 detectSessionInUrl,
// getSession() 会把 fragment 里的 token 解析出来、写成服务端也能读的 cookie
// (@supabase/ssr 的 browser client 就是干这个的),写完再客户端跳转到
// next,这时候访问 /dashboard/purchases 才会真的带着登录态。
function AuthConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard/purchases");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? next : "/login?error=invalid_link");
    });
  }, [next, router]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16 text-sm text-zinc-500">
      Logging you in…
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={null}>
      <AuthConfirmInner />
    </Suspense>
  );
}
