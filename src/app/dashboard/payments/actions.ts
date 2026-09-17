"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, stripe } from "@/lib/stripe/server";
import type { SellerProfile } from "@/lib/supabase/types";

// 卖家发起 / 继续 Stripe Connect(Express)账户的入驻流程。
// 买家的付款要通过 destination charge 转给卖家的这个连接账户,
// 所以卖家必须先走完这一步、且 charges_enabled 才能真正收到订单的付款。
export async function startStripeOnboardingAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: sellerProfileRow } = await supabase
    .from("seller_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const sellerProfile = sellerProfileRow as SellerProfile | null;

  let accountId = sellerProfile?.stripe_account_id ?? null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    accountId = account.id;

    const { error: upsertError } = await supabase.from("seller_profiles").upsert(
      { user_id: user.id, stripe_account_id: accountId },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      redirect("/dashboard/payments?error=save_failed");
    }
  }

  const siteUrl = getSiteUrl();
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${siteUrl}/dashboard/payments?refresh=1`,
    return_url: `${siteUrl}/dashboard/payments?onboarded=1`,
    type: "account_onboarding",
  });

  redirect(accountLink.url);
}

// 已经入驻过的卖家打开 Stripe 自带的 Express 后台(查看余额、打款记录等)。
export async function openStripeExpressDashboardAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: sellerProfileRow } = await supabase
    .from("seller_profiles")
    .select("stripe_account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const accountId = (sellerProfileRow as { stripe_account_id: string | null } | null)
    ?.stripe_account_id;

  if (!accountId) {
    redirect("/dashboard/payments");
  }

  const loginLink = await stripe.accounts.createLoginLink(accountId);
  redirect(loginLink.url);
}
