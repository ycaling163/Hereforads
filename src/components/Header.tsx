import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./LogoutButton";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-zinc-200">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-zinc-900">
          myadsspace
        </Link>
        <nav className="flex items-center gap-6 text-sm text-zinc-600">
          <Link href="/spaces" className="hover:text-zinc-900">
            浏览广告位
          </Link>
          {user ? (
            <>
              <Link href="/dashboard" className="hover:text-zinc-900">
                会员中心
              </Link>
              <Link href="/dashboard/new-space" className="hover:text-zinc-900">
                发布广告位
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-zinc-900">
                登录
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-zinc-900 px-4 py-1.5 text-white hover:bg-zinc-700"
              >
                注册
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
