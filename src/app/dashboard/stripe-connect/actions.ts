"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";
import { isStripeSupportedCountry } from "@/lib/stripe/countries";

export interface StripeConnectState {
  error?: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function startStripeOnboardingAction(
  _prevState: StripeConnectState,
  formData: FormData
): Promise<StripeConnectState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Stripe 账户 ID 只有 service_role 能读(README"安全复查"第 3 条);上面已确认是本人,只查自己这一行。
  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("country,stripe_connect_account_id")
    .eq("id", user.id)
    .single();

  let accountId = profile?.stripe_connect_account_id ?? null;

  if (!accountId) {
    const country = String(formData.get("country") ?? "");
    if (!isStripeSupportedCountry(country)) {
      return { error: "Please choose a country Stripe supports for payouts" };
    }

    const account = await stripe.accounts.create({
      type: "express",
      country,
      email: user.email ?? undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      // 每周一合并打款一次(2026-09-24 决定):Stripe Connect 按"每次打款"收
      // 0.25% + 固定费,并按"当月有打款的账户"收月费,默认每天打款会让小额订单的
      // 打款成本比平台收入还高。见 README"给卖家打款:每周一次"。
      settings: {
        payouts: { schedule: { interval: "weekly", weekly_anchor: "monday" } },
      },
    });
    accountId = account.id;

    // stripe_connect_account_id 决定放款转给谁,2026-09-18 起 UPDATE 权限收回给
    // authenticated 了(见 README"管理员系统"一节),不能再用普通 session client 写——
    // 这里的值是刚从 Stripe API 建号拿到的,不是用户能直接摆布的输入,用 service_role
    // client 写是安全的。
    const { error: saveError } = await createServiceClient()
      .from("profiles")
      .update({ country, stripe_connect_account_id: accountId })
      .eq("id", user.id);

    if (saveError) {
      return { error: `Failed to save Stripe account: ${saveError.message}` };
    }
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${SITE_URL}/dashboard/stripe-connect`,
    return_url: `${SITE_URL}/dashboard/stripe-connect`,
    type: "account_onboarding",
  });

  redirect(accountLink.url);
}
