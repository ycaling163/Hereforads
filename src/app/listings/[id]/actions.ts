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
import { releaseBuyerHoldsOnListing } from "@/lib/orders/releaseHold";
import { checkUpload } from "@/lib/uploads";
import { deleteUnusedMedia } from "@/lib/mediaCleanup";
import { UUID_PATTERN } from "@/lib/messages";
import { MEDIA_BUCKET } from "@/config/site";
import {
  LIMITS,
  checkRateLimits,
  clientIp,
  hashIdentifier,
} from "@/lib/security/rateLimit";
import {
  TURNSTILE_FAILED_MESSAGE,
  turnstileToken,
  verifyTurnstile,
} from "@/lib/security/turnstile";
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

// 私信图片跟广告媒体放在同一个 bucket(名字在 src/config/site.ts)。
const MESSAGE_MEDIA_BUCKET = MEDIA_BUCKET;

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

  // Guest 结账(不强制先注册/登录):买家只填邮箱,后台静默建号(不发邮件,之后
  // 靠免密码登录链接进来),见 src/lib/supabase/guest-checkout.ts 和 README"Guest 结账"、
  // "Guest 登录与设置密码"两节。
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

    // guest 下单会静默建账号、日历订单还会占档期:按 IP/邮箱限流 + Turnstile(我们自己
    // 校验),见 README"安全核查 · 第 2 批"。登录用户正常购买不加。
    const ip = await clientIp();
    const limit = await checkRateLimits(LIMITS.guestCheckout(ip, guestEmail));
    if (!limit.allowed) {
      return { error: limit.message };
    }
    if (!(await verifyTurnstile(turnstileToken(formData), ip))) {
      return { error: TURNSTILE_FAILED_MESSAGE };
    }

    const resolved = await resolveGuestBuyerId(guestEmail);
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
  // 被封卖家的订单会被暂停放款(见 src/lib/orders/holds.ts),不再接新单。
  const { data: sellerState } = await createServiceClient()
    .from("profiles")
    .select("is_banned")
    .eq("id", listing.seller_id)
    .maybeSingle();
  if (sellerState?.is_banned) {
    return { error: "This listing isn't available for purchase right now" };
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
    // 同一买家或同一 IP 同时最多 2 个未付款的占用(数据库函数里检查,
    // hold_ip_hash 是 IP 的加盐哈希,没配盐或拿不到 IP 时只按买家算)。
    const ip = await clientIp();
    const ipHash = ip ? hashIdentifier("ip", ip) : null;
    // 买家改主意换日期/时长:先释放他在这条广告上之前没付款的占用(付款链接作废),
    // 不会被自己刚才的占用挡住(见 src/lib/orders/releaseHold.ts)。
    await releaseBuyerHoldsOnListing(listing.id, buyerId, user?.id ?? null, ipHash);
    const { data: newOrderId, error: bookingError } = await createServiceClient().rpc(
      "create_booking_order",
      {
        p_order: {
          ...orderFields,
          start_date: startDate,
          end_date: endDate,
          booking_units: quantity,
          hold_expires_at: new Date(Date.now() + PENDING_HOLD_MINUTES * 60_000).toISOString(),
          hold_ip_hash: ipHash,
        },
      }
    );
    if (bookingError?.message.includes("too_many_pending_holds")) {
      return {
        error:
          "You already have 2 unfinished checkouts for date bookings. Complete one, or try again in about 30 minutes.",
      };
    }
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
    // 只收卡(Apple Pay / Google Pay 属于卡,照常显示)。Bacs、SEPA 这类几天后才到账的
    // 付款方式付款成功时 payment_status 还是 unpaid,webhook 会当成金额不符、订单卡住,
    // 等专门支持了再开(安全核查第 1 批,产品负责人 2026-09-24 确认)。
    payment_method_types: ["card"],
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
      : // 不把邮箱放进 URL(会进浏览器历史和日志),页面按 session_id 去 Stripe 查,只显示
        // 打码后的邮箱(安全核查第 3 批第 21 条)。{CHECKOUT_SESSION_ID} 由 Stripe 替换。
        `${SITE_URL}/checkout/guest-success?session_id={CHECKOUT_SESSION_ID}`,
    // 日历订单:点 Stripe 页面上的"返回"先经过 /api/checkout/cancelled,立刻释放这段日期
    // 并把选过的日期带回广告页,买家可以直接改。
    cancel_url: booking
      ? `${SITE_URL}/api/checkout/cancelled?order=${order.id}`
      : `${SITE_URL}/listings/${listing.id}?checkout=cancelled`,
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

  // 记下付款链接,买家改日期时要先让这个链接作废才能释放日期(releaseHold.ts)。
  if (booking) {
    const { error: sessionSaveError } = await createServiceClient()
      .from("listing_orders")
      .update({ checkout_session_id: session.id })
      .eq("id", order.id);
    if (sessionSaveError) {
      console.error("Failed to save checkout session id:", sessionSaveError.message);
    }
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

  if (!UUID_PATTERN.test(listingId)) {
    return { error: "Listing not found" };
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
    const checked = await checkUpload(imageFile, "image");
    if (!checked.ok) {
      return { error: checked.error };
    }
    const path = `${user.id}/messages/${randomUUID()}.${checked.ext}`;
    const { error: uploadError } = await supabase.storage
      .from(MESSAGE_MEDIA_BUCKET)
      .upload(path, imageFile, { contentType: checked.contentType });

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
    // 消息没发出去,刚传的图片没人用,删掉。
    await deleteUnusedMedia(user.id, [imageUrl]);
    return { error: error.message };
  }

  return { success: true };
}
