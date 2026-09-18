import { requireAdmin } from "@/lib/supabase/admin";

// 整个 /dashboard/admin/* 子树共用这一道闸:不是管理员直接跳回普通 dashboard,
// 子页面不用各自重复写这个校验。
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return <>{children}</>;
}
