import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuyListingButton } from "@/components/BuyListingButton";
import { ContactSellerForm } from "@/components/ContactSellerForm";
import { DailyCountdown } from "@/components/DailyCountdown";
import {
  LISTING_CATEGORY_LABELS,
  LISTING_STATUS_LABELS,
  PRICING_UNIT_LABELS,
  SOCIAL_PLATFORM_LABELS,
} from "@/lib/supabase/enums";
import type {
  Listing,
  Profile,
  SellerProfile,
  SocialAccount,
} from "@/lib/supabase/types";

export default async function ListingDetailPage({
  params,
}: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: listingRow } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .single();

  if (!listingRow) {
    notFound();
  }

  const listing = listingRow as Listing;

  const [
    { data: profile },
    { data: sellerProfile },
    { data: socialAccounts },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", listing.seller_id).maybeSingle(),
    supabase
      .from("seller_profiles")
      .select("*")
      .eq("user_id", listing.seller_id)
      .maybeSingle(),
    supabase.from("social_accounts").select("*").eq("user_id", listing.seller_id),
    supabase.auth.getUser(),
  ]);

  const seller = profile as Profile | null;
  const sellerExtra = sellerProfile as SellerProfile | null;
  const accounts = (socialAccounts ?? []) as SocialAccount[];

  const media = listing.media_urls ?? [];
  const isOwnListing = user?.id === listing.seller_id;
  const isVisitorBuyer = !!user && !isOwnListing;
  // status='draft' listing 只有卖家自己能看到(见 RLS),但直接访问 URL 时还是要
  // 在页面这层挡一下,免得给其他登录用户看见"未发布"的内部状态。
  const isVisible = listing.status === "active" || isOwnListing;
  if (!isVisible) {
    notFound();
  }

  const socialSummary = accounts
    .slice(0, 2)
    .map((account) => {
      const label = SOCIAL_PLATFORM_LABELS[account.platform] ?? account.platform;
      const followers =
        typeof account.follower_count === "number"
          ? ` ${account.follower_count.toLocaleString()}`
          : "";
      return `${label}${followers}`;
    })
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Accepts ads from
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {listing.categories.map((category) => (
              <span
                key={category}
                className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600"
              >
                {LISTING_CATEGORY_LABELS[category] ?? category}
              </span>
            ))}
            {listing.status !== "active" && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                {LISTING_STATUS_LABELS[listing.status]}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
            {listing.title}
          </h1>
        </div>

        <Link
          href={`/sellers/${listing.seller_id}`}
          className="flex items-start justify-end gap-3"
        >
          {sellerExtra?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sellerExtra.avatar_url}
              alt={seller?.display_name ?? "seller"}
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
              {(seller?.display_name ?? "S")[0]}
            </div>
          )}
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 font-medium text-zinc-900 hover:underline">
              {seller?.display_name ?? "Anonymous seller"}
              {sellerExtra?.is_verified && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Verified
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {socialSummary || "No social accounts yet"}
            </p>
          </div>
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-zinc-100">
            {media[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media[0]}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400">
                No image
              </div>
            )}
          </div>
          {media.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {media.slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={listing.title}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ))}
            </div>
          )}

          {listing.description && (
            <div className="mt-6 rounded-2xl border border-transparent bg-zinc-50 p-6">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
                Details
              </h2>
              <p className="whitespace-pre-line text-sm leading-6 text-zinc-600">
                {listing.description}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-transparent bg-zinc-50 p-6">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-semibold text-zinc-900">
                {listing.price_amount}
              </span>
              <span className="text-zinc-500">{listing.price_currency}</span>
              {listing.pricing_unit !== "one_time" && (
                <span className="text-sm text-zinc-500">
                  / {PRICING_UNIT_LABELS[listing.pricing_unit].toLowerCase()}
                </span>
              )}
            </div>
            {listing.pricing_unit === "daily" && <DailyCountdown />}

            <div className="mt-4">
              {isOwnListing ? (
                <p className="text-sm text-zinc-500">This is your own listing.</p>
              ) : isVisitorBuyer ? (
                <BuyListingButton listingId={listing.id} />
              ) : (
                <Link
                  href="/login"
                  className="block w-full rounded-full bg-zinc-900 px-6 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  Log in to buy
                </Link>
              )}
            </div>
          </div>

          {!isOwnListing && (
            <div className="rounded-2xl border border-transparent bg-zinc-50 p-6">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
                Ask the seller
              </h2>
              {user ? (
                <ContactSellerForm listingId={listing.id} />
              ) : (
                <p className="text-sm text-zinc-500">
                  <Link href="/login" className="underline">
                    Log in
                  </Link>{" "}
                  to message the seller.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
