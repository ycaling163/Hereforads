import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/supabase/enums";
import type { Order } from "@/lib/supabase/types";
import { createCheckoutSessionAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "找不到这个预订。",
  not_payable: "这个预订当前状态不能付款(可能已经付过款,或者卖家还没确认)。",
  seller_not_ready: "卖家还没完成 Stripe 收款设置,暂时无法付款,请稍后再试。",
  checkout_failed: "创建支付会话失败,请重试。",
};

export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; paid?: string; cancelled?: string }>;
}) {
  const { error, paid, cancelled } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: orderRows } = await supabase
    .from("orders")
    .select("*")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  const orders = (orderRows ?? []) as Order[];

  const spaceIds = [...new Set(orders.map((o) => o.ad_space_id))];
  const { data: spaceRows } = spaceIds.length
    ? await supabase.from("ad_spaces").select("id,title").in("id", spaceIds)
    : { data: [] as { id: string; title: string }[] };

  const spaceTitleById = new Map(
    (spaceRows ?? []).map((s) => [s.id as string, s.title as string])
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        我的预订
      </h1>

      {paid === "1" && (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          支付成功,卖家会尽快为你上架广告位。
        </p>
      )}
      {cancelled === "1" && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-700">
          支付已取消,你可以随时回来重新付款。
        </p>
      )}
      {error && ERROR_MESSAGES[error] && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          {ERROR_MESSAGES[error]}
        </p>
      )}

      {orders.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">
          还没有预订过广告位,来
          <Link href="/spaces" className="mx-1 underline">
            看看有什么
          </Link>
          吧。
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-zinc-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/spaces/${order.ad_space_id}`}
                  className="font-medium text-zinc-900 hover:underline"
                >
                  {spaceTitleById.get(order.ad_space_id) ?? "广告位"}
                </Link>
                <span className="rounded-full bg-zinc-900/5 px-2 py-0.5 text-xs font-medium text-zinc-600">
                  {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {order.start_date} 至 {order.end_date} · {order.amount}{" "}
                {order.currency}
              </p>
              {order.status === "confirmed" && (
                <form
                  action={createCheckoutSessionAction.bind(null, order.id)}
                  className="mt-3"
                >
                  <button
                    type="submit"
                    className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                  >
                    去支付
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
