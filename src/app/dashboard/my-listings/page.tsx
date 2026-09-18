import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LISTING_STATUS_LABELS, PRICING_UNIT_LABELS } from "@/lib/supabase/enums";
import type { Listing } from "@/lib/supabase/types";

const STATUS_BADGE_CLASS: Record<Listing["status"], string> = {
  draft: "bg-amber-100 text-amber-800",
  pending_review: "bg-sky-100 text-sky-800",
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-zinc-100 text-zinc-600",
  rejected: "bg-red-100 text-red-700",
  removed: "bg-red-100 text-red-700",
};

export default async function MyListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: listingRows, error } = await supabase
    .from("listings")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const listings = (listingRows ?? []) as Listing[];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        My listings
      </h1>
      <p className="mt-2 text-zinc-600">
        Everything you&apos;ve published, including drafts buyers can&apos;t see yet.
      </p>

      {error && <p className="mt-8 text-sm text-red-600">{error.message}</p>}

      {!error && listings.length === 0 && (
        <p className="mt-16 text-center text-zinc-500">
          You haven&apos;t published anything yet — go
          <Link href="/dashboard/new-listing" className="mx-1 underline">
            create your first listing
          </Link>
          .
        </p>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {listings.map((listing) => (
          <div
            key={listing.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 p-5"
          >
            <div>
              <Link
                href={`/listings/${listing.id}`}
                className="font-medium text-zinc-900 hover:underline"
              >
                {listing.is_featured ? "⭐ " : ""}
                {listing.title}
              </Link>
              <p className="mt-1 text-sm text-zinc-500">
                {listing.price_amount} {listing.price_currency}
                {listing.pricing_unit !== "one_time"
                  ? ` / ${PRICING_UNIT_LABELS[listing.pricing_unit].toLowerCase()}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[listing.status]}`}
              >
                {LISTING_STATUS_LABELS[listing.status]}
              </span>
              <Link
                href={`/dashboard/new-listing?from=${listing.id}`}
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
              >
                Duplicate
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
