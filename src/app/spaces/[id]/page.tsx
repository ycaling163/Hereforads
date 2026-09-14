import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SocialLinks } from "@/components/SocialLinks";
import { BookingCalendar } from "@/components/BookingCalendar";
import { AD_SPACE_STATUS_LABELS } from "@/lib/supabase/enums";
import { getBlockingRanges, getNextAvailableStart, addDays } from "@/lib/booking";
import type {
  AdSpace,
  Order,
  Profile,
  SellerProfile,
  SocialAccount,
} from "@/lib/supabase/types";

export default async function SpaceDetailPage({
  params,
}: PageProps<"/spaces/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: space } = await supabase
    .from("ad_spaces")
    .select("*")
    .eq("id", id)
    .single();

  if (!space) {
    notFound();
  }

  const adSpace = space as AdSpace;

  const [
    { data: profile },
    { data: sellerProfile },
    { data: socialAccounts },
    { data: orders },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", adSpace.seller_id)
      .maybeSingle(),
    supabase
      .from("seller_profiles")
      .select("*")
      .eq("user_id", adSpace.seller_id)
      .maybeSingle(),
    supabase
      .from("social_accounts")
      .select("*")
      .eq("user_id", adSpace.seller_id),
    supabase.from("orders").select("*").eq("ad_space_id", adSpace.id),
    supabase.auth.getUser(),
  ]);

  const seller = profile as Profile | null;
  const sellerExtra = sellerProfile as SellerProfile | null;
  const accounts = (socialAccounts ?? []) as SocialAccount[];

  const blockingRanges = getBlockingRanges((orders ?? []) as Order[]);
  const nextAvailableStart = getNextAvailableStart(
    blockingRanges,
    adSpace.duration_days
  );
  const nextAvailableEnd = addDays(
    new Date(nextAvailableStart),
    adSpace.duration_days - 1
  )
    .toISOString()
    .slice(0, 10);

  const photos = adSpace.photo_urls ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-zinc-100">
            {photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photos[0]}
                alt={adSpace.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400">
                暂无图片
              </div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {photos.slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={adSpace.title}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ))}
            </div>
          )}

          <div className="mt-8 flex items-center gap-2">
            {adSpace.keyword && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                {adSpace.keyword}
              </span>
            )}
            <span className="rounded-full bg-zinc-900/5 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
              {AD_SPACE_STATUS_LABELS[adSpace.status] ?? adSpace.status}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900">
            {adSpace.title}
          </h1>
          {adSpace.city && (
            <p className="mt-1 text-zinc-500">{adSpace.city}</p>
          )}

          <div className="mt-8">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
              预订日历
            </h2>
            <BookingCalendar
              adSpaceId={adSpace.id}
              blockingRanges={blockingRanges}
              nextAvailableStart={nextAvailableStart}
              nextAvailableEnd={nextAvailableEnd}
              durationDays={adSpace.duration_days}
              priceAmount={adSpace.price_amount}
              priceCurrency={adSpace.price_currency}
              isLoggedIn={!!user}
              isOwnSpace={user?.id === adSpace.seller_id}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-zinc-200 p-6">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-zinc-900">
                {adSpace.price_amount}
              </span>
              <span className="text-zinc-500">{adSpace.price_currency}</span>
            </div>
            {adSpace.duration_days && (
              <p className="mt-1 text-sm text-zinc-500">
                / {adSpace.duration_days} 天
              </p>
            )}
            {adSpace.description && (
              <p className="mt-4 whitespace-pre-line text-sm leading-6 text-zinc-600">
                {adSpace.description}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
              卖家信息
            </h2>
            <div className="flex items-center gap-3">
              {sellerExtra?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sellerExtra.avatar_url}
                  alt={seller?.display_name ?? "seller"}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 text-zinc-500">
                  {(seller?.display_name ?? "S")[0]}
                </div>
              )}
              <div>
                <p className="flex items-center gap-1.5 font-medium text-zinc-900">
                  {seller?.display_name ?? "匿名卖家"}
                  {sellerExtra?.is_verified && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      已认证
                    </span>
                  )}
                </p>
              </div>
            </div>
            {sellerExtra?.bio && (
              <p className="mt-4 text-sm leading-6 text-zinc-600">
                {sellerExtra.bio}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
              社交账号
            </h2>
            <SocialLinks accounts={accounts} />
          </div>
        </div>
      </div>
    </div>
  );
}
