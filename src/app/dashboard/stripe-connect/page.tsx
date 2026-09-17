import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { StatCard } from "@/components/StatCard";
import { StripeConnectForm } from "./StripeConnectForm";
import { openStripeDashboardAction } from "./actions";

function formatBalance(amounts: { amount: number; currency: string }[]): string {
  if (amounts.length === 0) return "$0";
  return amounts
    .map((a) => `${(a.amount / 100).toFixed(2)} ${a.currency.toUpperCase()}`)
    .join(" · ");
}

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

  let totalSalesLabel = "$0";
  let availableLabel = "$0";
  let pendingLabel = "$0";

  if (onboarded && accountId) {
    const [{ data: orderRows }, balance] = await Promise.all([
      supabase
        .from("listing_orders")
        .select("amount,currency")
        .eq("seller_id", user.id)
        .neq("status", "pending_payment"),
      stripe.balance.retrieve({}, { stripeAccount: accountId }).catch((err) => {
        console.error("Failed to retrieve Stripe balance:", err);
        return null;
      }),
    ]);

    const salesByCurrency = new Map<string, number>();
    for (const order of orderRows ?? []) {
      salesByCurrency.set(
        order.currency,
        (salesByCurrency.get(order.currency) ?? 0) + order.amount
      );
    }
    totalSalesLabel =
      salesByCurrency.size === 0
        ? "$0"
        : [...salesByCurrency.entries()]
            .map(([currency, amount]) => `${amount} ${currency}`)
            .join(" · ");

    if (balance) {
      availableLabel = formatBalance(balance.available);
      pendingLabel = formatBalance(balance.pending);
    } else {
      availableLabel = "Unavailable";
      pendingLabel = "Unavailable";
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Payment Management
      </h1>
      {onboarded ? (
        <p className="mt-2 text-zinc-600">
          Your Stripe account is connected. Funds move here once a buyer
          confirms delivery, and Stripe pays them out to your bank on its own
          schedule.
        </p>
      ) : (
        <p className="mt-2 text-zinc-600">
          You need to finish Stripe onboarding before a listing can go live.
          Buyers can&apos;t see or buy a listing while it&apos;s still a draft.
        </p>
      )}

      {onboarded ? (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total sales" value={totalSalesLabel} />
            <StatCard label="Available to withdraw" value={availableLabel} />
            <StatCard label="Pending" value={pendingLabel} />
          </div>
          <form action={openStripeDashboardAction} className="mt-6">
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
            >
              View Stripe dashboard →
            </button>
          </form>
        </>
      ) : (
        <div className="mt-8 rounded-xl border border-zinc-200 p-6">
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
        </div>
      )}
    </div>
  );
}
