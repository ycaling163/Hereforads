import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/supabase/enums";
import type { Order } from "@/lib/supabase/types";

export default async function MyBookingsPage() {
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
