"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";
import { EMAIL_PATTERN, resolveGuestBuyerId } from "@/lib/supabase/guest-checkout";
import type { Listing } from "@/lib/supabase/types";
import { fromMinorUnits, isSupportedCurrency, toMinorUnits } from "@/lib/fees";
import { formatOrderNumber } from "@/lib/orders/orderNumber";
import {
  CHECKOUT_EXPIRES_MINUTES,
  MAX_ADVANCE_DAYS,
  PENDING_HOLD_MINUTES,
  addDays,
  bookingEndDate,
  bookingToday,
  describeUnits,
  formatBookingRange,
  isBookingUnit,
  isValidDate,
  maxBookingUnits,
  minBookingUnits,
} from "@/lib/booking";

// 私信图片复用已有的 ad-space-photos bucket,不用新建。
const MESSAGE_MEDIA_BUCKET = "ad-space-photos";

export interface BuyListingState {
  error?: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function buyListingAction(
  prevState: BuyListingState,
  formData: FormData
): Promise<BuyListingState> {
  // 任何未捕获的异常(Stripe/Supabase 报错、环境变量缺失)都会让整页变成
  // "page couldn't load";这里兜住,记下具体原因,给买家一个能重试的提示。
  // redirect() 靠抛特殊异常实现,只在 startCheckout 成功返回 URL 之后才调用。
  let checkoutUrl: string;
  try {
    const result = await startCheckout(prevState, formData);
    if ("error" in result) return result;
    checkoutUrl = result.url;
  } catch (err) {
    console.error("buyListingAction failed:", err);
    return { error: "Couldn't start checkout, please try again" };
  }
  redirect(checkoutUrl);
}

async function startCheckout(
  _prevState: BuyListingState,
  formData: FormData
): Promise<{ error: string } | { url: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const listingId = String(formData.get("listing_id") ?? "");

  // 结账前的两个必勾项(见 BuyListingButton),前端 required 之外服务端再挡一次。
  if (formData.get("accept_terms") !== "on" || formData.get("immediate_start") !== "on") {
    return { error: "Please tick both boxes to continue" };
  }
  const consentedAt = new Date().toISOString();

  // Guest 结账(不强制先注册/登录):买家只填邮箱,后台静默建号 + 发登录魔法
  // 链接,见 src/lib/supabase/guest-checkout.ts 和 README"Guest 结账"一节。
  // 登录用户用当前 session 的 client 读 listing;guest 没有 session,改用
  // service_role client 读。建 order 两边都走 service_role(见下面),所以这里
  // 自己校验一遍权限(listing 存不存在、状态是不是 active、买家是不是卖家本人)。
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
      return { error: resolved.error ?? "Couldn't start checkout, please try again" };
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
  if (!isSupportedCurrency(listing.price_currency)) {
    return { error: "This listing's currency isn't supported for checkout yet" };
  }

  // 日历按天预订(README"日历按天预订"):买家选开始日期 + 天数/周数/月数,
  // 价格 = 单价 × 数量。开始日期、数量都在服务端按 listing 的设置重新校验。
  const booking = listing.booking_enabled && isBookingUnit(listing.pricing_unit)
    ? listing.pricing_unit
    : null;
  let quantity = 1;
  let startDate: string | null = null;
  let endDate: string | null = null;
  if (booking) {
    startDate = String(formData.get("start_date") ?? "");
    quantity = Number(formData.get("booking_units") ?? "");
    const today = bookingToday();
    if (!isValidDate(startDate) || startDate < today) {
      return { error: "Please choose a start date" };
    }
    if (startDate > addDays(today, MAX_ADVANCE_DAYS)) {
      return { error: `Bookings can start at most ${MAX_ADVANCE_DAYS} days ahead` };
    }
    const minUnits = minBookingUnits(booking, listing.min_booking_days);
    const maxUnits = maxBookingUnits(booking);
    if (!Number.isInteger(quantity) || quantity < minUnits || quantity > maxUnits) {
      return {
        error: `Please book between ${describeUnits(booking, minUnits)} and ${describeUnits(booking, maxUnits)}`,
      };
    }
    endDate = bookingEndDate(startDate, booking, quantity);
  }

  // 按最小货币单位整数算总价,避免 0.1 × 3 这类浮点误差;webhook 核对实付金额时用的
  // 也是 toMinorUnits(order.amount),两边一致。
  const unitAmountMinor = toMinorUnits(listing.price_amount, listing.price_currency);
  const amount = fromMinorUnits(unitAmountMinor * quantity, listing.price_currency);

  // 订单一律用 service_role 写(2026-09-23 起 authenticated 角色对 listing_orders
  // 没有 insert/update 权限,见 README"费用、取消与退款规则"第 8 条的 SQL):
  // 金额、币种、状态都只从服务端查到的 listing 取,不信任任何客户端输入。
  const orderFields = {
    listing_id: listing.id,
    buyer_id: buyerId,
    seller_id: listing.seller_id,
    amount,
    currency: listing.price_currency,
    status: "pending_payment" as const,
    // 下单时就存买家邮箱(guest 和登录买家都有),管理后台/纠纷时能联系到人。
    buyer_email: buyerEmail ?? null,
    terms_accepted_at: consentedAt,
    immediate_start_consent_at: consentedAt,
  };

  let orderId: string;
  if (booking && startDate && endDate) {
    // 日历订单走数据库函数:锁住这条 listing、检查日期没有跟已付款或还在付款占用期内
    // 的订单重叠,再插入——两个买家同时抢同一段日期,只有一个能下单成功。
    const { data: newOrderId, error: bookingError } = await createServiceClient().rpc(
      "create_booking_order",
      {
        p_order: {
          ...orderFields,
          start_date: startDate,
          end_date: endDate,
          booking_units: quantity,
          hold_expires_at: new Date(Date.now() + PENDING_HOLD_MINUTES * 60_000).toISOString(),
        },
      }
    );
    if (bookingError) {
      console.error("Failed to create booking order:", bookingError.message);
      return { error: "Couldn't start checkout, please try again" };
    }
    if (!newOrderId) {
      return { error: "Some of those dates were just booked — please choose other dates" };
    }
    orderId = newOrderId as string;
  } else {
    const { data: order, error: orderError } = await createServiceClient()
      .from("listing_orders")
      .insert(orderFields)
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("Failed to create listing order:", orderError?.message);
      return { error: "Couldn't start checkout, please try again" };
    }
    orderId = order.id;
  }
  // 订单号(HFA-000118)由数据库序列在插入时生成,读回来写进 Stripe 的描述和 metadata,
  // 在 Stripe 后台能直接按订单号搜。
  const { data: numbered } = await createServiceClient()
    .from("listing_orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();
  const orderNumber = formatOrderNumber(numbered?.order_number);
  const order = { id: orderId };

  // Charges & Transfers 模式:钱先收进平台自己的账户,不是 destination charge,
  // 所以这里不带 transfer_data/application_fee_amount —— 真正转给卖家的 Transfer
  // 要等卖家标记交付、买家确认收货(或超时自动确认)才发起,见 dashboard/sales 的
  // 交付 action 和 dashboard/purchases 的 release action。
  // 在 Stripe 后台一眼看出这笔钱属于哪个卖家/哪个订单:付款的 Description 写上
  // 卖家名和广告标题,metadata 带上 order/seller/listing id,Stripe 后台搜索框可以用
  // metadata 搜(比如 metadata['seller_id']:"...")。见 README"在 Stripe 里区分卖家"。
  const { data: sellerProfile } = await createServiceClient()
    .from("profiles")
    .select("display_name,stripe_connect_account_id")
    .eq("id", listing.seller_id)
    .maybeSingle();
  const sellerName = sellerProfile?.display_name ?? "Unnamed seller";
  const stripeMetadata = {
    order_id: order.id,
    order_number: orderNumber,
    listing_id: listing.id,
    listing_title: listing.title.slice(0, 450),
    seller_id: listing.seller_id,
    seller_name: sellerName.slice(0, 450),
    seller_stripe_account: sellerProfile?.stripe_connect_account_id ?? "",
    buyer_email: buyerEmail ?? "",
    booking_start: startDate ?? "",
    booking_end: endDate ?? "",
  };
  const paymentDescription =
    `${orderNumber ? `${orderNumber} · ` : ""}Seller: ${sellerName} · ${listing.title} · order ${order.id.slice(0, 8)}`.slice(0, 1000);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: buyerEmail,
    line_items: [
      {
        price_data: {
          currency: listing.price_currency.toLowerCase(),
          product_data: {
            name: listing.title,
            ...(booking && startDate && endDate
              ? {
                  description: `${formatBookingRange(startDate, endDate)} (UK time) · ${describeUnits(booking, quantity)}`,
                }
              : {}),
          },
          unit_amount: unitAmountMinor,
        },
        quantity,
      },
    ],
    // 日历订单:付款链接的有效期比日期占用期短几分钟,链接失效前日期一直留给这个买家,
    // 失效后没付款的订单不再占用日期。
    ...(booking
      ? { expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_MINUTES * 60 }
      : {}),
    metadata: stripeMetadata,
    payment_intent_data: {
      description: paymentDescription,
      metadata: stripeMetadata,
      transfer_group: order.id,
    },
    success_url: user
      ? `${SITE_URL}/dashboard/purchases?checkout=success`
      : `${SITE_URL}/checkout/guest-success?email=${encodeURIComponent(buyerEmail ?? "")}`,
    cancel_url: `${SITE_URL}/listings/${listing.id}?checkout=cancelled`,
    // Guest 没走注册表单,邮箱之外没有任何联系方式留底——让 Stripe Checkout 自己
    // 的付款页顺手收一下姓名/地址/电话(买家反正要填卡号,多这几个字段不算额外
    // 的一步),webhook 收到 checkout.session.completed 后把这些写进
    // listing_orders(见 README"Guest 结账"一节)。登录买家不加这两项,免得给
    // 老用户的一键购买添麻烦。
    ...(user
      ? {}
      : {
          billing_address_collection: "required" as const,
          phone_number_collection: { enabled: true },
        }),
  });

  if (!session.url) {
    return { error: "Couldn't start checkout, please try again" };
  }

  return { url: session.url };
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
