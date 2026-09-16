import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { StripeConnectForm } from "./StripeConnectForm";

export default async function StripeConnectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id,stripe_onboarded")
    .eq("id", user.id)
    .single();

  let onboarded = profile?.stripe_onboarded ?? false;
  const accountId = profile?.stripe_connect_account_id ?? null;

  // 如果账户已经建了,顺手用 Stripe 那边的实时状态兜底刷新一次 stripe_onboarded——
  // webhook 没配好(比如本地开发没有公网地址接收 account.updated)的时候,
  // 这里能保证页面看到的状态不会一直卡在过期的 false。
  if (accountId && !onboarded) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      onboarded = Boolean(account.charges_enabled && account.details_submitted);
      if (onboarded) {
        await supabase
          .from("profiles")
          .update({ stripe_onboarded: true })
          .eq("id", user.id);
      }
    } catch (err) {
      console.error("Failed to refresh Stripe account status:", err);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Stripe payouts
      </h1>
      <p className="mt-2 text-zinc-600">
        You need to finish Stripe onboarding before a listing can go live.
        Buyers can&apos;t see or buy a listing while it&apos;s still a draft.
      </p>

      <div className="mt-8 rounded-xl border border-zinc-200 p-6">
        {onboarded ? (
          <p className="text-sm font-medium text-green-700">
            ✓ Stripe onboarding complete — you can publish listings now.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-zinc-600">
              {accountId
                ? "Onboarding isn't finished yet."
                : "You haven't started Stripe onboarding yet."}
            </p>
            <StripeConnectForm
              hasAccount={Boolean(accountId)}
              submitLabel={
                accountId ? "Continue Stripe onboarding" : "Start Stripe onboarding"
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
