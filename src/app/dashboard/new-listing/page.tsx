import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ListingForm } from "@/components/ListingForm";
import type { SocialAccount } from "@/lib/supabase/types";
import { createListingAction } from "./actions";

export default async function NewListingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: sellerProfile }, { data: socialAccounts }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("stripe_onboarded")
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
    ]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Publish a listing
      </h1>
      <p className="mt-2 text-zinc-600">
        Describe the ad space or service you&apos;re offering. Please write in
        English — this marketplace doesn&apos;t auto-translate listings yet.
      </p>

      {!profile?.stripe_onboarded ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You haven&apos;t finished Stripe onboarding yet. You can still draft
          a listing below, but it stays hidden from buyers until you{" "}
          <Link href="/dashboard/stripe-connect" className="underline">
            finish Stripe setup
          </Link>
          .
        </p>
      ) : (
        <p className="mt-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          New listings are reviewed by our team before they go live —
          buyers won&apos;t see it until it&apos;s approved.
        </p>
      )}

      <div className="mt-8">
        <ListingForm
          action={createListingAction}
          socialAccounts={(socialAccounts ?? []) as SocialAccount[]}
          websiteUrl={sellerProfile?.website_url ?? null}
          submitLabel="Publish"
          pendingLabel="Publishing…"
        />
      </div>
    </div>
  );
}
