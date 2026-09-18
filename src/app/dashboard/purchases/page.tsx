import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import { ESCROW_HOLD_DAYS, LISTING_ORDER_STATUS_LABELS } from "@/lib/supabase/enums";
import { releaseNowAction } from "./actions";
import type { Listing, ListingOrder } from "@/lib/supabase/types";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "This order can't be confirmed right now.",
  update_failed: "Couldn't update the order, please try again.",
  payout_failed:
    "Order was confirmed, but releasing the payout to the seller failed — this needs manual follow-up.",
};

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkout?: string }>;
}) {
  const { error, checkout } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: orderRows } = await supabase
    .from("listing_orders")
    .select("*")
    .eq("buyer_id", user.id)
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
        Purchases
      </h1>
      <p className="mt-2 text-zinc-600">Orders you&apos;ve placed on other sellers&apos; listings</p>

      {checkout === "success" && (
        <p className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">
          Payment received — it&apos;s held for {ESCROW_HOLD_DAYS} days before
          paying out to the seller. You can release it sooner once you&apos;re
          happy.
        </p>
      )}
      {error && ERROR_MESSAGES[error] && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          {ERROR_MESSAGES[error]}
        </p>
      )}

      {orders.length === 0 ? (
        <p className="mt-16 text-center text-zinc-500">No purchases yet.</p>
      ) : (
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
                <div className="mt-3 flex flex-col gap-2">
                  {order.proof_url && (
                    <a
                      href={order.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-zinc-600 underline"
                    >
                      Link from the seller: {order.proof_url}
                    </a>
                  )}
                  <ConfirmSubmitForm
                    action={releaseNowAction.bind(null, order.id)}
                    confirmMessage="Release payment to the seller now? We don't mediate ad-space disputes, so only do this once you're satisfied."
                    label="Release payment now"
                    className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                  />
                  <p className="text-xs text-zinc-400">
                    Otherwise this releases automatically {ESCROW_HOLD_DAYS} days
                    after payment.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
