import Link from "next/link";
import type { PublisherCardData } from "@/lib/publisherCards";
import { LISTING_CATEGORY_LABELS } from "@/lib/supabase/enums";
import { SocialStatChip } from "@/components/SocialStatChip";

export function PublisherCard({ publisher }: { publisher: PublisherCardData }) {
  const { profile, sellerExtra, socialAccounts, listingCount, priceRange } = publisher;
  const contentCategories = (sellerExtra?.content_categories ?? []).slice(0, 3);
  // Cap the chips shown so a publisher with many linked accounts doesn't blow
  // out the card height — the profile page is where the full list lives.
  const visibleAccounts = socialAccounts.slice(0, 4);
  const extraAccountCount = socialAccounts.length - visibleAccounts.length;

  return (
    <Link
      href={`/sellers/${profile.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 transition-shadow hover:shadow-lg"
    >
      <div className="flex items-center gap-3">
        {sellerExtra?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sellerExtra.avatar_url}
            alt={profile.display_name ?? "publisher"}
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-lg font-medium text-zinc-500">
            {(profile.display_name ?? "P")[0]}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-zinc-900">
              {profile.display_name ?? "Anonymous publisher"}
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
                <path fill="white" d="m8.9 12.4-2.4-2.4 1-1 1.4 1.4 3.6-3.6 1 1-4.6 4.6Z" />
              </svg>
            )}
          </div>
          <span className="text-xs text-zinc-500">
            {listingCount} {listingCount === 1 ? "ad space" : "ad spaces"}
          </span>
        </div>
      </div>

      {contentCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {contentCategories.map((category) => (
            <span
              key={category}
              className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600"
            >
              {LISTING_CATEGORY_LABELS[category] ?? category}
            </span>
          ))}
        </div>
      )}

      {visibleAccounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {visibleAccounts.map((account) => (
            <SocialStatChip key={account.id} account={account} />
          ))}
          {extraAccountCount > 0 && (
            <span className="text-xs font-medium text-zinc-400">
              +{extraAccountCount} more
            </span>
          )}
        </div>
      )}

      {priceRange && (
        <div className="mt-auto flex items-baseline gap-1 pt-1">
          <span className="text-xs text-zinc-400">From</span>
          <span className="text-base font-semibold text-zinc-900">
            {priceRange.min === priceRange.max
              ? `${priceRange.currency} ${priceRange.min}`
              : `${priceRange.currency} ${priceRange.min}–${priceRange.max}`}
          </span>
        </div>
      )}
    </Link>
  );
}
