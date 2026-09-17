import Link from "next/link";
import type { Listing } from "@/lib/supabase/types";
import { LISTING_CATEGORY_LABELS, PRICING_UNIT_LABELS } from "@/lib/supabase/enums";

export function ListingCard({ listing }: { listing: Listing }) {
  const cover = listing.media_urls?.[0];
  const firstCategory = listing.categories?.[0];

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 transition-shadow hover:shadow-lg"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100">
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
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {firstCategory && (
          <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
            {LISTING_CATEGORY_LABELS[firstCategory] ?? firstCategory}
          </span>
        )}
        <h3 className="line-clamp-1 text-base font-semibold text-zinc-900">
          {listing.title}
        </h3>
        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-1">
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
        </div>
      </div>
    </Link>
  );
}
