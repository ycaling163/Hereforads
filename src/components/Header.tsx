import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActionCounts } from "@/lib/supabase/notification-counts";
import { isAdmin } from "@/lib/supabase/admin";
import { UserMenu } from "./UserMenu";
import { MobileNav } from "./MobileNav";
import { SITE } from "@/config/site";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  let badgeCount = 0;
  let admin = false;
  if (user) {
    const [{ data: profile }, { data: sellerProfile }, counts, adminFlag] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("seller_profiles")
        .select("avatar_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      getActionCounts(supabase, user.id),
      isAdmin(supabase, user.id),
    ]);
    displayName = profile?.display_name ?? null;
    avatarUrl = sellerProfile?.avatar_url ?? null;
    badgeCount = counts.unreadMessages + counts.newOrders;
    admin = adminFlag;
  }

  return (
    <header className="relative border-b border-zinc-200">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src={SITE.logo.src}
            alt={SITE.logo.alt}
            width={SITE.logo.width}
            height={SITE.logo.height}
            className="h-6 w-auto sm:h-10"
            priority
          />
        </Link>
        <nav className="flex items-center gap-3 whitespace-nowrap text-sm font-bold text-zinc-600 sm:gap-6">
          {/* 桌面端一排链接;手机上收进 MobileNav 的汉堡菜单,只留登录/头像在外面。 */}
          <Link href="/listings" className="hidden hover:text-zinc-900 sm:inline">
            Ad spaces
          </Link>
          <Link href="/publishers" className="hidden hover:text-zinc-900 sm:inline">
            Publishers
          </Link>
          {user ? (
            <UserMenu
              displayName={displayName}
              avatarUrl={avatarUrl}
              badgeCount={badgeCount}
              isAdmin={admin}
            />
          ) : (
            <Link href="/login" className="hover:text-zinc-900">
              Log in
            </Link>
          )}
          <MobileNav />
        </nav>
      </div>
    </header>
  );
}
