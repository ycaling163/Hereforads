import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeliverOrderForm } from "@/components/DeliverOrderForm";
import { LISTING_ORDER_STATUS_LABELS } from "@/lib/supabase/enums";
import type { Listing, ListingOrder, Payment, Profile } from "@/lib/supabase/types";

const SECTIONS: { title: string; statuses: ListingOrder["status"][] }[] = [
  { title: "New orders", statuses: ["paid_in_escrow"] },
  { title: "In progress", statuses: ["delivered"] },
  { title: "Awaiting payout", statuses: ["confirmed"] },
  { title: "Completed", statuses: ["released", "expired_auto_confirmed"] },
  { title: "Awaiting payment", statuses: ["pending_payment"] },
];

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

  const orderIds = orders.map((o) => o.id);
  const listingIds = [...new Set(orders.map((o) => o.listing_id))];
  const buyerIds = [...new Set(orders.map((o) => o.buyer_id))];
  const [{ data: listingRows }, { data: paymentRows }, { data: buyerRows }] =
    await Promise.all([
      listingIds.length
        ? supabase.from("listings").select("id,title").in("id", listingIds)
        : Promise.resolve({ data: [] as Pick<Listing, "id" | "title">[] }),
      orderIds.length
        ? supabase.from("payments").select("*").in("order_id", orderIds)
        : Promise.resolve({ data: [] as Payment[] }),
      buyerIds.length
        ? supabase.from("profiles").select("id,display_name").in("id", buyerIds)
        : Promise.resolve({ data: [] as Pick<Profile, "id" | "display_name">[] }),
    ]);
  const listingsById = new Map(
    ((listingRows ?? []) as Pick<Listing, "id" | "title">[]).map((l) => [l.id, l.title])
  );
  const paymentsByOrderId = new Map(
    ((paymentRows ?? []) as Payment[]).map((p) => [p.order_id, p])
  );
  const buyerNameById = new Map(
    ((buyerRows ?? []) as Pick<Profile, "id" | "display_name">[]).map((b) => [
      b.id,
      b.display_name ?? "Anonymous buyer",
    ])
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

      {SECTIONS.map(({ title, statuses }) => {
        const sectionOrders = orders.filter((o) => statuses.includes(o.status));
        if (sectionOrders.length === 0) return null;

        return (
          <div key={title} className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              {title} ({sectionOrders.length})
            </h2>
            <div className="mt-3 flex flex-col gap-4">
              {sectionOrders.map((order) => {
                const payment = paymentsByOrderId.get(order.id);
                return (
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
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
                      <span>
                        {order.amount} {order.currency}
                      </span>
                      <span>·</span>
                      <span>Buyer: {buyerNameById.get(order.buyer_id) ?? "Anonymous buyer"}</span>
                      <Link
                        href={`/dashboard/messages/${order.listing_id}/${order.buyer_id}`}
                        className="underline"
                      >
                        Message buyer
                      </Link>
                    </div>

                    {payment && (
                      <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
                        <div className="flex justify-between">
                          <span>Gross sale</span>
                          <span>
                            {order.amount} {order.currency}
                          </span>
                        </div>
                        {payment.platform_fee_amount !== null && (
                          <div className="flex justify-between">
                            <span>Platform fee</span>
                            <span>
                              −{payment.platform_fee_amount} {order.currency}
                            </span>
                          </div>
                        )}
                        {payment.stripe_fee_amount !== null ? (
                          <div className="flex justify-between">
                            <span>Stripe processing fee</span>
                            <span>
                              −{payment.stripe_fee_amount} {order.currency}
                            </span>
                          </div>
                        ) : (
                          <p className="mt-1 text-zinc-400">
                            Stripe&apos;s processing fee and your exact payout
                            show up once this order is released.
                          </p>
                        )}
                        {payment.net_amount !== null && (
                          <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1 font-medium text-zinc-900">
                            <span>You received</span>
                            <span>
                              {payment.net_amount} {order.currency}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {order.status === "paid_in_escrow" && (
                      <DeliverOrderForm orderId={order.id} />
                    )}

                    {order.proof_url && (
                      <p className="mt-3 text-sm text-zinc-500">
                        Proof:{" "}
                        <a
                          href={order.proof_url}
                          className="underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {order.proof_url}
                        </a>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
