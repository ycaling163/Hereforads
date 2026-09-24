"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { buyListingAction, type BuyListingState } from "@/app/listings/[id]/actions";
import { BookingPicker, type BookingOptions } from "@/components/BookingPicker";

const primaryButtonClass =
  "w-full rounded-full bg-zinc-900 px-6 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50";
const secondaryButtonClass =
  "w-full rounded-full border border-zinc-300 bg-white px-6 py-3 text-center text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-900";

// 未登录买家点 Buy now 后,才出现"登录 / 注册 / 以访客身份购买"三个选项(常见网店
// 结账页的做法),广告页上不主动宣传"不用注册"——优先引导注册/登录,guest 结账
// 作为兜底保留(见 README"Guest 结账"一节)。
//
// 开了日历预订的广告(booking 不为空)先在上面选开始日期和时长,选好才能付款;登录/
// 注册跳转时把选好的日期带在回跳地址里,回来不用重选。
export function BuyListingButton({
  listingId,
  isLoggedIn,
  booking,
  initialStart,
  initialUnits,
}: {
  listingId: string;
  isLoggedIn: boolean;
  booking?: BookingOptions;
  initialStart?: string | null;
  initialUnits?: number;
}) {
  const [state, formAction, pending] = useActionState<BuyListingState, FormData>(
    buyListingAction,
    {}
  );
  const [showOptions, setShowOptions] = useState(false);
  const [selection, setSelection] = useState({
    start: initialStart ?? null,
    units: initialUnits ?? booking?.minUnits ?? 1,
  });
  const bookingIncomplete = !!booking && !selection.start;
  // 登录/注册完回到这条广告,并带 resume=buy 让页面提示"接着付款"。
  const returnTo = encodeURIComponent(
    `/listings/${listingId}?resume=buy` +
      (booking && selection.start ? `&start=${selection.start}&units=${selection.units}` : "")
  );

  const picker = booking && (
    <BookingPicker
      options={booking}
      start={selection.start}
      units={selection.units}
      onChange={(start, units) => setSelection({ start, units })}
    />
  );

  const escrowNote = (
    <p className="text-center text-xs text-zinc-500">
      Payment is held in escrow until you confirm delivery.
    </p>
  );

  if (!isLoggedIn && !showOptions) {
    return (
      <div className="flex flex-col gap-2">
        {picker}
        <button
          type="button"
          onClick={() => setShowOptions(true)}
          disabled={bookingIncomplete}
          className={primaryButtonClass}
        >
          Buy now
        </button>
        {escrowNote}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {picker}
      {!isLoggedIn && (
        <>
          <Link href={`/login?next=${returnTo}`} className={primaryButtonClass}>
            Log in to buy
          </Link>
          <Link href={`/register?next=${returnTo}`} className={secondaryButtonClass}>
            Create an account
          </Link>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" />
            or
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
        </>
      )}
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="listing_id" value={listingId} />
        {booking && (
          <>
            <input type="hidden" name="start_date" value={selection.start ?? ""} />
            <input type="hidden" name="booking_units" value={selection.units} />
          </>
        )}
        {!isLoggedIn && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest_email" className="text-xs font-medium text-zinc-700">
              Buy as guest — your email
            </label>
            <input
              id="guest_email"
              name="guest_email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
            <p className="text-xs text-zinc-500">
              We&apos;ll email you a link to track this order.
            </p>
          </div>
        )}
        {/* 结账前必勾(README"费用、取消与退款规则"第 10 条):同意条款 + 英国
            Consumer Contracts Regulations 下"要求立即开始服务、知道完成后失去
            14 天取消权"的明确确认。勾选时间由服务端写进订单留痕。措辞待律师确认。 */}
        <div className="flex flex-col gap-2 rounded-lg bg-white p-3 text-xs text-zinc-600">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="accept_terms"
              required
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="underline">
                Terms of Service
              </Link>
              .
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="immediate_start"
              required
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300"
            />
            <span>
              I ask the seller to start straight away. I understand that I lose my
              14-day right to cancel once the ad is delivered, and that if I cancel
              after work has started I&apos;ll pay for the work already done.
            </span>
          </label>
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending || bookingIncomplete}
          className={isLoggedIn ? primaryButtonClass : secondaryButtonClass}
        >
          {pending
            ? "Redirecting to checkout…"
            : isLoggedIn
              ? "Buy now"
              : "Continue as guest"}
        </button>
        {escrowNote}
      </form>
    </div>
  );
}
