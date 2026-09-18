import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/StatCard";
import { LISTING_STATUS_LABELS, LISTING_STATUSES } from "@/lib/supabase/enums";
import type { Listing, ListingOrder } from "@/lib/supabase/types";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default async function DashboardIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Server Component, re-rendered fresh on every request — Date.now() here isn't
  // memoized/cached, so the purity lint rule (aimed at client render purity) doesn't apply.
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const [{ data: listingRows }, { data: sellerOrderRows }, { data: buyerOrderRows }] =
    await Promise.all([
      supabase.from("listings").select("id,status").eq("seller_id", user.id),
      supabase
        .from("listing_orders")
        .select("amount,currency,status,paid_at")
        .eq("seller_id", user.id),
      supabase
        .from("listing_orders")
        .select("status")
        .eq("buyer_id", user.id)
        .eq("status", "paid_in_escrow"),
    ]);

  const listings = (listingRows ?? []) as Pick<Listing, "id" | "status">[];
  const sellerOrders = (sellerOrderRows ?? []) as Pick<
    ListingOrder,
    "amount" | "currency" | "status" | "paid_at"
  >[];
  const purchasesInEscrowCount = (buyerOrderRows ?? []).length;

  const listingCountByStatus = Object.fromEntries(
    LISTING_STATUSES.map((status) => [
      status,
      listings.filter((l) => l.status === status).length,
    ])
  );

  const salesInEscrowCount = sellerOrders.filter(
    (o) => o.status === "paid_in_escrow"
  ).length;

  const revenueByCurrency = new Map<string, number>();
  for (const order of sellerOrders) {
    if (!order.paid_at || order.paid_at < since) continue;
    revenueByCurrency.set(
      order.currency,
      (revenueByCurrency.get(order.currency) ?? 0) + order.amount
    );
  }
  const revenueLabel =
    revenueByCurrency.size === 0
      ? "$0"
      : [...revenueByCurrency.entries()]
          .map(([currency, amount]) => `${amount} ${currency}`)
          .join(" · ");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Dashboard
      </h1>
      <p className="mt-2 text-zinc-600">
        An overview of your listings and transactions
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Sales in escrow"
          value={String(salesInEscrowCount)}
          href="/dashboard/sales"
        />
        <StatCard
          label="Purchases in escrow"
          value={String(purchasesInEscrowCount)}
          href="/dashboard/purchases"
        />
        <StatCard label="Gross volume (last 30 days)" value={revenueLabel} />
      </div>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-zinc-500">
        Listings by status
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {LISTING_STATUSES.map((status) => (
          <StatCard
            key={status}
            label={LISTING_STATUS_LABELS[status]}
            value={String(listingCountByStatus[status] ?? 0)}
            href="/dashboard/my-listings"
          />
        ))}
      </div>
    </div>
  );
}
