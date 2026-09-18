import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ListingCard } from "@/components/ListingCard";
import { attachSellerInfo } from "@/lib/listingCards";
import type { Listing } from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Ad Spaces",
  description:
    "Browse ad placements from creators and sellers around the world — from social bio-links to real-world walls and desks.",
};

export default async function ListingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  const listings = (data ?? []) as Listing[];
  const cards = await attachSellerInfo(supabase, listings);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Ad spaces
      </h1>
      <p className="mt-2 text-zinc-600">
        Ad spots and promo services from creators and sellers around the world
      </p>

      {error && (
        <p className="mt-8 text-sm text-red-600">
          Failed to load listings: {error.message}
        </p>
      )}

      {!error && listings.length === 0 && (
        <p className="mt-16 text-center text-zinc-500">
          No listings yet — be the{" "}
          <a href="/dashboard/new-listing" className="mx-1 underline">
            first to publish one
          </a>
          .
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
          <ListingCard
            key={card.listing.id}
            listing={card.listing}
            seller={card.seller}
            sellerExtra={card.sellerExtra}
            socialAccounts={card.socialAccounts}
          />
        ))}
      </div>
    </div>
  );
}
