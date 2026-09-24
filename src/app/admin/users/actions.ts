"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { holdSellerOrders } from "@/lib/orders/holds";

// profiles.is_banned 的 UPDATE 权限收回给 authenticated 了(见 README"管理员系统"
// 一节),封禁/解封只能走这两个 server action。除了打数据库这一列,还调用了 Supabase
// Auth 的管理员 API 真正封住这个账号的登录(ban_duration),不然只改数据库字段的话,
// 用户手上现有的 session/refresh token 在过期前(通常一小时内)还能继续用。

const BAN_DURATION = "876000h"; // ~100 年,相当于永久,直到 unban

export async function banUserAction(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (userId === admin.id) {
    redirect("/admin/users?error=cannot_ban_self");
  }

  const service = createServiceClient();
  await service.from("profiles").update({ is_banned: true }).eq("id", userId);

  // 产品负责人 2026-09-24 确认:被封卖家托管中的订单一律停止放款,由管理员在
  // /admin/holds 根据情况人工处理(退款或放款)。解封不会自动解除这些暂停。
  try {
    await holdSellerOrders(userId);
  } catch (err) {
    console.error("Failed to hold banned seller's orders:", err);
  }

  const { error } = await service.auth.admin.updateUserById(userId, {
    ban_duration: BAN_DURATION,
  });
  if (error) {
    console.error("Failed to ban user at auth level:", error.message);
  }

  redirect("/admin/users");
}

// 解封只恢复登录,不会解除封号时暂停的订单(产品负责人 2026-09-24 确认:管理员逐单解除)。
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

  redirect("/admin/users");
}
