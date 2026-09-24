import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActionCounts } from "@/lib/supabase/notification-counts";
import { cookies } from "next/headers";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { PasswordNudge, PASSWORD_NUDGE_COOKIE } from "@/components/PasswordNudge";
import { hasPassword, usesSocialLogin } from "@/lib/supabase/password";

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

  const cookieStore = await cookies();
  const [{ unreadMessages, newOrders }, hasPw] = await Promise.all([
    getActionCounts(supabase, user.id),
    usesSocialLogin(user) || cookieStore.has(PASSWORD_NUDGE_COOKIE)
      ? Promise.resolve(null)
      : hasPassword(supabase),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-10 md:px-6 md:py-12">
      <DashboardSidebar unreadMessages={unreadMessages} newOrders={newOrders} />
      <main className="min-w-0 flex-1">
        {/* 免密码登录进来、还没设密码的账号(主要是 guest 买家),提醒设密码。 */}
        {hasPw === false && <PasswordNudge />}
        {children}
      </main>
    </div>
  );
}
