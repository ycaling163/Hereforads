import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";

/**
 * 买家改主意(换日期/时长)时,立刻释放他自己还没付款的日历占用(2026-09-25 产品负责人
 * 测试反馈,见 README"改日期:立刻释放未付款的占用")。
 *
 * 先让 Stripe 的付款链接作废(sessions.expire),确认这个链接已经付不了款,才把订单的
 * hold_expires_at 改成现在——日历上这段日期马上变回可选。链接已经付款成功(complete)
 * 或者查不清楚的,一律不释放,避免"日期放出去了、钱又付进来"造成重复预订。订单本身
 * 留在 pending_payment(跟占用自然过期的订单一样),不改成 cancelled。
 */

export interface UnpaidHold {
  id: string;
  buyer_id: string;
  hold_ip_hash: string | null;
  checkout_session_id: string | null;
}

const HOLD_COLUMNS = "id,buyer_id,hold_ip_hash,checkout_session_id";

/**
 * 谁可以释放:登录买家本人;没登录的(guest)要求下单时的 IP 哈希一致——光知道订单 id
 * 或者别人的邮箱,不能把别人正在付款的链接作废掉。
 */
export function canReleaseHold(
  hold: UnpaidHold,
  userId: string | null,
  ipHash: string | null
): boolean {
  if (userId) return hold.buyer_id === userId;
  return !!ipHash && hold.hold_ip_hash === ipHash;
}

export async function releaseUnpaidHold(hold: UnpaidHold): Promise<boolean> {
  // 没记下付款链接的(这个功能上线前的订单)不知道链接还能不能付,等它自然过期。
  if (!hold.checkout_session_id) return false;

  try {
    await stripe.checkout.sessions.expire(hold.checkout_session_id);
  } catch {
    // 已经过期或已经付款的链接不能再 expire,查一下实际状态。
    try {
      const session = await stripe.checkout.sessions.retrieve(hold.checkout_session_id);
      if (session.status !== "expired") return false;
    } catch (err) {
      console.error("Couldn't check checkout session before releasing hold:", hold.id, err);
      return false;
    }
  }

  const { error } = await createServiceClient()
    .from("listing_orders")
    .update({ hold_expires_at: new Date().toISOString() })
    .eq("id", hold.id)
    .eq("status", "pending_payment");
  if (error) {
    console.error("Failed to release booking hold:", hold.id, error.message);
    return false;
  }
  return true;
}

/** 查一张还在占用期内、没付款的日历订单;查不到(或 SQL 还没执行)返回 null。 */
export async function findUnpaidHold(orderId: string): Promise<(UnpaidHold & { listing_id: string; start_date: string; booking_units: number | null }) | null> {
  const { data, error } = await createServiceClient()
    .from("listing_orders")
    .select(`${HOLD_COLUMNS},listing_id,start_date,booking_units`)
    .eq("id", orderId)
    .eq("status", "pending_payment")
    .gt("hold_expires_at", new Date().toISOString())
    .not("start_date", "is", null)
    .maybeSingle();
  if (error) {
    console.error("Failed to look up unpaid hold:", orderId, error.message);
    return null;
  }
  return data;
}

/**
 * 同一买家在同一条广告上重新下单时,先释放他之前没付款的占用:不管他是点了 Stripe 的
 * "返回"、浏览器后退,还是关掉了付款页,换日期重新下单都不会被自己之前的占用挡住。
 */
export async function releaseBuyerHoldsOnListing(
  listingId: string,
  buyerId: string,
  userId: string | null,
  ipHash: string | null
): Promise<void> {
  const { data, error } = await createServiceClient()
    .from("listing_orders")
    .select(HOLD_COLUMNS)
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .eq("status", "pending_payment")
    .gt("hold_expires_at", new Date().toISOString())
    .not("start_date", "is", null);
  if (error) {
    console.error("Failed to look up buyer's unpaid holds:", error.message);
    return;
  }
  for (const hold of (data ?? []) as UnpaidHold[]) {
    if (canReleaseHold(hold, userId, ipHash)) {
      await releaseUnpaidHold(hold);
    }
  }
}
