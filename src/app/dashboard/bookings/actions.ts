"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, getStripe } from "@/lib/stripe/server";
import type { AdSpace, Order, SellerProfile } from "@/lib/supabase/types";

// 买家在"我的预订"页,针对卖家已确认(status = confirmed)的订单发起付款。
// 用 Stripe Connect 的 destination charge:买家在 Stripe 托管的 Checkout 页付款,
// 钱直接转进卖家连接账户,平台这边不经手资金。
export async function createCheckoutSessionAction(orderId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: orderRow } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  const order = orderRow as Order | null;

  if (!order || order.buyer_id !== user.id) {
    redirect("/dashboard/bookings?error=not_found");
  }
  if (order.status !== "confirmed") {
    redirect("/dashboard/bookings?error=not_payable");
  }

  const [{ data: adSpaceRow }, { data: sellerProfileRow }] = await Promise.all([
    supabase.from("ad_spaces").select("*").eq("id", order.ad_space_id).single(),
    supabase
      .from("seller_profiles")
      .select("*")
      .eq("user_id", order.seller_id)
      .maybeSingle(),
  ]);

  const adSpace = adSpaceRow as AdSpace | null;
  const sellerProfile = sellerProfileRow as SellerProfile | null;

  if (!sellerProfile?.stripe_account_id || !sellerProfile.stripe_charges_enabled) {
    redirect("/dashboard/bookings?error=seller_not_ready");
  }

  const stripe = getStripe();
  const siteUrl = getSiteUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: order.currency.toLowerCase(),
          unit_amount: Math.round(order.amount * 100),
          product_data: {
            name: adSpace?.title ?? "广告位预订",
            description: `${order.start_date} 至 ${order.end_date}`,
          },
        },
      },
    ],
    payment_intent_data: {
      transfer_data: {
        destination: sellerProfile.stripe_account_id,
      },
      metadata: { order_id: order.id },
    },
    success_url: `${siteUrl}/dashboard/bookings?paid=1`,
    cancel_url: `${siteUrl}/dashboard/bookings?cancelled=1`,
  });

  if (!session.url) {
    redirect("/dashboard/bookings?error=checkout_failed");
  }

  await supabase
    .from("orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", order.id)
    .eq("buyer_id", user.id);

  redirect(session.url);
}
