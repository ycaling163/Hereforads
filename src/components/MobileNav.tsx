"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/listings", label: "Ad spaces" },
  { href: "/publishers", label: "Publishers" },
  { href: "/orders/find", label: "Find an order" },
  { href: "/help", label: "Help & examples" },
];

// 手机上(sm 以下)导航收进汉堡菜单,避免 logo 和几个链接挤在一行、换成两行
// (2026-09-24 产品负责人手机测试反馈)。桌面端还是 Header 里那一排链接。
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 换页后自动收起。
  useEffect(() => {
    const close = () => setOpen(false);
    close();
  }, [pathname]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <nav className="absolute inset-x-0 top-full z-40 border-b border-zinc-200 bg-white px-4 py-2 shadow-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-lg px-3 py-3 text-base font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
