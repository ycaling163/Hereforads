"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
      return { error: "请选择一个 Stripe 支持收款的国家/地区" };
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

    const { error: saveError } = await supabase
      .from("profiles")
      .update({ country, stripe_connect_account_id: accountId })
      .eq("id", user.id);

    if (saveError) {
      return { error: `保存 Stripe 账户失败:${saveError.message}` };
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
