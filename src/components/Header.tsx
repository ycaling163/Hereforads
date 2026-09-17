import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "./UserMenu";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  if (user) {
    const [{ data: profile }, { data: sellerProfile }] = await Promise.all([
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
    ]);
    displayName = profile?.display_name ?? null;
    avatarUrl = sellerProfile?.avatar_url ?? null;
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
            Listings
          </Link>
          {user ? (
            <UserMenu displayName={displayName} avatarUrl={avatarUrl} />
          ) : (
            <Link href="/login" className="hover:text-zinc-900">
              登录
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
