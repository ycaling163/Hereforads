import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const NAV_ITEMS = [
  { href: "/dashboard/new-listing", label: "Publish listing" },
  { href: "/dashboard/sales", label: "Sales" },
  { href: "/dashboard/purchases", label: "Purchases" },
  { href: "/dashboard/messages", label: "Messages" },
  { href: "/dashboard/stripe-connect", label: "Stripe payouts" },
  { href: "/dashboard/profile", label: "个人资料" },
  { href: "/dashboard/spaces", label: "我的广告位(旧)" },
  { href: "/dashboard/orders", label: "收到的预订(旧)" },
  { href: "/dashboard/bookings", label: "我的预订(旧)" },
  { href: "/dashboard/payments", label: "收款设置(旧)" },
  { href: "/dashboard/new-space", label: "发布广告位(旧)" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <nav className="mb-10 flex flex-wrap gap-2 border-b border-zinc-200 pb-4">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full px-4 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
