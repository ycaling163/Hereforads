import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActionCounts } from "@/lib/supabase/notification-counts";
import { isAdmin } from "@/lib/supabase/admin";
import { DashboardSidebar } from "@/components/DashboardSidebar";

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

  const [{ unreadMessages, newOrders }, admin] = await Promise.all([
    getActionCounts(supabase, user.id),
    isAdmin(supabase, user.id),
  ]);

  // 只有管理员才多查一次待审核数量,普通用户不用付这个额外查询的开销。
  let pendingReviewCount = 0;
  if (admin) {
    const { count } = await createServiceClient()
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review");
    pendingReviewCount = count ?? 0;
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-10 px-6 py-12">
      <DashboardSidebar
        unreadMessages={unreadMessages}
        newOrders={newOrders}
        isAdmin={admin}
        pendingReview={pendingReviewCount}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
