import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/supabase/enums";
import { confirmOrderAction, rejectOrderAction } from "./actions";
import type { Order } from "@/lib/supabase/types";

export default async function ReceivedOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const orders = (orderRows ?? []) as Order[];

  const spaceIds = [...new Set(orders.map((o) => o.ad_space_id))];
  const buyerIds = [...new Set(orders.map((o) => o.buyer_id))];

  const [{ data: spaceRows }, { data: buyerRows }] = await Promise.all([
    spaceIds.length
      ? supabase.from("ad_spaces").select("id,title").in("id", spaceIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    buyerIds.length
      ? supabase.from("profiles").select("id,display_name").in("id", buyerIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
  ]);

  const spaceTitleById = new Map(
    (spaceRows ?? []).map((s) => [s.id as string, s.title as string])
  );
  const buyerNameById = new Map(
    (buyerRows ?? []).map((p) => [
      p.id as string,
      (p.display_name as string | null) ?? "匿名买家",
    ])
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        收到的预订请求
      </h1>

      {error === "update_failed" && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          操作未生效,可能是数据库权限(RLS 策略)未开放卖家更新订单状态,请联系管理员检查。
        </p>
      )}

      {orders.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">还没有收到预订请求。</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-zinc-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-zinc-900">
                  {spaceTitleById.get(order.ad_space_id) ?? "广告位"}
                </p>
                <span className="rounded-full bg-zinc-900/5 px-2 py-0.5 text-xs font-medium text-zinc-600">
                  {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                买家:{buyerNameById.get(order.buyer_id) ?? "匿名买家"} ·{" "}
                {order.start_date} 至 {order.end_date} · {order.amount}{" "}
                {order.currency}
              </p>
              {order.status === "pending_payment" && (
                <div className="mt-3 flex items-center gap-2">
                  <form action={confirmOrderAction.bind(null, order.id)}>
                    <button
                      type="submit"
                      className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                    >
                      确认预订
                    </button>
                  </form>
                  <ConfirmSubmitForm
                    action={rejectOrderAction.bind(null, order.id)}
                    confirmMessage="确定要拒绝这个预订请求吗?"
                    label="拒绝"
                    className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
