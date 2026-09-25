import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";
import { StatCard } from "@/components/StatCard";
import { StripeConnectForm } from "./StripeConnectForm";

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

  // Stripe 账户 ID 只有 service_role 能读(README"安全复查"第 3 条);上面已确认是本人,只查自己这一行。
  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("stripe_connect_account_id,stripe_onboarded")
    .eq("id", user.id)
    .single();

  let onboarded = profile?.stripe_onboarded ?? false;
  const accountId = profile?.stripe_connect_account_id ?? null;
  let payoutsEnabled = false;
  let defaultCurrency: string | null = null;

  // 只要账户建了就查一次 Stripe 那边的实时状态:一是给 stripe_onboarded 兜底刷新
  // (webhook 没配好的时候,比如本地开发没有公网地址接收 account.updated),
  // 二是不管有没有 onboarded 都要知道 payouts_enabled/default_currency——
  // charges_enabled(能收款)和 payouts_enabled(能提现到银行账户)是 Stripe 两个
  // 独立的能力位,账户可以先能收款、还没填银行账户导致提现开不了,不能只看前者。
  if (accountId) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      payoutsEnabled = Boolean(account.payouts_enabled);
      defaultCurrency = account.default_currency?.toUpperCase() ?? null;
      if (!onboarded) {
        onboarded = Boolean(account.charges_enabled && account.details_submitted);
        if (onboarded) {
          // profiles.stripe_onboarded 的 UPDATE 权限 2026-09-18 起收回给 authenticated
          // 了(见 README"管理员系统"一节)——这里的判断依据是刚从 Stripe API 实时查到的
          // 结果,不是用户自己填的,值得信任,所以用 service_role client 写,不能再用
          // 上面这个跟着登录 session 走的 `supabase`。
          await createServiceClient()
            .from("profiles")
            .update({ stripe_onboarded: true })
            .eq("id", user.id);
        }
      }
    } catch (err) {
      console.error("Failed to refresh Stripe account status:", err);
    }
  }

  let totalSalesLabel = "$0";
  let availableLabel = "$0";
  let pendingLabel = "$0";
  let hasForeignCurrencySales = false;

  if (onboarded && accountId) {
    const [{ data: orderRows }, balance] = await Promise.all([
      supabase
        .from("listing_orders")
        .select("amount,currency")
        .eq("seller_id", user.id)
        .not("status", "in", "(pending_payment,cancelled)"),
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
    hasForeignCurrencySales = [...salesByCurrency.keys()].some(
      (currency) => currency !== defaultCurrency
    );

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

      {onboarded && !payoutsEnabled && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-800">
            You can publish listings and get paid, but Stripe still needs a
            bank account before it can pay any of it out to you — that&apos;s
            why there&apos;s no balance to withdraw yet.
          </p>
          <div className="mt-3">
            <StripeConnectForm
              hasAccount
              submitLabel="Finish payout setup"
            />
          </div>
        </div>
      )}

      {onboarded ? (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total sales" value={totalSalesLabel} />
            <StatCard label="Available to withdraw" value={availableLabel} />
            <StatCard label="Pending" value={pendingLabel} />
          </div>
          {defaultCurrency && (
            <p className={`mt-3 text-xs ${hasForeignCurrencySales ? "text-amber-700" : "text-zinc-500"}`}>
              Your bank payouts are in {defaultCurrency}. We send your earnings in the
              currency the buyer paid (your listing&apos;s currency); if that isn&apos;t{" "}
              {defaultCurrency}, Stripe converts it as soon as it reaches your Stripe account,
              at about 2% — paid by you. To avoid this, price your listings in{" "}
              {defaultCurrency}.
            </p>
          )}
          <div className="mt-6">
            <a
              href="/api/stripe/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
            >
              View Stripe dashboard ↗
            </a>
            <p className="mt-2 text-xs text-zinc-500">Opens Stripe in a new tab.</p>
          </div>
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
