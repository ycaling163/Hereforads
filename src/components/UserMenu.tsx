"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/supabase/auth-actions";

export function UserMenu({
  displayName,
  avatarUrl,
  badgeCount = 0,
}: {
  displayName: string | null;
  avatarUrl: string | null;
  badgeCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const name = displayName || "My account";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 text-zinc-900"
      >
        <span className="relative shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500">
              {name[0]}
            </span>
          )}
          {badgeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </span>
        <span className="hidden text-sm font-medium sm:inline">{name}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-40 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-lg">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
          >
            My account
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="block w-full px-4 py-2 text-left text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
