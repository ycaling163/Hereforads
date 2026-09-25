"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 管理员删除一条没用的留言(产品负责人 2026-09-25 要求)。直接删除,不可恢复。 */
export async function deleteContactMessageAction(id: string): Promise<void> {
  await requireAdmin();
  if (!UUID_PATTERN.test(id)) return;

  const { error } = await createServiceClient().from("contact_messages").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete contact message:", error.message);
  }
  revalidatePath("/admin", "layout");
}

/**
 * 打开 /admin/contact 就把当时看到的留言全部算作已读(产品负责人 2026-09-25 确认)。
 * 由页面上的客户端组件在真正显示之后调用,而不是在服务端渲染时直接改——链接预取
 * (prefetch)也会渲染页面,那样管理员还没看就被标成已读了。只标 `before` 之前的,
 * 页面打开之后才进来的新留言保持未读。
 */
export async function markContactMessagesReadAction(before: string): Promise<void> {
  await requireAdmin();
  const cutoff = new Date(before);
  if (Number.isNaN(cutoff.getTime())) return;

  const { error } = await createServiceClient()
    .from("contact_messages")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .lte("created_at", cutoff.toISOString());
  if (error) {
    console.error("Failed to mark contact messages read:", error.message);
  }
}
