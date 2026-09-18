import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Listing,
  Profile,
  SellerProfile,
  SocialAccount,
} from "@/lib/supabase/types";

export interface ListingCardData {
  listing: Listing;
  seller: Profile | null;
  sellerExtra: SellerProfile | null;
  socialAccounts: SocialAccount[];
}

// The card template needs seller identity (avatar/verified/content niche) and
// social reach (platform/follower counts), so batch-fetch those by seller_id
// once instead of querying per card.
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

  const [{ data: profiles }, { data: sellerProfiles }, { data: socialAccounts }] =
    await Promise.all([
      supabase.from("profiles").select("*").in("id", sellerIds),
      supabase.from("seller_profiles").select("*").in("user_id", sellerIds),
      supabase.from("social_accounts").select("*").in("user_id", sellerIds),
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
  const accountsBySeller = new Map<string, SocialAccount[]>();
  for (const account of (socialAccounts ?? []) as SocialAccount[]) {
    const list = accountsBySeller.get(account.user_id) ?? [];
    list.push(account);
    accountsBySeller.set(account.user_id, list);
  }

  return listings.map((listing) => ({
    listing,
    seller: profileById.get(listing.seller_id) ?? null,
    sellerExtra: sellerExtraById.get(listing.seller_id) ?? null,
    socialAccounts: accountsBySeller.get(listing.seller_id) ?? [],
  }));
}
