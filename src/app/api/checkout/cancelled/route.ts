import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canReleaseHold, findUnpaidHold, releaseUnpaidHold } from "@/lib/orders/releaseHold";
import { clientIp, hashIdentifier } from "@/lib/security/rateLimit";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 日历订单的 Stripe cancel_url:买家在付款页点"返回"回到这里。立刻作废付款链接、
 * 释放这段日期,再带着刚才选的开始日期和时长回到广告页,买家直接改就行
 * (2026-09-25 产品负责人测试反馈)。只有买家本人(登录)或同一个 IP(guest)能释放。
 */
export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("order") ?? "";
  if (!UUID_PATTERN.test(orderId)) {
    redirect("/listings");
  }

  const hold = await findUnpaidHold(orderId);
  if (!hold) {
    redirect("/listings");
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const ip = await clientIp();
  const ipHash = ip ? hashIdentifier("ip", ip) : null;

  let released = false;
  if (canReleaseHold(hold, user?.id ?? null, ipHash)) {
    released = await releaseUnpaidHold(hold);
  }

  const params = new URLSearchParams({ checkout: released ? "changed" : "cancelled" });
  if (released) {
    params.set("start", hold.start_date);
    if (hold.booking_units) params.set("units", String(hold.booking_units));
  }
  redirect(`/listings/${hold.listing_id}?${params.toString()}#buy`);
}
