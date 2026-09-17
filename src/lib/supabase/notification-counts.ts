import type { SupabaseClient } from "@supabase/supabase-js";

// 给 Header/DashboardSidebar 的小红点用,两边各自渲染但复用同一份查询逻辑,
// 免得统计口径写岔了。用 head:true + count:"exact" 只要总数,不用把行拉回来。
export async function getActionCounts(
  supabase: SupabaseClient,
  userId: string
): Promise<{ unreadMessages: number; newOrders: number }> {
  const [{ count: unreadMessages }, { count: newOrders }] = await Promise.all([
    supabase
      .from("listing_messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .is("read_at", null),
    supabase
      .from("listing_orders")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", userId)
      .eq("status", "paid_in_escrow"),
  ]);

  return {
    unreadMessages: unreadMessages ?? 0,
    newOrders: newOrders ?? 0,
  };
}
