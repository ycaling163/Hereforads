import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { releaseOrderPayout } from "@/lib/stripe/release";
import { AUTO_CONFIRM_DAYS } from "@/lib/supabase/enums";

/**
 * 买家超时(AUTO_CONFIRM_DAYS 天)不确认收货就自动放款,对齐 Fiverr。
 * 这版没有配实际的定时触发器 —— 需要外部按小时/按天调用这个端点(Vercel Cron 或
 * Supabase pg_cron 都行),带上 Authorization: Bearer $CRON_SECRET。
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(
    Date.now() - AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: orders, error } = await supabase
    .from("listing_orders")
    .select("id,seller_id,amount,currency")
    .eq("status", "delivered")
    .lte("delivered_at", cutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = { confirmed: 0, failed: 0 };

  for (const order of orders ?? []) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("listing_orders")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "delivered")
      .select("id");

    if (updateError || !updatedRows || updatedRows.length === 0) {
      results.failed += 1;
      continue;
    }

    try {
      await releaseOrderPayout(order);
      results.confirmed += 1;
    } catch (err) {
      console.error("Auto-confirm payout failed for order", order.id, err);
      results.failed += 1;
    }
  }

  return NextResponse.json(results);
}
