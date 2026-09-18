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

  const { data: profile } = await supabase
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

export async function openStripeDashboardAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
