import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SellerProfileView } from "@/components/SellerProfileView";
import {
  PUBLIC_PROFILE_COLUMNS,
  PUBLIC_SELLER_PROFILE_COLUMNS,
  type Listing,
  type PriceCardItem,
  type Profile,
  type SellerProfile,
  type SocialAccount,
} from "@/lib/supabase/types";

export default async function SellerProfilePage({
  params,
}: PageProps<"/sellers/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  const [
    { data: sellerProfile },
    { data: socialAccounts },
    { data: listingRows },
    { data: priceCardItemRows },
  ] = await Promise.all([
    supabase.from("seller_profiles").select(PUBLIC_SELLER_PROFILE_COLUMNS).eq("user_id", id).maybeSingle(),
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
    supabase
      .from("seller_price_card_items")
      .select("*")
      .eq("seller_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <SellerProfileView
      seller={profile as Profile}
      sellerExtra={sellerProfile as SellerProfile | null}
      accounts={(socialAccounts ?? []) as SocialAccount[]}
      listings={(listingRows ?? []) as Listing[]}
      priceCardItems={(priceCardItemRows ?? []) as PriceCardItem[]}
    />
  );
}
