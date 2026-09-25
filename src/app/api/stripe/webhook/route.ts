import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createServiceClient } from "@/lib/supabase/service";
import { calculateFees, formatMoney, fromMinorUnits, toMinorUnits } from "@/lib/fees";
import { sendOrderPaidEmails } from "@/lib/email/orders";
import { getUserEmail, sendAdminAlert, sendEmail } from "@/lib/email/send";
import { recordSettlement } from "@/lib/stripe/settlement";
import { formatOrderNumber } from "@/lib/orders/orderNumber";
import {
  appendHoldNote,
  findOrderIdByPaymentIntent,
  placePayoutHold,
} from "@/lib/orders/holds";

// 用 service_role key 写库,绕过 RLS —— webhook 请求没有登录用户的 session/cookie,
// 走不了 src/lib/supabase/server.ts 那条路。安全性靠 constructEvent 校验 Stripe 签名。
//
// 订阅的事件(Stripe 后台 webhook endpoint 要勾上,见 README"安全核查 → 第 1 批"):
// - checkout.session.completed:付款成功,订单进托管
// - account.updated(经典 v1 事件):卖家 Connect 账户状态
// - charge.dispute.created / charge.dispute.closed:拒付 → 暂停放款、通知管理员
// - charge.refunded:Stripe 后台手动退款 → 同步订单,保证这笔钱不会再转给卖家
// - checkout.session.expired:付款链接过期 → 立刻释放日历订单占用的日期(安全核查第 3 批)
//
// 重试语义(安全核查第 1 批):数据库读写失败时抛异常 → 返回 500,让 Stripe 自动重试;
// 每个分支都是幂等的(条件更新 + payments 唯一索引),重复投递、并发投递都安全。以前
// 写库失败也返回 200,Stripe 不再重试,买家付了钱订单却一直停在待支付。
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

  try {
    switch (event.type) {
      case "account.updated":
        await handleAccountUpdated(event.data.object);
        break;
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object);
        break;
      case "charge.dispute.closed":
        await handleDisputeClosed(event.data.object);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;
      case "checkout.session.expired":
        await handleCheckoutExpired(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Stripe webhook ${event.type} (${event.id}) failed, Stripe will retry:`, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleAccountUpdated(account: Stripe.Account) {
  const supabase = createServiceClient();

  // 老流程:seller_profiles.stripe_account_id(没有代码再写这一列,留着不影响)
  const { error: legacyError } = await supabase
    .from("seller_profiles")
    .update({
      stripe_charges_enabled: !!account.charges_enabled,
      stripe_payouts_enabled: !!account.payouts_enabled,
    })
    .eq("stripe_account_id", account.id);
  if (legacyError) {
    console.error("Failed to update seller_profiles stripe flags:", legacyError.message);
  }

  // MVP v2:profiles.stripe_connect_account_id
  const onboarded = Boolean(account.charges_enabled && account.details_submitted);
  const { error: v2Error } = await supabase
    .from("profiles")
    .update({ stripe_onboarded: onboarded })
    .eq("stripe_connect_account_id", account.id);
  if (v2Error) {
    throw new Error(`Failed to update stripe_onboarded: ${v2Error.message}`);
  }
}

// 买家在 Stripe Checkout 完成付款:钱收进平台账户,订单进 paid_in_escrow,真正转给卖家
// 的 Transfer 要等交付 + 买家确认(或超时)。老 orders 表那段死代码 2026-09-24 删了。
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient();
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  if (!orderId) {
    console.error("checkout.session.completed missing order_id metadata", session.id);
    return;
  }

  const { data: order, error: orderFetchError } = await supabase
    .from("listing_orders")
    .select("amount,currency,status,buyer_id,buyer_email,start_date,cancel_reason,order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (orderFetchError) {
    throw new Error(`Failed to load order ${orderId}: ${orderFetchError.message}`);
  }
  if (!order) {
    console.error("Order not found for checkout session:", orderId, session.id);
    return;
  }
  // 日历订单付款时发现日期已被别人订走、已经取消了,但上次退款没成功:重试退款(幂等)。
  if (order.status === "cancelled" && order.cancel_reason === BOOKING_CONFLICT) {
    // 同一事件重复投递、退款其实已经成功的,不再退、不再发邮件。
    if (paymentIntentId) {
      const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 10 });
      if (refunds.data.some((r) => r.status !== "failed" && r.status !== "canceled")) return;
    }
    await refundBookingConflict(orderId, paymentIntentId, order);
    return;
  }
  // 重复投递:订单已经推进过了。
  if (order.status !== "pending_payment") {
    return;
  }

  // 核对实付金额/币种跟订单一致(README"费用、取消与退款规则"第 8 条)。订单金额只由
  // 服务端从 listing 抄过来,正常不会对不上;对不上说明有人绕过了下单流程,订单不进托管,
  // 在 payments 记一笔 amount_mismatch 留给管理员在 Stripe 后台人工处理。
  const expectedMinor = toMinorUnits(Number(order.amount), order.currency);
  const amountMatches =
    session.payment_status === "paid" &&
    session.currency === order.currency.toLowerCase() &&
    session.amount_total === expectedMinor;

  if (!amountMatches) {
    console.error("Checkout amount mismatch for order", orderId, {
      paymentStatus: session.payment_status,
      paid: session.amount_total,
      paidCurrency: session.currency,
      expected: expectedMinor,
      expectedCurrency: order.currency,
    });
    const { data: existingMismatch, error: mismatchLookupError } = await supabase
      .from("payments")
      .select("id")
      .eq("order_id", orderId)
      .eq("status", "amount_mismatch")
      .limit(1);
    if (mismatchLookupError) {
      throw new Error(`Failed to look up amount mismatch: ${mismatchLookupError.message}`);
    }
    if (!existingMismatch || existingMismatch.length === 0) {
      const { error: mismatchInsertError } = await supabase.from("payments").insert({
        order_id: orderId,
        stripe_payment_intent_id: paymentIntentId,
        status: "amount_mismatch",
      });
      if (mismatchInsertError) {
        throw new Error(`Failed to record amount mismatch: ${mismatchInsertError.message}`);
      }
      await sendAdminAlert("Checkout amount mismatch", [
        `The payment for order ${orderId} doesn't match the order (paid ${session.amount_total} ${session.currency}, status ${session.payment_status}; expected ${expectedMinor} ${order.currency.toLowerCase()}). The order was NOT moved into escrow — please check the payment in Stripe and refund it if needed.`,
      ]);
    }
    return;
  }

  const fees = calculateFees(Number(order.amount), order.currency);

  // 先写 payments(一张订单只有一行托管付款,靠唯一索引 payments_one_escrow_payment_per_order
  // 保证),再推进订单状态:如果推进订单那一步失败,Stripe 重试时这里的重复插入会撞唯一
  // 索引被忽略,订单照样能推进,不会出现"订单进了托管、却没有付款记录、永远放不了款"。
  const { error: paymentError } = await supabase.from("payments").insert({
    order_id: orderId,
    stripe_payment_intent_id: paymentIntentId,
    platform_fee_amount: fromMinorUnits(fees.serviceFeeMinor, fees.currency),
    // 固定费率下,卖家的 Payment processing fee 和到手金额付款时就定了(列名沿用旧的
    // stripe_fee_amount,含义见 types.ts 的 Payment)。
    stripe_fee_amount: fromMinorUnits(fees.processingFeeMinor, fees.currency),
    net_amount: fromMinorUnits(fees.sellerNetMinor, fees.currency),
    status: "paid_in_escrow",
  });
  if (paymentError && paymentError.code !== "23505") {
    throw new Error(`Failed to insert payment row: ${paymentError.message}`);
  }

  // Guest 结账在 Checkout 页收了姓名/地址/电话(见 README"Guest 结账"),存进订单本身。
  // 这几列只有 service_role 能读(安全核查第 1 批的列级权限),卖家读不到。
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

  const { data: advanced, error: updateError } = await supabase
    .from("listing_orders")
    .update({
      status: "paid_in_escrow",
      paid_at: new Date().toISOString(),
      buyer_name: customerDetails?.name ?? null,
      buyer_phone: customerDetails?.phone ?? null,
      buyer_address: buyerAddress,
      // 下单时已经存了;老订单或者没存上的,用 Stripe Checkout 收到的邮箱补上。
      ...(order.buyer_email ? {} : { buyer_email: customerDetails?.email ?? null }),
    })
    .eq("id", orderId)
    .eq("status", "pending_payment")
    .select("id");
  // 日历订单:数据库触发器在推进到 paid_in_escrow 时锁住这条广告、再查一次日期重叠
  // (安全核查第 3 批第 10 条)。付款链接快过期时付款、webhook 又延迟,占用期可能已经过了,
  // 别人订了同一段日期并先付了款——这时这一单不进托管,全额退款并通知买家和管理员。
  if (updateError?.message.includes(BOOKING_CONFLICT)) {
    const { error: cancelError } = await supabase
      .from("listing_orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: BOOKING_CONFLICT,
      })
      .eq("id", orderId)
      .eq("status", "pending_payment");
    if (cancelError) {
      throw new Error(`Failed to cancel conflicting booking: ${cancelError.message}`);
    }
    await refundBookingConflict(orderId, paymentIntentId, order);
    return;
  }
  if (updateError) {
    throw new Error(`Failed to mark order paid_in_escrow: ${updateError.message}`);
  }
  // 并发投递时另一个请求已经推进了这张订单:后面的回填、记账、发邮件都由它做,这里不重复。
  if (!advanced || advanced.length === 0) {
    return;
  }

  // 卖家看到的买家名字来自 profiles.display_name——guest 静默建号时是空的,用 Checkout
  // 收到的姓名补一下,只在还没有值时补(不覆盖用户自己设置的名字)。
  if (customerDetails?.name) {
    const { error: nameBackfillError } = await supabase
      .from("profiles")
      .update({ display_name: customerDetails.name })
      .eq("id", order.buyer_id)
      .is("display_name", null);
    if (nameBackfillError) {
      console.error("Failed to backfill guest display_name:", nameBackfillError.message);
    }
  }

  // 记下平台实际入账和 Stripe 实际手续费,给 /admin/finance 算平台净收入用。
  if (paymentIntentId) {
    await recordSettlement(orderId, paymentIntentId);
  }

  // 订单确认邮件(买家 + 卖家)。上面的条件更新 + 影响行数检查保证每单只会走到这里一次。
  await sendOrderPaidEmails(orderId);
}

