import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";
import { SocialAccountsManager } from "./SocialAccountsManager";
import { PriceCardManager } from "./PriceCardManager";
import {
  PUBLIC_PROFILE_COLUMNS,
  PUBLIC_SELLER_PROFILE_COLUMNS,
  type PriceCardItem,
  type Profile,
  type SellerProfile,
  type SocialAccount,
} from "@/lib/supabase/types";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: profile },
    { data: sellerProfile },
    { data: socialAccounts },
    { data: priceCardItems },
  ] = await Promise.all([
    supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", user.id).maybeSingle(),
    supabase
      .from("seller_profiles")
      .select(PUBLIC_SELLER_PROFILE_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("social_accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("seller_price_card_items")
      .select("*")
      .eq("seller_id", user.id)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Profile / Seller info
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Buyers will see this on your listing pages.
        </p>
        {error === "delete_failed" && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
            Delete didn&apos;t go through — the database rejected the request.
            Please contact an admin to check the permission policy.
          </p>
        )}
        <div className="mt-6 max-w-xl">
          <ProfileForm
            initialDisplayName={(profile as Profile | null)?.display_name ?? ""}
            initialUsername={(profile as Profile | null)?.username ?? ""}
            initialBio={(sellerProfile as SellerProfile | null)?.bio ?? ""}
            initialAvatarUrl={
              (sellerProfile as SellerProfile | null)?.avatar_url ?? null
            }
            initialBannerUrl={
              (sellerProfile as SellerProfile | null)?.banner_url ?? null
            }
            initialContentCategories={
              (sellerProfile as SellerProfile | null)?.content_categories ?? []
            }
            initialWebsiteUrl={
              (sellerProfile as SellerProfile | null)?.website_url ?? ""
            }
          />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Social accounts
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Show your Douyin, Xiaohongshu, and other accounts with follower
          counts to build buyer trust.
        </p>
        <div className="mt-6 max-w-xl">
          <SocialAccountsManager
            accounts={(socialAccounts ?? []) as SocialAccount[]}
          />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Price card
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Shows on your public profile page (next to Social reach) as a quick
          rate card, so buyers get a sense of your pricing before browsing
          your listings one by one. It&apos;s just for reference — buyers
          still book and pay through an actual listing, so make sure prices
          here roughly match what you publish.
        </p>
        <div className="mt-6 max-w-xl">
          <PriceCardManager items={(priceCardItems ?? []) as PriceCardItem[]} />
        </div>
      </div>
    </div>
  );
}
