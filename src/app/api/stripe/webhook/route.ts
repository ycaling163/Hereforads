import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PLATFORM_COMMISSION_RATE } from "@/lib/supabase/enums";

// 用 service_role key 写库,绕过 RLS —— webhook 请求没有登录用户的 session/cookie,
// 走不了 src/lib/supabase/server.ts 那条路。
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
      const onboarded = Boolean(
        account.charges_enabled && account.details_submitted
      );
      const { error } = await supabase
        .from("profiles")
        .update({ stripe_onboarded: onboarded })
        .eq("stripe_connect_account_id", account.id);

      if (error) {
        console.error("Failed to update stripe_onboarded:", error.message);
      }
      break;
    }

    // 买家在 Stripe Checkout 完成付款。这里只是把钱收进平台自己的账户
    // (Charges & Transfers 模式,不是 destination charge),订单状态推进到
    // paid_in_escrow;真正转给卖家的 Transfer 要等买家确认收货(见
    // dashboard 里确认收货的 action)才发起。
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

      if (!orderId) {
        console.error("checkout.session.completed missing order_id metadata");
        break;
      }

      const { data: order, error: orderFetchError } = await supabase
        .from("listing_orders")
        .select("amount,status")
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

      const platformFeeAmount = Math.round(order.amount * PLATFORM_COMMISSION_RATE * 100) / 100;

      const { error: updateError } = await supabase
        .from("listing_orders")
        .update({ status: "paid_in_escrow", paid_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("status", "pending_payment");

      if (updateError) {
        console.error("Failed to mark order paid_in_escrow:", updateError.message);
        break;
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
