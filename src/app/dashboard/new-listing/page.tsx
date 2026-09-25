import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ListingForm } from "@/components/ListingForm";
import type { Listing, SocialAccount } from "@/lib/supabase/types";
import { createListingAction } from "./actions";
import { defaultCurrencyForCountry } from "@/lib/stripe/countries";

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: sellerProfile }, { data: socialAccounts }, { data: sourceListingRow }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("stripe_onboarded,country")
        .eq("id", user.id)
        .single(),
      supabase
        .from("seller_profiles")
        .select("website_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("social_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      from
        ? supabase.from("listings").select("*").eq("id", from).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // Only duplicate a listing that's actually the current user's own — RLS
  // would let them read someone else's *active* listing, but not copy it.
  const sourceListing =
    sourceListingRow && (sourceListingRow as Listing).seller_id === user.id
      ? (sourceListingRow as Listing)
      : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {sourceListing ? "Duplicate listing" : "Publish a listing"}
      </h1>
      <p className="mt-2 text-zinc-600">
        {sourceListing
          ? "Fields are pre-filled from the listing you're copying — check the ad placement below before publishing."
          : "Describe the ad space or service you're offering. Please write in English — this marketplace doesn't auto-translate listings yet."}
      </p>

      {!profile?.stripe_onboarded && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You haven&apos;t connected Stripe yet — you can still publish and
          buyers can find and buy this listing right away, but you&apos;ll
          need to{" "}
          <Link href="/dashboard/stripe-connect" className="underline">
            finish Stripe setup
          </Link>{" "}
          before you can get paid out on a sale.
        </p>
      )}

      <div className="mt-8">
        <ListingForm
          action={createListingAction}
          initialListing={sourceListing ?? undefined}
          duplicatedFromTitle={sourceListing?.title}
          socialAccounts={(socialAccounts ?? []) as SocialAccount[]}
          websiteUrl={sellerProfile?.website_url ?? null}
          defaultCurrency={defaultCurrencyForCountry(profile?.country)}
          submitLabel="Publish"
          pendingLabel="Publishing…"
        />
      </div>
    </div>
  );
}