const BOOKING_CONFLICT = "booking_conflict";

// 日历订单付款时日期已被别人订走:全额退款(幂等 key,webhook 重试不会退两次),再通知
// 买家和管理员。退款失败抛异常 → 500 → Stripe 重试这个事件,走上面"已取消但要重试退款"的分支。
// 退款成功后 Stripe 会发 charge.refunded,handleChargeRefunded 看到订单已取消,把 payments
// 那一行标成 refunded。
async function refundBookingConflict(
  orderId: string,
  paymentIntentId: string | null,
  order: { buyer_id: string; buyer_email: string | null; order_number: number | null }
) {
  if (!paymentIntentId) {
    await sendAdminAlert("Booking conflict — refund needed", [
      `Order ${orderId} was paid but its dates had already been booked. There's no payment intent on the checkout session, so it could not be refunded automatically — please refund it in Stripe.`,
    ]);
    return;
  }
  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      reason: "duplicate",
      metadata: { order_id: orderId, cancel_reason: BOOKING_CONFLICT },
    },
    { idempotencyKey: `order-${orderId}-booking-conflict-refund` }
  );

  const orderNumber = formatOrderNumber(order.order_number) || orderId.slice(0, 8);
  const buyerEmail = order.buyer_email ?? (await getUserEmail(order.buyer_id));
  await sendEmail(buyerEmail, {
    subject: `Your booking ${orderNumber} couldn't be confirmed — full refund issued`,
    paragraphs: [
      "Sorry — the dates you paid for were booked by someone else just before your payment went through, so we couldn't confirm your booking.",
      "We've refunded the full amount to your card. Refunds usually appear within 5–10 business days. You're welcome to pick other dates on the listing.",
    ],
    details: [["Order", orderNumber]],
    cta: { label: "Browse ad spaces", path: "/listings" },
  });
  await sendAdminAlert(`Booking conflict on order ${orderNumber} — refunded`, [
    `Order ${orderNumber} was paid after its dates had already been booked by another paid order. It was cancelled and fully refunded automatically (refund ${refund.id}). No action needed unless the buyer gets in touch.`,
  ]);
}

