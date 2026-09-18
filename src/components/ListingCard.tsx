import Link from "next/link";
import type { Listing, Profile, SellerProfile, SocialAccount } from "@/lib/supabase/types";
import { PRICING_UNIT_LABELS } from "@/lib/supabase/enums";
import { SocialStatChip, WebsiteStatChip } from "@/components/SocialStatChip";

export function ListingCard({
  listing,
  seller = null,
  sellerExtra = null,
  placementAccount = null,
}: {
  listing: Listing;
  seller?: Profile | null;
  sellerExtra?: SellerProfile | null;
  // The one social account (or website) this specific listing is placed on —
  // not every account the seller owns, so buyers don't assume an ad runs
  // everywhere the seller has a presence.
  placementAccount?: SocialAccount | null;
}) {
  const cover = listing.media_urls?.[0];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 transition-shadow hover:shadow-lg">
      <Link
        href={`/listings/${listing.id}`}
        className="absolute inset-0 z-10"
        aria-label={listing.title}
      />

      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100">
        {listing.is_featured && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-zinc-900/80 px-2 py-0.5 text-xs font-medium text-white">
            ⭐ Featured
          </span>
        )}
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
            No image
          </div>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur">
          Available
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <Link
          href={`/sellers/${listing.seller_id}`}
          className="relative z-20 flex w-fit items-center gap-2 hover:underline"
        >
          {sellerExtra?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sellerExtra.avatar_url}
              alt={seller?.display_name ?? "seller"}
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-500">
              {(seller?.display_name ?? "S")[0]}
            </div>
          )}
          <span className="truncate text-sm font-medium text-zinc-900">
            {seller?.display_name ?? "Anonymous seller"}
          </span>
          {sellerExtra?.is_verified && (
            <svg
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5 shrink-0 text-blue-500"
              aria-label="Verified"
            >
              <path
                fill="currentColor"
                d="M10 1.5 12.1 3l2.7-.5 1 2.6 2.6 1-.5 2.7 1.5 2.2-1.5 2.2.5 2.7-2.6 1-1 2.6-2.7-.5L10 18.5 7.9 17l-2.7.5-1-2.6-2.6-1 .5-2.7L.6 8.9l1.5-2.2-.5-2.7 2.6-1 1-2.6L7.9 3 10 1.5Z"
              />
              <path
                fill="white"
                d="m8.9 12.4-2.4-2.4 1-1 1.4 1.4 3.6-3.6 1 1-4.6 4.6Z"
              />
            </svg>
          )}
        </Link>

        {(listing.is_website_placement || placementAccount) && (
          <div className="flex flex-wrap items-center gap-3">
            {listing.is_website_placement ? (
              <WebsiteStatChip />
            ) : (
              placementAccount && <SocialStatChip account={placementAccount} />
            )}
          </div>
        )}

        <div>
          <h3 className="line-clamp-1 text-base font-semibold text-zinc-900">
            {listing.title}
          </h3>
          {listing.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">
              {listing.description}
            </p>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-xs text-zinc-400">From</span>
            <span className="text-xl font-semibold text-zinc-900">
              {listing.price_amount}
            </span>
            <span className="text-sm text-zinc-500">
              {listing.price_currency}
              {listing.pricing_unit !== "one_time"
                ? ` / ${PRICING_UNIT_LABELS[listing.pricing_unit].toLowerCase()}`
                : ""}
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white transition-colors group-hover:bg-zinc-700">
            View & Book
          </span>
        </div>
      </div>
    </div>
  );
}
