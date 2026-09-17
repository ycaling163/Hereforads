import type Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe 的 webhook 请求没有 Supabase 登录态(不是浏览器发起的),
// 所以这里必须用 service_role client 绕过 RLS 来改订单状态;
// 安全性靠 Stripe 签名校验(下面的 constructEvent)保证请求确实来自 Stripe。
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "webhook not configured" },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      if (orderId) {
        await supabase
          .from("orders")
          .update({
            status: "paid",
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : (session.payment_intent?.id ?? null),
          })
          // 只从 confirmed 推进到 paid,避免重放的 webhook 事件把已经在
          // in_progress/completed 之类后续状态的订单又拉回去。
          .eq("id", orderId)
          .eq("status", "confirmed");
      }
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await supabase
        .from("seller_profiles")
        .update({
          stripe_charges_enabled: !!account.charges_enabled,
          stripe_payouts_enabled: !!account.payouts_enabled,
        })
        .eq("stripe_account_id", account.id);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
