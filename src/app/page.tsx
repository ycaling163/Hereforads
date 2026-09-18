import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ListingCard } from "@/components/ListingCard";
import { attachSellerInfo } from "@/lib/listingCards";
import { LISTING_CATEGORY_LABELS } from "@/lib/supabase/enums";
import type { Listing } from "@/lib/supabase/types";

const FEATURED_CATEGORIES: (keyof typeof LISTING_CATEGORY_LABELS)[] = [
  "beauty_skincare",
  "fashion_style",
  "fitness_health",
  "travel",
  "technology_gadgets",
  "lifestyle",
];

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select("*")
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(8);

  const recommended = (data ?? []) as Listing[];
  const cards = await attachSellerInfo(supabase, recommended);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-6 pt-8 pb-8 text-center">
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-zinc-900">
          Turn your space into ad space.
        </h1>
        <p className="mt-6 max-w-md text-lg text-zinc-600">
          Create your ad space in minutes and get paid by brands to
          advertise on it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {FEATURED_CATEGORIES.map((category) => (
            <span
              key={category}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
            >
              {LISTING_CATEGORY_LABELS[category]}
            </span>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/listings"
            className="rounded-full bg-zinc-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Find ad space
          </Link>
          <Link
            href="/dashboard/new-listing"
            className="rounded-full border border-zinc-300 px-8 py-3 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
          >
            Sell ad space
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-6 pb-24">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          Featured listings
        </h2>
        {recommended.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No listings yet — check back soon.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((card) => (
              <ListingCard
                key={card.listing.id}
                listing={card.listing}
                seller={card.seller}
                sellerExtra={card.sellerExtra}
                placementAccount={card.placementAccount}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
