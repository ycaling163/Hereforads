"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";

// listings.status / is_featured 的 UPDATE 权限收回给 authenticated 了(见 README
// "管理员系统"一节),所有状态流转只能走这几个 server action,用 service_role client写。

export async function approveListingAction(listingId: string): Promise<void> {
  await requireAdmin();
  await createServiceClient()
    .from("listings")
    .update({ status: "active" })
    .eq("id", listingId)
    .eq("status", "pending_review");
  redirect("/dashboard/admin/listings");
}

export async function rejectListingAction(listingId: string): Promise<void> {
  await requireAdmin();
  await createServiceClient()
    .from("listings")
    .update({ status: "rejected" })
    .eq("id", listingId)
    .eq("status", "pending_review");
  redirect("/dashboard/admin/listings");
}

export async function removeListingAction(listingId: string): Promise<void> {
  await requireAdmin();
  // 下架跟 reject 不一样:reject 只发生在 pending_review 阶段(审核没通过),
  // remove 是已经 active 之后发现违规内容,任何状态都能被 remove。
  await createServiceClient()
    .from("listings")
    .update({ status: "removed" })
    .eq("id", listingId);
  redirect("/dashboard/admin/listings");
}

export async function setFeaturedAction(
  listingId: string,
  featured: boolean
): Promise<void> {
  await requireAdmin();
  await createServiceClient()
    .from("listings")
    .update({ is_featured: featured })
    .eq("id", listingId);
  redirect("/dashboard/admin/listings");
}
