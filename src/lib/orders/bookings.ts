import { createServiceClient } from "@/lib/supabase/service";
import type { DateRange } from "@/lib/booking";

/**
 * 某条 listing 已被占用的日期段(README"日历按天预订"第 2 条),给详情页日历置灰用。
 * listing_orders 的 RLS 只让买卖双方看自己的订单,这里用 service_role 读,只返回
 * 日期,不带买家信息。占用的订单:已付款的(没取消),以及还在付款占用期内的待付款
 * 订单。真正防重叠靠数据库函数 create_booking_order(见 README 的 SQL),这里只是展示。
 */
export async function getBookedRanges(listingId: string, fromDate: string): Promise<DateRange[]> {
  const { data, error } = await createServiceClient()
    .from("listing_orders")
    .select("start_date,end_date,status,hold_expires_at")
    .eq("listing_id", listingId)
    .not("start_date", "is", null)
    .gte("end_date", fromDate)
    .neq("status", "cancelled");

  if (error) {
    console.error("Failed to load booked dates:", error.message);
    return [];
  }

  const now = Date.now();
  return (data ?? [])
    .filter(
      (o) =>
        o.status !== "pending_payment" ||
        (o.hold_expires_at !== null && new Date(o.hold_expires_at).getTime() > now)
    )
    .map((o) => ({ start: o.start_date as string, end: o.end_date as string }))
    .sort((a, b) => a.start.localeCompare(b.start));
}
