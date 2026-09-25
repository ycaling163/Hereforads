import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLIC_PROFILE_COLUMNS,
  PUBLIC_SELLER_PROFILE_COLUMNS,
  type Listing,
  type Profile,
  type SellerProfile,
  type SocialAccount,
} from "@/lib/supabase/types";

export interface ListingCardData {
  listing: Listing;
  seller: Profile | null;
  sellerExtra: SellerProfile | null;
  // The one social account this specific listing is placed on — not every
  // account the seller owns. Showing all of a seller's accounts on a single
  // listing implies the ad runs on all of them, which it doesn't.
  placementAccount: SocialAccount | null;
}

// The card template needs seller identity (avatar/verified/content niche)
// plus the single social account this listing is actually placed on, so
// batch-fetch both by id once instead of querying per card.
export async function attachSellerInfo(
  supabase: SupabaseClient,
  listings: Listing[]
): Promise<ListingCardData[]> {
  const sellerIds = Array.from(
    new Set(listings.map((listing) => listing.seller_id))
  );

  if (sellerIds.length === 0) {
    return [];
  }

  const placementAccountIds = Array.from(
    new Set(
      listings
        .map((listing) => listing.social_account_id)
        .filter((id): id is string => id !== null)
    )
  );

  const [{ data: profiles }, { data: sellerProfiles }, { data: socialAccounts }] =
    await Promise.all([
      supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).in("id", sellerIds),
      supabase.from("seller_profiles").select(PUBLIC_SELLER_PROFILE_COLUMNS).in("user_id", sellerIds),
      placementAccountIds.length > 0
        ? supabase.from("social_accounts").select("*").in("id", placementAccountIds)
        : Promise.resolve({ data: [] as SocialAccount[] }),
    ]);

  const profileById = new Map(
    ((profiles ?? []) as Profile[]).map((profile) => [profile.id, profile])
  );
  const sellerExtraById = new Map(
    ((sellerProfiles ?? []) as SellerProfile[]).map((extra) => [
      extra.user_id,
      extra,
    ])
  );
  const accountById = new Map(
    ((socialAccounts ?? []) as SocialAccount[]).map((account) => [
      account.id,
      account,
    ])
  );

  return listings.map((listing) => ({
    listing,
    seller: profileById.get(listing.seller_id) ?? null,
    sellerExtra: sellerExtraById.get(listing.seller_id) ?? null,
    placementAccount: listing.social_account_id
      ? accountById.get(listing.social_account_id) ?? null
      : null,
  }));
}
