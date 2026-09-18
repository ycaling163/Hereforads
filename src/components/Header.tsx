import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActionCounts } from "@/lib/supabase/notification-counts";
import { isAdmin } from "@/lib/supabase/admin";
import { UserMenu } from "./UserMenu";

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
    <header className="border-b border-zinc-200">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="Here For Ads"
            width={140}
            height={111}
            className="h-7 w-auto sm:h-10"
            priority
          />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-zinc-600 sm:gap-6">
          <Link href="/listings" className="hover:text-zinc-900">
            Ad spaces
          </Link>
          <Link href="/creators" className="hover:text-zinc-900">
            Creators
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
        </nav>
      </div>
    </header>
  );
}
