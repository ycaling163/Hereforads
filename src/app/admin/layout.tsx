import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";

const ADMIN_NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/contact", label: "Contact" },
  { href: "/admin/pages", label: "Pages" },
];

// 整个 /admin/* 子树是跟 /dashboard/* 平级的独立页面,不共用 DashboardSidebar ——
// 管理员和普通用户视角要在页面层面彻底分开,不是共用一个侧栏靠样式区分。
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2 text-white">
            <span className="text-lg">🛡</span>
            <span className="font-semibold tracking-tight">Admin</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-400 hover:text-white"
          >
            ← Back to my dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
