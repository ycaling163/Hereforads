import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { LISTING_ORDER_STATUS_LABELS } from "@/lib/supabase/enums";
import type { Listing, ListingOrder, Profile } from "@/lib/supabase/types";

const RECENT_LIMIT = 200;

export default async function AdminOrdersPage() {
  const admin = createServiceClient();
  const { data: orderRows, error } = await admin
    .from("listing_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  const orders = (orderRows ?? []) as ListingOrder[];

  const listingIds = [...new Set(orders.map((o) => o.listing_id))];
  const userIds = [...new Set(orders.flatMap((o) => [o.buyer_id, o.seller_id]))];
  const [{ data: listingRows }, { data: userRows }] = await Promise.all([
    listingIds.length
      ? admin.from("listings").select("id,title").in("id", listingIds)
      : Promise.resolve({ data: [] as Pick<Listing, "id" | "title">[] }),
    userIds.length
      ? admin.from("profiles").select("id,display_name").in("id", userIds)
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "display_name">[] }),
  ]);
  const listingTitleById = new Map(
    ((listingRows ?? []) as Pick<Listing, "id" | "title">[]).map((l) => [l.id, l.title])
  );
  const nameById = new Map(
    ((userRows ?? []) as Pick<Profile, "id" | "display_name">[]).map((p) => [
      p.id,
      p.display_name ?? "Anonymous",
    ])
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Orders
      </h1>
      <p className="mt-2 text-zinc-600">
        Read-only view of the {RECENT_LIMIT} most recent orders platform-wide
        — for dispute/support lookups, not for editing order state.
      </p>

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
              <th className="py-2 pr-4">Listing</th>
              <th className="py-2 pr-4">Buyer</th>
              <th className="py-2 pr-4">Buyer contact</th>
              <th className="py-2 pr-4">Seller</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-zinc-100">
                <td className="py-2 pr-4 text-zinc-900">
                  <Link href={`/listings/${order.listing_id}`} className="hover:underline">
                    {listingTitleById.get(order.listing_id) ?? "Listing"}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-zinc-600">
                  {nameById.get(order.buyer_id) ?? "Anonymous"}
                </td>
                {/* Guest 结账时从 Stripe Checkout 收集来的电话/地址(见 README
                    "Guest 联系方式留底"一节)——只在这个管理后台页面展示,纠纷/
                    支持排查用;/dashboard/sales 卖家看到的订单卡片不带这两列,
                    卖家不该看到买家的电话/地址。登录买家没走这段收集,这里是空。 */}
                <td className="py-2 pr-4 text-zinc-500">
                  {order.buyer_phone || order.buyer_address ? (
                    <div className="flex flex-col">
                      {order.buyer_phone && <span>{order.buyer_phone}</span>}
                      {order.buyer_address && (
                        <span className="text-xs text-zinc-400">{order.buyer_address}</span>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-4 text-zinc-600">
                  {nameById.get(order.seller_id) ?? "Anonymous"}
                </td>
                <td className="py-2 pr-4 text-zinc-600">
                  {order.amount} {order.currency}
                </td>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {LISTING_ORDER_STATUS_LABELS[order.status]}
                  </span>
                </td>
                <td className="py-2 pr-4 text-zinc-500">
                  {new Date(order.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && !error && (
          <p className="mt-8 text-center text-zinc-500">No orders yet.</p>
        )}
      </div>
    </div>
  );
}
