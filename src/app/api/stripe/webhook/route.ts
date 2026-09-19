import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PLATFORM_COMMISSION_RATE } from "@/lib/supabase/enums";

// 用 service_role key 写库,绕过 RLS —— webhook 请求没有登录用户的 session/cookie,
// 走不了 src/lib/supabase/server.ts 那条路。
//
// 这一个 endpoint 要同时服务两套并存的产品线,因为 Stripe 后台的 webhook 端点
// 只能配一个:老的 ad_spaces 日历预订(destination charge,直接打到卖家账户)
// 和新的 listings MVP v2(Charges & Transfers 托管交易)。account.updated 两边
// 都处理;checkout.session.completed 先按 metadata.order_id 试老的 orders 表,
// 没匹配到(0 行受影响)再按 MVP v2 的 listing_orders 处理。
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;

      // 老流程:seller_profiles.stripe_account_id
      const { error: legacyError } = await supabase
        .from("seller_profiles")
        .update({
          stripe_charges_enabled: !!account.charges_enabled,
          stripe_payouts_enabled: !!account.payouts_enabled,
        })
        .eq("stripe_account_id", account.id);

      if (legacyError) {
        console.error(
          "Failed to update seller_profiles stripe flags:",
          legacyError.message
        );
      }

      // MVP v2:profiles.stripe_connect_account_id
      const onboarded = Boolean(
        account.charges_enabled && account.details_submitted
      );
      const { error: v2Error } = await supabase
        .from("profiles")
        .update({ stripe_onboarded: onboarded })
        .eq("stripe_connect_account_id", account.id);

      if (v2Error) {
        console.error("Failed to update stripe_onboarded:", v2Error.message);
      }
      break;
    }

    // 买家在 Stripe Checkout 完成付款。老流程(destination charge)这里就是
    // 终态,直接标 paid;MVP v2(Charges & Transfers)只是把钱收进平台账户,
    // 订单进 paid_in_escrow,真正转给卖家的 Transfer 要等买家确认收货。
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

      if (!orderId) {
        console.error("checkout.session.completed missing order_id metadata");
        break;
      }

      const { data: legacyUpdatedRows, error: legacyUpdateError } = await supabase
        .from("orders")
        .update({
          status: "paid",
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
        })
        // 只从 confirmed 推进到 paid,避免重放的 webhook 事件把已经在
        // in_progress/completed 之类后续状态的订单又拉回去。
        .eq("id", orderId)
        .eq("status", "confirmed")
        .select("id");

      if (legacyUpdateError) {
        console.error(
          "Failed to mark legacy order paid:",
          legacyUpdateError.message
        );
      }

      if (legacyUpdatedRows && legacyUpdatedRows.length > 0) {
        // 老流程的订单,处理完了。
        break;
      }

      // 不是老流程的订单,按 MVP v2 的 listing_orders 处理。
      const { data: order, error: orderFetchError } = await supabase
        .from("listing_orders")
        .select("amount,status,buyer_id")
        .eq("id", orderId)
        .single();

      if (orderFetchError || !order) {
        console.error("Order not found for checkout session:", orderId);
        break;
      }
      // 防止 Stripe 重试同一个事件时重复推进状态/插入重复的 payments 行。
      if (order.status !== "pending_payment") {
        break;
      }

      const platformFeeAmount =
        Math.round(order.amount * PLATFORM_COMMISSION_RATE * 100) / 100;

      // Guest 结账(见 README"Guest 结账"一节)在 Checkout 页顺手收了姓名/地址/
      // 电话(billing_address_collection/phone_number_collection,登录买家没开
      // 这两项,customer_details 里对应字段是 null),这是 guest 唯一留下的联系
      // 方式存底,存进订单本身而不是只存 profiles——同一个账号以后可能用不同
      // 地址/电话下单。
      const customerDetails = session.customer_details;
      const buyerAddress = customerDetails?.address
        ? [
            customerDetails.address.line1,
            customerDetails.address.line2,
            customerDetails.address.city,
            customerDetails.address.state,
            customerDetails.address.postal_code,
            customerDetails.address.country,
          ]
            .filter(Boolean)
            .join(", ")
        : null;

      const { error: updateError } = await supabase
        .from("listing_orders")
        .update({
          status: "paid_in_escrow",
          paid_at: new Date().toISOString(),
          buyer_name: customerDetails?.name ?? null,
          buyer_phone: customerDetails?.phone ?? null,
          buyer_address: buyerAddress,
        })
        .eq("id", orderId)
        .eq("status", "pending_payment");

      if (updateError) {
        console.error("Failed to mark order paid_in_escrow:", updateError.message);
        break;
      }

      // 卖家在 Sales/Messages 页看到的买家名字来自 profiles.display_name——guest
      // 静默建号时没填过这一列(见 src/lib/supabase/guest-checkout.ts),这里用
      // Checkout 页收集到的姓名补一下,只在还没有值的时候补(不覆盖真实用户自己
      // 在 /dashboard/profile 设置过的名字)。
      if (customerDetails?.name) {
        const { error: nameBackfillError } = await supabase
          .from("profiles")
          .update({ display_name: customerDetails.name })
          .eq("id", order.buyer_id)
          .is("display_name", null);

        if (nameBackfillError) {
          console.error(
            "Failed to backfill guest display_name:",
            nameBackfillError.message
          );
        }
      }

      const { error: paymentError } = await supabase.from("payments").insert({
        order_id: orderId,
        stripe_payment_intent_id: paymentIntentId,
        platform_fee_amount: platformFeeAmount,
        status: "paid_in_escrow",
      });

      if (paymentError) {
        console.error("Failed to insert payment row:", paymentError.message);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