// 付款链接过期(买家没付款):立刻释放日历订单占用的日期,不用等 hold_expires_at。
// 需要在 Stripe 后台 webhook endpoint 勾上 checkout.session.expired(见 README 第 3 批)。
async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return;
  const { error } = await createServiceClient()
    .from("listing_orders")
    .update({ hold_expires_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pending_payment")
    .not("start_date", "is", null)
    .gt("hold_expires_at", new Date().toISOString());
  if (error) {
    throw new Error(`Failed to release hold for expired checkout: ${error.message}`);
  }
}

function paymentIntentIdOf(
  value: string | Stripe.PaymentIntent | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function loadOrderForAlert(orderId: string) {
  const { data, error } = await createServiceClient()
    .from("listing_orders")
    .select("id,order_number,status,cancel_reason,payout_hold_note")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load order ${orderId}: ${error.message}`);
  }
  return data as {
    id: string;
    order_number: number | null;
    status: string;
    cancel_reason: string | null;
    payout_hold_note: string | null;
  } | null;
}

function orderLabel(order: { id: string; order_number: number | null }): string {
  return formatOrderNumber(order.order_number) || order.id;
}

function money(amountMinor: number, currency: string): string {
  return formatMoney(amountMinor, currency.toUpperCase());
}

// 拒付(README"费用、取消与退款规则"第 7 条;产品负责人 2026-09-24 确认的处理方式):
// 订单暂停放款、通知管理员。钱已经转给卖家的,也标记 + 告警,由管理员在 Stripe 后台
// 手动撤回转账(MVP 不自动撤回)。
async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const paymentIntentId = paymentIntentIdOf(dispute.payment_intent);
  const orderId = paymentIntentId ? await findOrderIdByPaymentIntent(paymentIntentId) : null;
  const amount = money(dispute.amount, dispute.currency);

  if (!orderId) {
    await sendAdminAlert("Dispute on an unknown payment", [
      `Stripe opened dispute ${dispute.id} (${dispute.reason}, ${amount}) on a payment we can't match to an order. Please check it in Stripe.`,
    ]);
    return;
  }

  const order = await loadOrderForAlert(orderId);
  if (!order) return;
  // 重复投递:这个拒付已经记过了。
  if (order.payout_hold_note?.includes(`Dispute ${dispute.id} opened`)) return;

  await placePayoutHold(
    orderId,
    "dispute",
    `Dispute ${dispute.id} opened: reason ${dispute.reason}, ${amount}.`
  );

  const alreadyPaidOut = order.status === "released" || order.status === "expired_auto_confirmed";
  await sendAdminAlert(`Dispute opened on ${orderLabel(order)}`, [
    `The buyer disputed the payment for order ${orderLabel(order)} (reason: ${dispute.reason}, ${amount}). The order is on hold — no payout will be sent.`,
    alreadyPaidOut
      ? "The seller has ALREADY been paid for this order. If you want the money back from the seller, reverse the transfer in Stripe (Connect → Transfers → this order's transfer → Reverse)."
      : "The money is still with the platform. Respond to the dispute in Stripe; after it closes, decide in /admin/holds whether to release or keep holding the payout.",
  ]);
}

