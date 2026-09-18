import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActionCounts } from "@/lib/supabase/notification-counts";
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

  const { unreadMessages, newOrders } = await getActionCounts(supabase, user.id);

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-10 px-6 py-12">
      <DashboardSidebar unreadMessages={unreadMessages} newOrders={newOrders} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
