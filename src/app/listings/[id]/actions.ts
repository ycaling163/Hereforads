"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import type { Listing } from "@/lib/supabase/types";

export interface BuyListingState {
  error?: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function buyListingAction(
  _prevState: BuyListingState,
  formData: FormData
): Promise<BuyListingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const listingId = String(formData.get("listing_id") ?? "");

  const { data: listingRow, error: listingError } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .single();

  if (listingError || !listingRow) {
    return { error: "Listing not found" };
  }
  const listing = listingRow as Listing;

  if (listing.status !== "active") {
    return { error: "This listing isn't available for purchase right now" };
  }
  if (listing.seller_id === user.id) {
    return { error: "You can't buy your own listing" };
  }

  const { data: order, error: orderError } = await supabase
    .from("listing_orders")
    .insert({
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      amount: listing.price_amount,
      currency: listing.price_currency,
      status: "pending_payment",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { error: orderError?.message ?? "Couldn't start checkout, please try again" };
  }

  // Charges & Transfers 模式:钱先收进平台自己的账户,不是 destination charge,
  // 所以这里不带 transfer_data/application_fee_amount —— 真正转给卖家的 Transfer
  // 要等买家确认收货(或超时自动确认)才发起,见 dashboard/purchases 的 confirm action。
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: listing.price_currency.toLowerCase(),
          product_data: { name: listing.title },
          unit_amount: Math.round(listing.price_amount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { order_id: order.id },
    success_url: `${SITE_URL}/dashboard/purchases?checkout=success`,
    cancel_url: `${SITE_URL}/listings/${listing.id}?checkout=cancelled`,
  });

  if (!session.url) {
    return { error: "Couldn't start checkout, please try again" };
  }

  redirect(session.url);
}

export interface SendMessageState {
  error?: string;
  success?: boolean;
}

export async function sendListingMessageAction(
  _prevState: SendMessageState,
  formData: FormData
): Promise<SendMessageState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const listingId = String(formData.get("listing_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    return { error: "Message can't be empty" };
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .single();

  if (listingError || !listing) {
    return { error: "Listing not found" };
  }
  if (listing.seller_id === user.id) {
    return { error: "You can't message yourself" };
  }

  const { error } = await supabase.from("listing_messages").insert({
    listing_id: listingId,
    sender_id: user.id,
    receiver_id: listing.seller_id,
    body,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
