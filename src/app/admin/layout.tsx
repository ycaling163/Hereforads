import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminNavBadge } from "@/components/AdminNavBadge";

const ADMIN_NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/holds", label: "Disputes & holds" },
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
  // 这里的检查只管"不是管理员就跳走",挡不住子页面:Next.js 站内跳转时 layout 不重新
  // 渲染,子页面照样会执行、内容照样会返回给浏览器(见 Next.js 文档 Authentication →
  // "Layouts and auth checks")。所以 /admin 下每个页面、每个 server action 都必须自己先
  // 调 requireAdmin(),新加页面别漏(2026-09-25 安全复查发现过 6 个页面漏了)。
  await requireAdmin();

  // Contact 未读数(read_at 为空),显示成导航上的红点。
  const { count: unreadContactCount } = await createServiceClient()
    .from("contact_messages")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

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
                {item.href === "/admin/contact" && (
                  <AdminNavBadge initialCount={unreadContactCount ?? 0} />
                )}
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
