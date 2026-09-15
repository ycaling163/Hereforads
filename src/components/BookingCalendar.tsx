"use client";

import { useActionState } from "react";
import { bookSpaceAction, type BookSpaceState } from "@/app/spaces/[id]/actions";
import { addDays, isDateBlocked, toDateOnly, type DateRange } from "@/lib/booking";

const initialState: BookSpaceState = {};

function buildMonthDays(monthStart: Date): Date[] {
  const days: Date[] = [];
  const month = monthStart.getMonth();
  let cursor = monthStart;
  while (cursor.getMonth() === month) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function BookingCalendar({
  adSpaceId,
  blockingRanges,
  nextAvailableStart,
  nextAvailableEnd,
  durationDays,
  priceAmount,
  priceCurrency,
  isLoggedIn,
  isOwnSpace,
}: {
  adSpaceId: string;
  blockingRanges: DateRange[];
  nextAvailableStart: string;
  nextAvailableEnd: string;
  durationDays: number;
  priceAmount: number;
  priceCurrency: string;
  isLoggedIn: boolean;
  isOwnSpace: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    bookSpaceAction,
    initialState
  );

  const today = new Date(toDateOnly(new Date()));
  const monthDays = buildMonthDays(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-700">
        {today.getFullYear()} 年 {today.getMonth() + 1} 月
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {monthDays.map((day) => {
          const blocked = isDateBlocked(day, blockingRanges);
          const isPast = day < today;
          return (
            <div
              key={day.toISOString()}
              title={blocked ? "已被预订" : "可预订"}
              className={`aspect-square rounded-md flex items-center justify-center ${
                isPast
                  ? "text-zinc-300"
                  : blocked
                    ? "bg-zinc-200 text-zinc-400 line-through"
                    : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {day.getDate()}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-50" /> 可预订
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-zinc-200" /> 已被预订
        </span>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 p-5">
        <p className="text-sm text-zinc-600">下一个可预订档期</p>
        <p className="mt-1 text-lg font-semibold text-zinc-900">
          {nextAvailableStart} 至 {nextAvailableEnd}({durationDays} 天)
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {priceAmount} {priceCurrency}
        </p>

        <form action={formAction} className="mt-4">
          <input type="hidden" name="ad_space_id" value={adSpaceId} />
          <input type="hidden" name="start_date" value={nextAvailableStart} />
          <input type="hidden" name="end_date" value={nextAvailableEnd} />

          {state.error && (
            <p className="mb-2 text-sm text-red-600">{state.error}</p>
          )}
          {state.success && (
            <p className="mb-2 text-sm text-green-700">
              预订请求已发送,等待卖家确认。
            </p>
          )}

          {isOwnSpace ? (
            <p className="text-sm text-zinc-400">这是你自己发布的广告位</p>
          ) : (
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending
                ? "提交中..."
                : isLoggedIn
                  ? "预订这个档期"
                  : "登录后预订"}
            </button>
          )}
        </form>
        <p className="mt-2 text-xs text-zinc-400">
          目前预订还不会真正扣款,提交后是&ldquo;待确认&rdquo;状态,后续接入支付后才会正式扣款。
        </p>
      </div>
    </div>
  );
}
