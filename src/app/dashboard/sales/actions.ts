"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendOrderDeliveredEmail } from "@/lib/email/orders";
import { bookingToday, formatBookingDate } from "@/lib/booking";
import { normalizeWebUrl } from "@/lib/url";

export interface DeliverOrderState {
  error?: string;
}

// 平台不裁定"交付质量",也不验证这个链接是否属实 —— 但要求卖家先做这个自证式的
// "我已交付"动作,才能开始买家确认窗口的计时,避免卖家什么都不做、光靠超时就能拿到钱
// (见 README"平台责任边界"一节)。
export async function markDeliveredAction(
  _prevState: DeliverOrderState,
  formData: FormData
): Promise<DeliverOrderState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const orderId = String(formData.get("order_id") ?? "");
  const proofUrlRaw = String(formData.get("proof_url") ?? "").trim();

  if (!proofUrlRaw) {
    return { error: "Please provide a link the buyer can use to verify delivery" };
  }
  // 卖家常只填 "youtube.com/shorts/…",自动补 https://;只接受 http/https 链接。
  const normalizedProof = normalizeWebUrl(proofUrlRaw);
  if ("error" in normalizedProof) {
    return { error: normalizedProof.error };
  }
  const proofUrl = normalizedProof.value;

  const [{ data: order }, { data: profile }] = await Promise.all([
    supabase
      .from("listing_orders")
      .select("seller_id,status,start_date")
      .eq("id", orderId)
      .single(),
    supabase.from("profiles").select("stripe_onboarded").eq("id", user.id).single(),
  ]);

  if (!order || order.seller_id !== user.id || order.status !== "paid_in_escrow") {
    return { error: "This order can't be marked as delivered right now" };
  }

  // 日历预订的订单:开始日期当天(英国时间)起才能提交"已上线"链接(README"日历按天
  // 预订",2026-09-24 确认的实现细节)。
  if (order.start_date && order.start_date > bookingToday()) {
    return {
      error: `You can submit the live link from ${formatBookingDate(order.start_date)} (UK time), when the booking starts.`,
    };
  }

  // 发布免审核 + KYC 后置(2026-09-19 加,见 README 同名一节):卖家发布/接单
  // 都不要求先做 Stripe KYC,但标记交付会开始买家确认窗口的倒计时,窗口一到
  // 就要真的发起 Stripe Transfer 给卖家——这时候卖家必须已经连好 Stripe,不然
  // 到时候 releaseOrderPayout 会失败(见 dashboard/purchases 的
  // payout_failed 错误提示)。在这里拦一道,逼卖家在真正有买家付了钱等交付
  // 的这一刻去完成 KYC,而不是等放款失败了才发现。
  if (!profile?.stripe_onboarded) {
    return {
      error:
        "Connect Stripe before marking this delivered — you need it set up to get paid when this order releases.",
    };
  }

  // 订单写入一律走 service_role(authenticated 对 listing_orders 没有 update 权限,
  // 见 README"费用、取消与退款规则"第 8 条);上面已经校验过是这单的卖家、状态对。
  const { data: updatedRows, error } = await createServiceClient()
    .from("listing_orders")
    .update({
      status: "delivered",
      proof_url: proofUrl,
      delivered_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "paid_in_escrow")
    .select("id");

  if (error || !updatedRows || updatedRows.length === 0) {
    if (error) console.error("Failed to mark order delivered:", error.message);
    return { error: "Couldn't save, please try again" };
  }

  await sendOrderDeliveredEmail(orderId);

  redirect("/dashboard/sales");
}
