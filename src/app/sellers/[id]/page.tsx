import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SocialAccountBadge } from "@/components/SocialAccountBadge";
import { ListingCard } from "@/components/ListingCard";
import { LISTING_CATEGORY_LABELS } from "@/lib/supabase/enums";
import type {
  Listing,
  Profile,
  SellerProfile,
  SocialAccount,
} from "@/lib/supabase/types";

export default async function SellerProfilePage({
  params,
}: PageProps<"/sellers/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  const [{ data: sellerProfile }, { data: socialAccounts }, { data: listingRows }] =
    await Promise.all([
      supabase
        .from("seller_profiles")
        .select("*")
        .eq("user_id", id)
        .maybeSingle(),
      supabase
        .from("social_accounts")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("listings")
        .select("*")
        .eq("seller_id", id)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
    ]);

  const seller = profile as Profile;
  const sellerExtra = sellerProfile as SellerProfile | null;
  const accounts = (socialAccounts ?? []) as SocialAccount[];
  const listings = (listingRows ?? []) as Listing[];

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="flex items-start gap-4">
        {sellerExtra?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sellerExtra.avatar_url}
            alt={seller.display_name ?? "seller"}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xl text-zinc-500">
            {(seller.display_name ?? "S")[0]}
          </div>
        )}
        <div>
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

      {accounts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Social accounts
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm"
              >
                <SocialAccountBadge account={account} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Listings
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
                socialAccounts={accounts}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
