"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";

// 管理员监管赞助商展示(README"赞助商展示"一节):管理员隐藏的,卖家和买家都打不开。

export async function setOrderSponsorHiddenByAdminAction(orderId: string, hidden: boolean) {
  await requireAdmin();
  await createServiceClient()
    .from("listing_orders")
    .update({ sponsor_hidden_by_admin_at: hidden ? new Date().toISOString() : null })
    .eq("id", orderId);
  revalidatePath("/admin/sponsors");
}

export async function setHouseAdHiddenByAdminAction(id: string, hidden: boolean) {
  await requireAdmin();
  await createServiceClient()
    .from("seller_house_ads")
    .update({ hidden_by_admin_at: hidden ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath("/admin/sponsors");
}
