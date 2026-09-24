"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavEntry =
  | { type: "link"; href: string; label: string }
  | { type: "group"; label: string; items: { href: string; label: string }[] };

const NAV: NavEntry[] = [
  { type: "link", href: "/dashboard", label: "Dashboard" },
  {
    type: "group",
    label: "Ad Management",
    items: [
      { href: "/dashboard/new-listing", label: "Publish listing" },
      { href: "/dashboard/my-listings", label: "My listings" },
    ],
  },
  {
    type: "group",
    label: "Transaction Management",
    items: [
      { href: "/dashboard/sales", label: "Sales" },
      { href: "/dashboard/purchases", label: "Purchases" },
    ],
  },
  { type: "link", href: "/dashboard/stripe-connect", label: "Payment Management" },
  { type: "link", href: "/dashboard/messages", label: "Messages" },
  { type: "link", href: "/dashboard/profile", label: "Profile" },
  { type: "link", href: "/dashboard/password", label: "Password" },
];

const EXACT_MATCH_HREFS = new Set(["/dashboard"]);

function isActive(pathname: string, href: string) {
  return EXACT_MATCH_HREFS.has(href) ? pathname === href : pathname.startsWith(href);
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function NavLink({
  href,
  label,
  active,
  badgeCount,
}: {
  href: string;
  label: string;
  active: boolean;
  badgeCount?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      {label}
      {typeof badgeCount === "number" && <NavBadge count={badgeCount} />}
    </Link>
  );
}

export function DashboardSidebar({
  unreadMessages = 0,
  newOrders = 0,
}: {
  unreadMessages?: number;
  newOrders?: number;
}) {
  const pathname = usePathname();
  const badgeByHref: Record<string, number> = {
    "/dashboard/messages": unreadMessages,
    "/dashboard/sales": newOrders,
  };

  // 手机上(md 以下)侧栏会把正文挤成一条,改成顶部一排可横向滑动的标签;桌面端还是左侧竖排。
  const mobileLinks = NAV.flatMap((entry) => (entry.type === "link" ? [entry] : entry.items));

  return (
    <>
    <nav className="-mx-4 flex gap-2 overflow-x-auto border-b border-zinc-200 px-4 pb-3 md:hidden">
      {mobileLinks.map((item) => {
        const active = isActive(pathname, item.href);
        const badge = badgeByHref[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
              active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {item.label}
            {badge > 0 && (
              <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-4 text-white">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
    <nav className="hidden w-48 shrink-0 flex-col gap-4 md:flex">
      {NAV.map((entry) =>
        entry.type === "link" ? (
          <NavLink
            key={entry.href}
            href={entry.href}
            label={entry.label}
            active={isActive(pathname, entry.href)}
            badgeCount={badgeByHref[entry.href]}
          />
        ) : (
          <div key={entry.label} className="flex flex-col gap-1">
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {entry.label}
            </p>
            {entry.items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActive(pathname, item.href)}
                badgeCount={badgeByHref[item.href]}
              />
            ))}
          </div>
        )
      )}
    </nav>
    </>
  );
}
