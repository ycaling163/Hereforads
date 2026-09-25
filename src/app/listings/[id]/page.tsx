import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuyListingButton } from "@/components/BuyListingButton";
import { ContactSellerForm } from "@/components/ContactSellerForm";
import { DailyCountdown } from "@/components/DailyCountdown";
import type { BookingOptions } from "@/components/BookingPicker";
import { getBookedRanges } from "@/lib/orders/bookings";
import { toMinorUnits } from "@/lib/fees";
import {
  MAX_ADVANCE_DAYS,
  addDays,
  bookingToday,
  isBookingUnit,
  isValidDate,
  maxBookingUnits,
  minBookingUnits,
} from "@/lib/booking";
import { SocialStatChip, WebsiteStatChip } from "@/components/SocialStatChip";
import {
  AD_TYPE_LABELS,
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

export async function generateMetadata({
  params,
}: PageProps<"/listings/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("title,description")
    .eq("id", id)
    .maybeSingle();

  if (!listing) {
    return { title: "Ad space" };
  }
  return {
    title: listing.title,
    description: listing.description ?? undefined,
  };
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const { resume, start, units, checkout } = await searchParams;
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
    { data: placementAccountRow },
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
    // Only this listing's own placement — not every account the seller owns,
    // so buyers don't assume the ad runs everywhere the seller has a presence.
    listing.social_account_id
      ? supabase
          .from("social_accounts")
          .select("*")
          .eq("id", listing.social_account_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.auth.getUser(),
  ]);

  const seller = profile as Profile | null;
  const sellerExtra = sellerProfile as SellerProfile | null;
  const placementAccount = placementAccountRow as SocialAccount | null;

  const media = listing.media_urls ?? [];
  const isOwnListing = user?.id === listing.seller_id;

  // 日历按天预订(README"日历按天预订"):已被预订的日期置灰,开始日期最远 60 天后。
  let booking: BookingOptions | undefined;
  if (listing.booking_enabled && isBookingUnit(listing.pricing_unit) && !isOwnListing) {
    const today = bookingToday();
    booking = {
      unit: listing.pricing_unit,
      unitAmountMinor: toMinorUnits(listing.price_amount, listing.price_currency),
      currency: listing.price_currency,
      minUnits: minBookingUnits(listing.pricing_unit, listing.min_booking_days),
      maxUnits: maxBookingUnits(listing.pricing_unit),
      today,
      maxStart: addDays(today, MAX_ADVANCE_DAYS),
      bookedRanges: await getBookedRanges(listing.id, today),
    };
  }
  // 登录/注册回跳时带回之前选好的日期(见 BuyListingButton),不合法就当没选。
  const resumeStart =
    booking && typeof start === "string" && isValidDate(start) && start >= booking.today
      ? start
      : null;
  const resumeUnits =
    booking && typeof units === "string" && Number.isInteger(Number(units))
      ? Math.min(Math.max(Number(units), booking.minUnits), booking.maxUnits)
      : undefined;
  // status='draft' listing 只有卖家自己能看到(见 RLS),但直接访问 URL 时还是要
  // 在页面这层挡一下,免得给其他登录用户看见"未发布"的内部状态。
  const isVisible = listing.status === "active" || isOwnListing;
  if (!isVisible) {
    notFound();
  }

  // 未登录买家点 Buy now → 去登录/注册 → 带 ?resume=buy 回到这里(见
  // BuyListingButton),提示他接着完成付款,不用重新找这条广告。
  const resumingPurchase = resume === "buy" && !!user && !isOwnListing;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      {/* 从 Stripe 付款页点"返回"回来(/api/checkout/cancelled 已经释放了之前的日期)。 */}
      {checkout === "changed" && booking && (
        <p className="mb-6 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Checkout cancelled and those dates are free again — change your dates below and
          check out when you&apos;re ready.{" "}
          <a href="#buy" className="font-medium underline">
            Change dates
          </a>
        </p>
      )}
      {resumingPurchase && (
        <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          You&apos;re signed in — complete your purchase below.{" "}
          <a href="#buy" className="font-medium underline">
            Go to checkout
          </a>
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {listing.ad_type && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {AD_TYPE_LABELS[listing.ad_type]}
              </span>
            )}
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
          <div>
            <p className="flex items-center gap-1.5 font-medium text-zinc-900 hover:underline">
              {seller?.display_name ?? "Anonymous seller"}
              {sellerExtra?.is_verified && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Verified
                </span>
              )}
            </p>
            {listing.is_website_placement ? (
              <div className="mt-1.5 flex items-center">
                <WebsiteStatChip />
              </div>
            ) : placementAccount ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                <SocialStatChip account={placementAccount} />
                <span className="text-xs text-zinc-500">
                  {SOCIAL_PLATFORM_LABELS[placementAccount.platform]}
                </span>
              </div>
            ) : (
              <p className="mt-0.5 text-xs text-zinc-500">Placement not specified</p>
            )}
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

          <div className="mt-6">
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
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div
            id="buy"
            className={`scroll-mt-24 rounded-2xl border bg-zinc-50 p-6 ${
              resumingPurchase ? "border-zinc-900 ring-2 ring-zinc-900/10" : "border-transparent"
            }`}
          >
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
            {listing.pricing_unit === "daily" && !listing.booking_enabled && <DailyCountdown />}
            {listing.booking_enabled && isBookingUnit(listing.pricing_unit) && (
              <p className="mt-1 text-xs text-zinc-500">
                {listing.pricing_unit === "daily"
                  ? `Pick your dates · minimum ${minBookingUnits("daily", listing.min_booking_days)} days`
                  : listing.pricing_unit === "weekly"
                    ? "Pick your dates · booked by the week"
                    : "Pick your dates · booked by the month (30 days)"}
              </p>
            )}

            <div className="mt-4">
              {isOwnListing ? (
                <p className="text-sm text-zinc-500">This is your own listing.</p>
              ) : (
                <>
                  {listing.ad_type === "custom" && (
                    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      This is a custom ad type — message the seller below to
                      agree on scope before buying.
                    </p>
                  )}
                  <BuyListingButton
                    listingId={listing.id}
                    isLoggedIn={!!user}
                    booking={booking}
                    initialStart={resumeStart}
                    initialUnits={resumeUnits}
                  />
                </>
              )}
            </div>
          </div>

          {!isOwnListing && (
            <div id="ask" className="scroll-mt-24 rounded-2xl border border-transparent bg-zinc-50 p-6">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
                Ask the seller
              </h2>
              {user ? (
                <ContactSellerForm listingId={listing.id} />
              ) : (
                // 私信要求登录(防垃圾消息、出了问题能找到人),不开放 guest。
                <p className="text-sm text-zinc-500">
                  <Link
                    href={`/login?next=${encodeURIComponent(`/listings/${listing.id}#ask`)}`}
                    className="underline"
                  >
                    Log in
                  </Link>{" "}
                  or{" "}
                  <Link
                    href={`/register?next=${encodeURIComponent(`/listings/${listing.id}#ask`)}`}
                    className="underline"
                  >
                    create an account
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
