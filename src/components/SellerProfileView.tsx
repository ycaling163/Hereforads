import { HiOutlineGlobeAlt } from "react-icons/hi2";
import { ListingCard } from "@/components/ListingCard";
import { PriceCard } from "@/components/PriceCard";
import { SocialStatCard } from "@/components/SocialStatCard";
import { LISTING_CATEGORY_LABELS } from "@/lib/supabase/enums";
import { displayWebsiteUrl } from "@/lib/format";
import type {
  Listing,
  PriceCardItem,
  Profile,
  SellerProfile,
  SocialAccount,
} from "@/lib/supabase/types";

// Shared by /sellers/[id] (the stable, always-available link) and
// /[username] (the optional pretty link a seller can set on their profile
// page) — same page, reached by two different lookup keys.
export function SellerProfileView({
  seller,
  sellerExtra,
  accounts,
  listings,
  priceCardItems,
}: {
  seller: Profile;
  sellerExtra: SellerProfile | null;
  accounts: SocialAccount[];
  listings: Listing[];
  priceCardItems: PriceCardItem[];
}) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return (
    <div>
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-500 sm:h-56">
        {sellerExtra?.banner_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sellerExtra.banner_url}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="mx-auto w-full max-w-7xl px-6 pb-12">
        <div className="flex flex-col items-start gap-4 px-2 sm:flex-row sm:items-end">
          {sellerExtra?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sellerExtra.avatar_url}
              alt={seller.display_name ?? "seller"}
              className="-mt-12 h-24 w-24 shrink-0 rounded-full object-cover ring-4 ring-white sm:h-28 sm:w-28"
            />
          ) : (
            <div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-2xl text-zinc-500 ring-4 ring-white sm:h-28 sm:w-28">
              {(seller.display_name ?? "S")[0]}
            </div>
          )}
          <div className="pb-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-900">
              {seller.display_name ?? "Anonymous seller"}
              {sellerExtra?.is_verified && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Verified
                </span>
              )}
            </h1>
            {sellerExtra?.bio && (
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
                {sellerExtra.bio}
              </p>
            )}
            {sellerExtra?.website_url && (
              <a
                href={sellerExtra.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
              >
                <HiOutlineGlobeAlt className="h-4 w-4 shrink-0 text-zinc-500" />
                {displayWebsiteUrl(sellerExtra.website_url)}
              </a>
            )}
            {sellerExtra?.content_categories &&
              sellerExtra.content_categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sellerExtra.content_categories.map((category) => (
                    <span
                      key={category}
                      className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600"
                    >
                      {LISTING_CATEGORY_LABELS[category] ?? category}
                    </span>
                  ))}
                </div>
              )}
          </div>
        </div>

        {(accounts.length > 0 || priceCardItems.length > 0) && (
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
            {accounts.length > 0 && (
              <div>
                <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                  Social reach
                </h2>
                <div className="mt-3 flex flex-col gap-2">
                  {accounts.map((account) => (
                    <SocialStatCard key={account.id} account={account} />
                  ))}
                </div>
              </div>
            )}
            {priceCardItems.length > 0 && <PriceCard items={priceCardItems} />}
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Ad spaces
          </h2>
          {listings.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No listings published yet.</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  seller={seller}
                  sellerExtra={sellerExtra}
                  placementAccount={
                    listing.social_account_id
                      ? accountById.get(listing.social_account_id) ?? null
                      : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