async function handleDisputeClosed(dispute: Stripe.Dispute) {
  const paymentIntentId = paymentIntentIdOf(dispute.payment_intent);
  const orderId = paymentIntentId ? await findOrderIdByPaymentIntent(paymentIntentId) : null;
  if (!orderId) {
    await sendAdminAlert("Dispute closed on an unknown payment", [
      `Stripe dispute ${dispute.id} closed with status "${dispute.status}". We couldn't match it to an order.`,
    ]);
    return;
  }

  const order = await loadOrderForAlert(orderId);
  if (!order) return;
  if (order.payout_hold_note?.includes(`Dispute ${dispute.id} closed`)) return;

  await appendHoldNote(orderId, `Dispute ${dispute.id} closed: ${dispute.status}.`);

  // 输了:钱已经退回买家,订单记成取消(暂停标记保留,管理员看得到来龙去脉)。
  // 赢了:只通知,不自动放款,管理员在 /admin/holds 点 "Remove hold"(产品负责人确认)。
  if (dispute.status === "lost") {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("listing_orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "dispute_lost",
      })
      .eq("id", orderId)
      .in("status", ["paid_in_escrow", "delivered", "confirmed"]);
    if (error) {
      throw new Error(`Failed to cancel order after lost dispute: ${error.message}`);
    }
    await supabase
      .from("payments")
      .update({ status: "dispute_lost" })
      .eq("order_id", orderId)
      .eq("status", "paid_in_escrow");
  }

  await sendAdminAlert(`Dispute ${dispute.status} on ${orderLabel(order)}`, [
    dispute.status === "won"
      ? `The dispute on order ${orderLabel(order)} was closed in the platform's favour. The payout is still on hold — if everything is fine, remove the hold in /admin/holds and the normal payout flow continues.`
      : `The dispute on order ${orderLabel(order)} closed with status "${dispute.status}". The order stays on hold${dispute.status === "lost" ? " and is now marked cancelled (the buyer got the money back)" : ""}.`,
  ]);
}

