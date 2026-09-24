"use client";

import { useState } from "react";
import {
  addDays,
  bookingEndDate,
  describeUnits,
  formatBookingDate,
  formatBookingRange,
  rangesOverlap,
  type BookingUnit,
  type DateRange,
} from "@/lib/booking";
import { formatMoney } from "@/lib/fees";

export interface BookingOptions {
  unit: BookingUnit;
  unitAmountMinor: number;
  currency: string;
  minUnits: number;
  maxUnits: number;
  // 英国时间的今天、最远可选的开始日期,由服务端算好传进来(避免服务端/浏览器时区
  // 不同导致日历渲染对不上)。
  today: string;
  maxStart: string;
  bookedRanges: DateRange[];
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

function dateOf(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/**
 * 日历按天预订的选择器(README"日历按天预订"第 2 条):选开始日期 + 天数/周数/月数,
 * 已被预订的日期置灰;会跟已有预订重叠的开始日期也不能点。只是前端提示,下单时服务端
 * 和数据库函数会再校验一次。选中的值通过 onChange 交给外层表单的 hidden input。
 */
export function BookingPicker({
  options,
  start,
  units,
  onChange,
}: {
  options: BookingOptions;
  start: string | null;
  units: number;
  onChange: (start: string | null, units: number) => void;
}) {
  const { unit, today, maxStart, bookedRanges } = options;
  const initial = start ?? today;
  const [view, setView] = useState({
    year: Number(initial.slice(0, 4)),
    month: Number(initial.slice(5, 7)) - 1,
  });

  const lengthOk = (d: string) =>
    !bookedRanges.some((r) => rangesOverlap(r, { start: d, end: bookingEndDate(d, unit, units) }));
  const isBooked = (d: string) => bookedRanges.some((r) => d >= r.start && d <= r.end);
  const end = start ? bookingEndDate(start, unit, units) : null;
  const conflict = start !== null && !lengthOk(start);

  const firstOfMonth = dateOf(view.year, view.month, 1);
  const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
  // 周一开头。
  const leadingBlanks = (new Date(Date.UTC(view.year, view.month, 1)).getUTCDay() + 6) % 7;
  const canPrev = firstOfMonth > today;
  const canNext = dateOf(view.year, view.month + 1, 1) <= maxStart;
  const shiftMonth = (delta: number) =>
    setView(({ year, month }) => {
      const next = new Date(Date.UTC(year, month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  const unitOptions = Array.from(
    { length: options.maxUnits - options.minUnits + 1 },
    (_, i) => options.minUnits + i
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={!canPrev}
          aria-label="Previous month"
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-zinc-900">
          {monthLabel(view.year, view.month)}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={!canNext}
          aria-label="Next month"
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-zinc-400">
            {w}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = dateOf(view.year, view.month, i + 1);
          const booked = isBooked(d);
          const selectable = d >= today && d <= maxStart && !booked && lengthOk(d);
          const inSelection = start !== null && end !== null && d >= start && d <= end;
          return (
            <button
              key={d}
              type="button"
              disabled={!selectable}
              onClick={() => onChange(d, units)}
              title={booked ? "Already booked" : undefined}
              className={`rounded py-1.5 ${
                inSelection
                  ? conflict
                    ? "bg-red-100 text-red-700"
                    : "bg-zinc-900 text-white"
                  : booked
                    ? "bg-zinc-100 text-zinc-300 line-through"
                    : selectable
                      ? "text-zinc-800 hover:bg-zinc-100"
                      : "text-zinc-300"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <label className="flex items-center justify-between gap-2 text-sm text-zinc-700">
        <span>Length</span>
        <select
          value={units}
          onChange={(e) => onChange(start, Number(e.target.value))}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-900"
        >
          {unitOptions.map((n) => (
            <option key={n} value={n}>
              {describeUnits(unit, n)}
            </option>
          ))}
        </select>
      </label>

      <div className="text-xs text-zinc-600">
        {start && end ? (
          conflict ? (
            <p className="text-red-600">
              {formatBookingRange(start, end)} overlaps an existing booking — pick another
              start date or a shorter length.
            </p>
          ) : (
            <p>
              <span className="font-medium text-zinc-900">{formatBookingRange(start, end)}</span>
              {" · "}
              {describeUnits(unit, units)}
            </p>
          )
        ) : (
          <p>Pick a start date. Crossed-out dates are already booked.</p>
        )}
        <p className="mt-1 flex justify-between font-medium text-zinc-900">
          <span>Total</span>
          <span>{formatMoney(options.unitAmountMinor * units, options.currency)}</span>
        </p>
        <p className="mt-1 text-zinc-400">
          Dates are in UK time. Latest start date: {formatBookingDate(maxStart)}.
          {start && start <= addDays(today, 1)
            ? " Bookings starting within 24 hours can't be cancelled for free."
            : ""}
        </p>
      </div>
    </div>
  );
}
