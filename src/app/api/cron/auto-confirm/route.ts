import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { releaseOrderPayout } from "@/lib/stripe/release";
import { ESCROW_HOLD_DAYS } from "@/lib/supabase/enums";

/**
 * 资金冻结期(ESCROW_HOLD_DAYS 天,从付款时间算)过后自动放款给卖家 —— 平台不裁定
 * 履约结果,这个等待纯粹是给拒付/欺诈留一个操作窗口,不是等"买家确认收货"。
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
    Date.now() - ESCROW_HOLD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: orders, error } = await supabase
    .from("listing_orders")
    .select("id,seller_id,amount,currency")
    .eq("status", "paid_in_escrow")
    .lte("paid_at", cutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = { released: 0, failed: 0 };

  for (const order of orders ?? []) {
    // 用一次条件更新当"锁",防止买家这边同时点了"提前放款"导致同一笔订单被转两次账
    // (谁先把状态从 paid_in_escrow 抢成 confirmed,谁才有资格继续发起 Stripe transfer)。
    const { data: updatedRows, error: updateError } = await supabase
      .from("listing_orders")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "paid_in_escrow")
      .select("id");

    if (updateError || !updatedRows || updatedRows.length === 0) {
      results.failed += 1;
      continue;
    }

    try {
      await releaseOrderPayout(order);
      results.released += 1;
    } catch (err) {
      console.error("Auto-release payout failed for order", order.id, err);
      results.failed += 1;
    }
  }

  return NextResponse.json(results);
}
