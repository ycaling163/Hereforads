"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";

// profiles.is_banned 的 UPDATE 权限收回给 authenticated 了(见 README"管理员系统"
// 一节),封禁/解封只能走这两个 server action。除了打数据库这一列,还调用了 Supabase
// Auth 的管理员 API 真正封住这个账号的登录(ban_duration),不然只改数据库字段的话,
// 用户手上现有的 session/refresh token 在过期前(通常一小时内)还能继续用。

const BAN_DURATION = "876000h"; // ~100 年,相当于永久,直到 unban

export async function banUserAction(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (userId === admin.id) {
    redirect("/dashboard/admin/users?error=cannot_ban_self");
  }

  const service = createServiceClient();
  await service.from("profiles").update({ is_banned: true }).eq("id", userId);

  const { error } = await service.auth.admin.updateUserById(userId, {
    ban_duration: BAN_DURATION,
  });
  if (error) {
    console.error("Failed to ban user at auth level:", error.message);
  }

  redirect("/dashboard/admin/users");
}

export async function unbanUserAction(userId: string): Promise<void> {
  await requireAdmin();

  const service = createServiceClient();
  await service.from("profiles").update({ is_banned: false }).eq("id", userId);

  const { error } = await service.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (error) {
    console.error("Failed to unban user at auth level:", error.message);
  }

  redirect("/dashboard/admin/users");
}
