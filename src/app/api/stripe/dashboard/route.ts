import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const { data: profile } = await supabase
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
