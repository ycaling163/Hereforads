import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import { LISTING_STATUS_LABELS, PRICING_UNIT_LABELS } from "@/lib/supabase/enums";
import type { Listing } from "@/lib/supabase/types";
import { deleteListingAction } from "./actions";

const STATUS_BADGE_CLASS: Record<Listing["status"], string> = {
  draft: "bg-amber-100 text-amber-800",
  pending_review: "bg-sky-100 text-sky-800",
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-zinc-100 text-zinc-600",
  rejected: "bg-red-100 text-red-700",
  removed: "bg-red-100 text-red-700",
};

const DELETE_ERROR_MESSAGES: Record<string, string> = {
  delete_failed: "Delete didn't go through — the database rejected the request.",
  delete_blocked_by_orders:
    "Can't delete this listing — it has order history attached (even old or completed orders). Contact an admin if it really needs to be removed.",
};

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorCode } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: listingRows, error }, { data: profile }] = await Promise.all([
    supabase
      .from("listings")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("stripe_onboarded").eq("id", user.id).single(),
  ]);

  const listings = (listingRows ?? []) as Listing[];
  const hasActiveListing = listings.some((listing) => listing.status === "active");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            My listings
          </h1>
          <p className="mt-2 text-zinc-600">
            Everything you&apos;ve published, including drafts buyers can&apos;t see yet.
          </p>
        </div>
        <Link
          href="/dashboard/new-listing"
          className="shrink-0 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          + Upload new ad
        </Link>
      </div>

      {/* 发布免审核 + KYC 后置(见 README 同名一节):listing 上线不再要求先做
          Stripe KYC,买家随时可能真的下单,这里提醒卖家早点连好,免得到了要
          标记交付/放款那一刻才发现连不上。 */}
      {!profile?.stripe_onboarded && hasActiveListing && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your listing is live and buyers can already buy it, but you
          haven&apos;t connected Stripe yet —{" "}
          <Link href="/dashboard/stripe-connect" className="underline">
            finish Stripe setup
          </Link>{" "}
          so you&apos;re ready to get paid on your first sale.
        </p>
      )}

      {errorCode && DELETE_ERROR_MESSAGES[errorCode] && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {DELETE_ERROR_MESSAGES[errorCode]}
        </p>
      )}

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
            <div className="flex min-w-0 items-center gap-4">
              {/* 封面图:跟 ListingCard 一样取 media_urls 第一张。 */}
              <Link
                href={`/listings/${listing.id}`}
                tabIndex={-1}
                className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100"
              >
                {listing.media_urls?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.media_urls[0]}
                    alt={listing.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                    No image
                  </span>
                )}
              </Link>
              <div className="min-w-0">
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
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASS[listing.status]}`}
              >
                {LISTING_STATUS_LABELS[listing.status]}
              </span>
              <Link
                href={`/dashboard/my-listings/${listing.id}/edit`}
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
              >
                Edit
              </Link>
              <Link
                href={`/dashboard/new-listing?from=${listing.id}`}
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
              >
                Duplicate
              </Link>
              <ConfirmSubmitForm
                action={deleteListingAction.bind(null, listing.id)}
                confirmMessage={`Delete "${listing.title}"? This can't be undone.`}
                label="Delete"
                className="text-sm text-zinc-500 transition-colors hover:text-red-600"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
