"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const proofUrl = String(formData.get("proof_url") ?? "").trim();

  if (!proofUrl) {
    return { error: "Please provide a link the buyer can use to verify delivery" };
  }

  const [{ data: order }, { data: profile }] = await Promise.all([
    supabase.from("listing_orders").select("seller_id,status").eq("id", orderId).single(),
    supabase.from("profiles").select("stripe_onboarded").eq("id", user.id).single(),
  ]);

  if (!order || order.seller_id !== user.id || order.status !== "paid_in_escrow") {
    return { error: "This order can't be marked as delivered right now" };
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

  const { data: updatedRows, error } = await supabase
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
    return { error: error?.message ?? "Couldn't save, please try again" };
  }

  redirect("/dashboard/sales");
}
