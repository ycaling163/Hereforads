import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";

// Payment Management 页的 "View Stripe dashboard":在新标签页里打开(产品负责人 2026-09-25
// 要求,卖家看完 Stripe 还留在我们的页面上)。表单提交的 server action 没法在新标签页打开,
// 所以改成普通链接指向这里:生成一次性的 Stripe Express 登录链接再跳过去。
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/dashboard/stripe-connect");
  }

  // Stripe 账户 ID 只有 service_role 能读(README"安全复查"第 3 条);上面已确认是本人,只查自己这一行。
  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", user.id)
    .single();
  const accountId = profile?.stripe_connect_account_id;
  if (!accountId) {
    redirect("/dashboard/stripe-connect");
  }

  const loginLink = await stripe.accounts.createLoginLink(accountId);
  redirect(loginLink.url);
}
