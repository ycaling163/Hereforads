import { createServiceClient } from "@/lib/supabase/service";
import { StatCard } from "@/components/StatCard";
import { bookingDayStart, bookingToday } from "@/lib/booking";

export default async function AdminOverviewPage() {
  const admin = createServiceClient();
  // "今日"按英国时间 0 点算(产品负责人 2026-09-25 确认),跟日历预订用同一个时区函数。
  const todayStart = bookingDayStart(bookingToday()).toISOString();

  const [
    { count: pendingCount },
    { count: userCount },
    { count: bannedCount },
    { count: contactMessageCount },
    { count: heldCount },
    { count: newUsersToday },
    { count: unreadContactCount },
  ] = await Promise.all([
    admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_banned", true),
    admin.from("contact_messages").select("id", { count: "exact", head: true }),
    admin
      .from("listing_orders")
      .select("id", { count: "exact", head: true })
      .not("payout_hold", "is", null),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    admin
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Admin
      </h1>
      <p className="mt-2 text-zinc-600">
        Site-wide moderation — visible only to accounts listed in the{" "}
        <code>admins</code> table.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Listings pending review"
          value={String(pendingCount ?? 0)}
          href="/admin/listings?status=pending_review"
        />
        <StatCard
          label="Total users"
          value={String(userCount ?? 0)}
          href="/admin/users"
          badge={newUsersToday ? `+${newUsersToday} today` : undefined}
          badgeTone="green"
        />
        <StatCard
          label="Banned users"
          value={String(bannedCount ?? 0)}
          href="/admin/users"
        />
        <StatCard
          label="Contact messages"
          value={String(contactMessageCount ?? 0)}
          href="/admin/contact"
          badge={unreadContactCount ? `${unreadContactCount} new` : undefined}
        />
        <StatCard
          label="Orders on hold (disputes/refunds)"
          value={String(heldCount ?? 0)}
          href="/admin/holds"
        />
      </div>
    </div>
  );
}
