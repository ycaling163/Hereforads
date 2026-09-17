import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ListingCard } from "@/components/ListingCard";
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
    .order("created_at", { ascending: false })
    .limit(8);

  const recommended = (data ?? []) as Listing[];

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-6 pt-8 pb-8 text-center">
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-zinc-900">
          把你的空间,变成广告位
        </h1>
        <p className="mt-6 max-w-md text-lg text-zinc-600">
          发布你的数字或实景空间,让广告品牌商买单。
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
            浏览广告位
          </Link>
          <Link
            href="/dashboard/new-listing"
            className="rounded-full border border-zinc-300 px-8 py-3 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
          >
            发布你的广告位
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-6 pb-24">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          推荐广告位
        </h2>
        {recommended.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">暂无推荐广告位</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recommended.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
