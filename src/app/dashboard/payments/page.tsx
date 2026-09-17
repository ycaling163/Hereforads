import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  openStripeExpressDashboardAction,
  startStripeOnboardingAction,
} from "./actions";
import type { SellerProfile } from "@/lib/supabase/types";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; onboarded?: string }>;
}) {
  const { error, onboarded } = await searchParams;
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
  const hasAccount = !!sellerProfile?.stripe_account_id;
  const canReceivePayments = !!sellerProfile?.stripe_charges_enabled;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        收款设置
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        买家预订后需要付款,你需要先连接 Stripe 账户,买家的付款才能转到你的账户。
      </p>

      {error === "save_failed" && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          保存 Stripe 账户信息失败,请重试或联系管理员。
        </p>
      )}
      {onboarded === "1" && !canReceivePayments && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Stripe 那边的资料可能还没完全通过审核,状态还没变成&ldquo;可收款&rdquo;,
          稍后刷新本页看看,或者点下面的按钮继续补充资料。
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              canReceivePayments
                ? "bg-emerald-500"
                : hasAccount
                  ? "bg-amber-500"
                  : "bg-zinc-300"
            }`}
          />
          <p className="font-medium text-zinc-900">
            {canReceivePayments
              ? "已连接,可以正常收款"
              : hasAccount
                ? "已创建账户,资料尚未补全,还不能收款"
                : "尚未连接 Stripe 账户"}
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <form action={startStripeOnboardingAction}>
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              {hasAccount ? "继续补充资料" : "连接 Stripe 账户"}
            </button>
          </form>
          {hasAccount && (
            <form action={openStripeExpressDashboardAction}>
              <button
                type="submit"
                className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
              >
                打开 Stripe 后台
              </button>
            </form>
          )}
        </div>
      </div>

      {!canReceivePayments && (
        <p className="mt-4 text-sm text-zinc-500">
          在完成 Stripe 入驻并被标记为&ldquo;可收款&rdquo;之前,买家在&ldquo;我的预订&rdquo;里
          即使确认了预订也无法完成付款。
        </p>
      )}
    </div>
  );
}
