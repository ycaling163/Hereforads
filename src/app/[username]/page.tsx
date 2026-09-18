import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SellerProfileView } from "@/components/SellerProfileView";
import type {
  Listing,
  Profile,
  SellerProfile,
  SocialAccount,
} from "@/lib/supabase/types";

// The pretty alternative to /sellers/[id] — only reachable once a user sets
// a username on /dashboard/profile (see src/lib/username.ts for the
// reserved-word list keeping this from ever shadowing a real top-level
// route like /login or /admin; a static route always wins over this
// catch-all at the same level, so those stay safe regardless).
export default async function PublicUsernamePage({
  params,
}: PageProps<"/[username]">) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.toLowerCase())
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  const id = (profile as Profile).id;

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

  return (
    <SellerProfileView
      seller={profile as Profile}
      sellerExtra={sellerProfile as SellerProfile | null}
      accounts={(socialAccounts ?? []) as SocialAccount[]}
      listings={(listingRows ?? []) as Listing[]}
    />
  );
}
