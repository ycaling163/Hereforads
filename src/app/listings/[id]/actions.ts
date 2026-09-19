"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";
import { EMAIL_PATTERN, resolveGuestBuyerId } from "@/lib/supabase/guest-checkout";
import type { Listing } from "@/lib/supabase/types";

// 私信图片复用已有的 ad-space-photos bucket,不用新建。
const MESSAGE_MEDIA_BUCKET = "ad-space-photos";

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

  const listingId = String(formData.get("listing_id") ?? "");

  // Guest 结账(不强制先注册/登录):买家只填邮箱,后台静默建号 + 发登录魔法
  // 链接,见 src/lib/supabase/guest-checkout.ts 和 README"Guest 结账"一节。
  // 登录用户走原来的路径(用当前 session 的 client,靠 RLS 保证只能建自己是
  // buyer_id 的订单);guest 没有 session,下面统一改用 service_role client
  // 读 listing / 建 order,自己校验一遍权限(listing 存不存在、状态是不是
  // active、买家是不是卖家本人)。
  let buyerId: string;
  let buyerEmail: string | undefined;
  const db = user ? supabase : createServiceClient();

  if (user) {
    buyerId = user.id;
    buyerEmail = user.email;
  } else {
    const guestEmail = String(formData.get("guest_email") ?? "").trim().toLowerCase();
    if (!guestEmail || !EMAIL_PATTERN.test(guestEmail)) {
      return { error: "Please enter a valid email address" };
    }

    const resolved = await resolveGuestBuyerId(supabase, guestEmail);
    if (!resolved.buyerId) {
      return { error: resolved.error };
    }
    buyerId = resolved.buyerId;
    buyerEmail = guestEmail;
  }

  const { data: listingRow, error: listingError } = await db
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
  if (listing.seller_id === buyerId) {
    return { error: "You can't buy your own listing" };
  }

  const { data: order, error: orderError } = await db
    .from("listing_orders")
    .insert({
      listing_id: listing.id,
      buyer_id: buyerId,
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
  // 要等卖家标记交付、买家确认收货(或超时自动确认)才发起,见 dashboard/sales 的
  // 交付 action 和 dashboard/purchases 的 release action。
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: buyerEmail,
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
    success_url: user
      ? `${SITE_URL}/dashboard/purchases?checkout=success`
      : `${SITE_URL}/checkout/guest-success?email=${encodeURIComponent(buyerEmail ?? "")}`,
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
  const imageFile = formData.get("image");
  const hasImage = imageFile instanceof File && imageFile.size > 0;

  if (!body && !hasImage) {
    return { error: "Write a message or attach a photo" };
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

  let imageUrl: string | null = null;
  if (hasImage && imageFile instanceof File) {
    const ext = imageFile.name.split(".").pop() || "jpg";
    const path = `${user.id}/messages/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(MESSAGE_MEDIA_BUCKET)
      .upload(path, imageFile, { contentType: imageFile.type || undefined });

    if (uploadError) {
      return { error: `Photo upload failed: ${uploadError.message}` };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(MESSAGE_MEDIA_BUCKET).getPublicUrl(path);
    imageUrl = publicUrl;
  }

  const { error } = await supabase.from("listing_messages").insert({
    listing_id: listingId,
    sender_id: user.id,
    receiver_id: listing.seller_id,
    body,
    image_url: imageUrl,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
