import { createServiceClient } from "@/lib/supabase/service";
import { StatCard } from "@/components/StatCard";

export default async function AdminOverviewPage() {
  const admin = createServiceClient();

  const [{ count: pendingCount }, { count: userCount }, { count: bannedCount }] =
    await Promise.all([
      admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review"),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_banned", true),
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

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Listings pending review"
          value={String(pendingCount ?? 0)}
          href="/admin/listings?status=pending_review"
        />
        <StatCard
          label="Total users"
          value={String(userCount ?? 0)}
          href="/admin/users"
        />
        <StatCard
          label="Banned users"
          value={String(bannedCount ?? 0)}
          href="/admin/users"
        />
      </div>
    </div>
  );
}
