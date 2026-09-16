import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeliverOrderForm } from "@/components/DeliverOrderForm";
import { LISTING_ORDER_STATUS_LABELS } from "@/lib/supabase/enums";
import type { Listing, ListingOrder } from "@/lib/supabase/types";

export default async function SalesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: orderRows, error } = await supabase
    .from("listing_orders")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const orders = (orderRows ?? []) as ListingOrder[];

  const listingIds = [...new Set(orders.map((o) => o.listing_id))];
  const { data: listingRows } = listingIds.length
    ? await supabase.from("listings").select("id,title").in("id", listingIds)
    : { data: [] };
  const listingsById = new Map(
    ((listingRows ?? []) as Pick<Listing, "id" | "title">[]).map((l) => [l.id, l.title])
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Sales
      </h1>
      <p className="mt-2 text-zinc-600">Orders buyers placed on your listings</p>

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      {!error && orders.length === 0 && (
        <p className="mt-16 text-center text-zinc-500">No orders yet.</p>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {orders.map((order) => (
          <div key={order.id} className="rounded-xl border border-zinc-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/listings/${order.listing_id}`}
                className="font-medium text-zinc-900 hover:underline"
              >
                {listingsById.get(order.listing_id) ?? "Listing"}
              </Link>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                {LISTING_ORDER_STATUS_LABELS[order.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {order.amount} {order.currency}
            </p>

            {order.status === "paid_in_escrow" && (
              <DeliverOrderForm orderId={order.id} />
            )}

            {order.proof_url && (
              <p className="mt-3 text-sm text-zinc-500">
                Proof:{" "}
                <a href={order.proof_url} className="underline" target="_blank" rel="noreferrer">
                  {order.proof_url}
                </a>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
