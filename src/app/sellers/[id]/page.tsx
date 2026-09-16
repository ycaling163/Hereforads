import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SpaceCard } from "@/components/SpaceCard";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/supabase/enums";
import type {
  AdSpace,
  Profile,
  SellerProfile,
  SocialAccount,
} from "@/lib/supabase/types";

export default async function SellerProfilePage({
  params,
}: PageProps<"/sellers/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  const [{ data: sellerProfile }, { data: socialAccounts }, { data: spaces }] =
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
        .from("ad_spaces")
        .select("*")
        .eq("seller_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const seller = profile as Profile;
  const sellerExtra = sellerProfile as SellerProfile | null;
  const accounts = (socialAccounts ?? []) as SocialAccount[];
  const adSpaces = (spaces ?? []) as AdSpace[];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="flex items-start gap-4">
        {sellerExtra?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sellerExtra.avatar_url}
            alt={seller.display_name ?? "seller"}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xl text-zinc-500">
            {(seller.display_name ?? "S")[0]}
          </div>
        )}
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-900">
            {seller.display_name ?? "匿名卖家"}
            {sellerExtra?.is_verified && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                已认证
              </span>
            )}
          </h1>
          {sellerExtra?.bio && (
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
              {sellerExtra.bio}
            </p>
          )}
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            社交账号
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-zinc-900">
                  {SOCIAL_PLATFORM_LABELS[account.platform] ?? account.platform}
                </span>
                {account.handle && (
                  <span className="text-zinc-500">{account.handle}</span>
                )}
                {account.url && (
                  <a
                    href={account.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
                  >
                    {account.url}
                  </a>
                )}
                {account.follower_count && (
                  <span className="text-zinc-400">
                    {account.follower_count} 粉丝
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          全部广告位
        </h2>
        {adSpaces.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">还没有发布广告位。</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {adSpaces.map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
