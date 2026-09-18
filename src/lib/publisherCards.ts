import type { SupabaseClient } from "@supabase/supabase-js";
import type { Listing, Profile, SellerProfile, SocialAccount } from "@/lib/supabase/types";

export interface PublisherPriceRange {
  currency: string;
  min: number;
  max: number;
}

export interface PublisherCardData {
  profile: Profile;
  sellerExtra: SellerProfile | null;
  socialAccounts: SocialAccount[];
  listingCount: number;
  // Range is computed within the currency of the seller's cheapest listing —
  // mixing currencies into one min/max would be misleading, so a seller
  // selling in both USD and GBP shows the range for whichever currency their
  // lowest-priced listing is in, not a range spanning both.
  priceRange: PublisherPriceRange | null;
}

// The publishers grid only features sellers with at least one live listing —
// same visibility rule as the homepage/listings page (draft/pending_review/
// rejected/removed stay hidden), and it keeps "ad count"/"price from" on the
// card meaningful instead of showing a seller with nothing to sell yet.
export async function getActivePublishers(
  supabase: SupabaseClient
): Promise<PublisherCardData[]> {
  const { data: listingRows } = await supabase
    .from("listings")
    .select("seller_id, price_amount, price_currency")
    .eq("status", "active");

  const listings = (listingRows ?? []) as Pick<
    Listing,
    "seller_id" | "price_amount" | "price_currency"
  >[];

  if (listings.length === 0) {
    return [];
  }

  const bySeller = new Map<string, typeof listings>();
  for (const listing of listings) {
    const existing = bySeller.get(listing.seller_id);
    if (existing) {
      existing.push(listing);
    } else {
      bySeller.set(listing.seller_id, [listing]);
    }
  }

  const sellerIds = Array.from(bySeller.keys());

  const [{ data: profileRows }, { data: sellerProfileRows }, { data: socialAccountRows }] =
    await Promise.all([
      supabase.from("profiles").select("*").in("id", sellerIds),
      supabase.from("seller_profiles").select("*").in("user_id", sellerIds),
      supabase.from("social_accounts").select("*").in("user_id", sellerIds),
    ]);

  const profileById = new Map(
    ((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile])
  );
  const sellerExtraById = new Map(
    ((sellerProfileRows ?? []) as SellerProfile[]).map((extra) => [extra.user_id, extra])
  );
  const socialAccountsBySeller = new Map<string, SocialAccount[]>();
  for (const account of (socialAccountRows ?? []) as SocialAccount[]) {
    const existing = socialAccountsBySeller.get(account.user_id);
    if (existing) {
      existing.push(account);
    } else {
      socialAccountsBySeller.set(account.user_id, [account]);
    }
  }

  const publishers: PublisherCardData[] = [];

  for (const [sellerId, sellerListings] of bySeller) {
    const profile = profileById.get(sellerId);
    // A banned account's profile row still exists (bans don't delete data),
    // but it shouldn't surface on a public discovery page.
    if (!profile || profile.is_banned) continue;

    const cheapest = sellerListings.reduce((min, listing) =>
      listing.price_amount < min.price_amount ? listing : min
    );
    const sameCurrencyListings = sellerListings.filter(
      (listing) => listing.price_currency === cheapest.price_currency
    );
    const priceRange: PublisherPriceRange = {
      currency: cheapest.price_currency,
      min: Math.min(...sameCurrencyListings.map((listing) => listing.price_amount)),
      max: Math.max(...sameCurrencyListings.map((listing) => listing.price_amount)),
    };

    publishers.push({
      profile,
      sellerExtra: sellerExtraById.get(sellerId) ?? null,
      socialAccounts: socialAccountsBySeller.get(sellerId) ?? [],
      listingCount: sellerListings.length,
      priceRange,
    });
  }

  publishers.sort((a, b) => {
    if (a.sellerExtra?.is_verified !== b.sellerExtra?.is_verified) {
      return a.sellerExtra?.is_verified ? -1 : 1;
    }
    if (a.listingCount !== b.listingCount) {
      return b.listingCount - a.listingCount;
    }
    return (a.profile.display_name ?? "").localeCompare(b.profile.display_name ?? "");
  });

  return publishers;
}