// Stripe 后台手动退款(或者任何不是走我们 24 小时免费取消的退款)。我们自己的免费取消
// 先把订单锁成 cancelled 再退款,所以这里看到 cancelled 就只补一下 payments。
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = paymentIntentIdOf(charge.payment_intent);
  const orderId = paymentIntentId ? await findOrderIdByPaymentIntent(paymentIntentId) : null;
  if (!orderId) {
    console.error("charge.refunded for a payment without an order:", charge.id);
    return;
  }

  const order = await loadOrderForAlert(orderId);
  if (!order) return;
  const supabase = createServiceClient();
  const refunded = money(charge.amount_refunded, charge.currency);

  if (order.status === "cancelled") {
    await supabase
      .from("payments")
      .update({ status: "refunded" })
      .eq("order_id", orderId)
      .eq("status", "paid_in_escrow");
    return;
  }

  const inEscrow = ["paid_in_escrow", "delivered", "confirmed"].includes(order.status);

  if (charge.refunded && inEscrow) {
    // 全额退款、钱还没转给卖家:订单记成取消,这笔钱就不会再转出去。
    const { data: cancelled, error } = await supabase
      .from("listing_orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "manual_refund",
      })
      .eq("id", orderId)
      .in("status", ["paid_in_escrow", "delivered", "confirmed"])
      .select("id");
    if (error) {
      throw new Error(`Failed to cancel refunded order: ${error.message}`);
    }
    await supabase
      .from("payments")
      .update({ status: "refunded" })
      .eq("order_id", orderId)
      .eq("status", "paid_in_escrow");
    if (cancelled && cancelled.length > 0) {
      await sendAdminAlert(`Order ${orderLabel(order)} refunded in Stripe`, [
        `The payment for order ${orderLabel(order)} was fully refunded (${refunded}) outside the normal cancellation flow. The order is now marked cancelled and no payout will be sent.`,
      ]);
    }
    return;
  }

  // 部分退款,或者钱已经转给卖家之后才退款:暂停 + 通知管理员人工处理。
  if (order.payout_hold_note?.includes(`Refund on ${charge.id}: ${refunded}`)) return;
  await placePayoutHold(orderId, "refund", `Refund on ${charge.id}: ${refunded} refunded so far.`);
  await sendAdminAlert(`Refund on ${orderLabel(order)} needs a decision`, [
    `${refunded} of the payment for order ${orderLabel(order)} was refunded outside the normal flow (order status: ${order.status}). The order is on hold.`,
    inEscrow
      ? "Decide in /admin/holds whether the seller should still be paid (and how much) before removing the hold."
      : "The seller has already been paid. If the seller should cover this refund, reverse the transfer in Stripe.",
  ]);
}
