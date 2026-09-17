"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavEntry =
  | { type: "link"; href: string; label: string }
  | { type: "group"; label: string; items: { href: string; label: string }[] };

const NAV: NavEntry[] = [
  { type: "link", href: "/dashboard", label: "仪表盘" },
  {
    type: "group",
    label: "广告管理",
    items: [
      { href: "/dashboard/new-listing", label: "Publish listing" },
      { href: "/dashboard/my-listings", label: "My listings" },
    ],
  },
  {
    type: "group",
    label: "交易管理",
    items: [
      { href: "/dashboard/sales", label: "Sales" },
      { href: "/dashboard/purchases", label: "Purchases" },
    ],
  },
  { type: "link", href: "/dashboard/stripe-connect", label: "支付管理" },
  { type: "link", href: "/dashboard/messages", label: "消息" },
  { type: "link", href: "/dashboard/profile", label: "个人资料" },
];

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      {label}
    </Link>
  );
}

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex w-48 shrink-0 flex-col gap-4">
      {NAV.map((entry) =>
        entry.type === "link" ? (
          <NavLink
            key={entry.href}
            href={entry.href}
            label={entry.label}
            active={isActive(pathname, entry.href)}
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
              />
            ))}
          </div>
        )
      )}
    </nav>
  );
}
