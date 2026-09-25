import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { releaseOrderPayout } from "@/lib/stripe/release";
import { PayoutHeldError } from "@/lib/orders/holds";
import { ESCROW_HOLD_DAYS } from "@/lib/supabase/enums";
import { addDays, bookingDayStart } from "@/lib/booking";

/**
 * 卖家标记交付(ESCROW_HOLD_DAYS 天前)后买家一直没反应,就自动放款,对齐 Fiverr。
 * 只处理已经进入 `delivered` 的订单 —— 卖家没标记交付的订单永远不会被这个任务碰到,
 * 不存在"什么都不做、光收钱躺着也能自动拿到钱"的路径(见 README"平台责任边界"一节)。
 *
 * 由 Vercel Cron 每小时调用(见根目录 vercel.json)。Vercel Cron 发的是 GET,并且在
 * 项目配置了 CRON_SECRET 环境变量时自动带上 Authorization: Bearer $CRON_SECRET;
 * POST 留着方便手动触发。
 *
 * 顺带重试停在 `confirmed` 的订单:那是"已经锁定、但上次放款失败"的订单(Stripe
 * 报错、卖家账户暂时不可用等)。releaseOrderPayout 是幂等的,重试不会重复转账。
 */
async function handle(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(
    Date.now() - ESCROW_HOLD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const [{ data: dueOrders, error }, { data: stuckOrders, error: stuckError }] =
    await Promise.all([
      supabase
        .from("listing_orders")
        .select("id,seller_id,amount,currency,end_date")
        .eq("status", "delivered")
        .lte("delivered_at", cutoff)
        // 暂停放款(拒付/退款/卖家被封)的订单不碰,见 src/lib/orders/holds.ts。
        .is("payout_hold", null),
      supabase
        .from("listing_orders")
        .select("id,seller_id,amount,currency")
        .eq("status", "confirmed")
        .is("payout_hold", null),
    ]);

  if (error || stuckError) {
    return NextResponse.json(
      { error: (error ?? stuckError)!.message },
      { status: 500 }
    );
  }

  const results = { released: 0, retried: 0, held: 0, failed: 0 };

  // 顺带清理限流表里过期的计数(安全核查第 2 批,src/lib/security/rateLimit.ts)。
  // 失败只记日志,不影响放款。
  const { error: purgeError } = await supabase.rpc("purge_rate_limits");
  if (purgeError) {
    console.error("Purging rate_limits failed:", purgeError.message);
  }

  // 日历预订的订单(有 end_date):分两次放款(过半 40%、结束 3 天后 60%)在下一批
  // 实现;这一批先整笔压到预订期结束 3 天后再放,不会提前放款。
  const now = Date.now();
  const releasable = (dueOrders ?? []).filter(
    (order) =>
      !order.end_date ||
      bookingDayStart(addDays(order.end_date, 1 + ESCROW_HOLD_DAYS)).getTime() <= now
  );

  for (const order of releasable) {
    // 用一次条件更新当"锁",防止买家这边同时点了"提前放款"导致同一笔订单被转两次账
    // (谁先把状态从 delivered 抢成 confirmed,谁才有资格继续发起 Stripe transfer)。
    const { data: updatedRows, error: updateError } = await supabase
      .from("listing_orders")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "delivered")
      // 卖家修改交付链接会把 delivered_at 重置成当时(确认期重新计 3 天),这里再核对
      // 一次,防止查询之后刚好改了链接的订单被提前放款。
      .lte("delivered_at", cutoff)
      .is("payout_hold", null)
      .select("id");

    if (updateError || !updatedRows || updatedRows.length === 0) {
      results.failed += 1;
      continue;
    }

    try {
      await releaseOrderPayout(order);
      results.released += 1;
    } catch (err) {
      if (err instanceof PayoutHeldError) {
        results.held += 1;
        continue;
      }
      console.error("Auto-release payout failed for order", order.id, err);
      results.failed += 1;
    }
  }

  for (const order of stuckOrders ?? []) {
    try {
      await releaseOrderPayout(order);
      results.retried += 1;
    } catch (err) {
      if (err instanceof PayoutHeldError) {
        results.held += 1;
        continue;
      }
      console.error("Retrying payout failed for order", order.id, err);
      results.failed += 1;
    }
  }

  return NextResponse.json(results);
}

export const GET = handle;
export const POST = handle;
