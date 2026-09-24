// 日历按天预订(README"日历按天预订"一节,2026-09-24 决策)。纯函数,服务端(下单、
// 取消、交付、cron)和客户端(日历选择器)共用。
//
// 日期一律用 "YYYY-MM-DD" 字符串表示,对应数据库 listing_orders.start_date/end_date
// (date 类型,end_date 是展示的最后一天,含当天)。"一天"按英国时间算(产品负责人定:
// 按卖家当地时区会碰到美国这种一国多时区、买卖双方看到的日期对不上,MVP 先统一英国
// 时间),页面上注明 "Dates are in UK time"。
import type { PricingUnit } from "@/lib/supabase/enums";

export const BOOKING_TIME_ZONE = "Europe/London";

// 按天计价:卖家设最少预订天数,默认 7 天,可设 1–90。
export const DEFAULT_MIN_BOOKING_DAYS = 7;
// 单次预订最多 90 天(按周最多 12 周,按月最多 3 个月)。
export const MAX_BOOKING_DAYS = 90;
// 开始日期最远在今天之后 60 天。
export const MAX_ADVANCE_DAYS = 60;
// 还没付款的订单占用日期的时间。Stripe Checkout 付款链接的有效期设成
// CHECKOUT_EXPIRES_MINUTES(Stripe 要求至少 30 分钟),占用时间比它多几分钟,
// 保证付款链接失效之前日期一直是这个买家的。
export const CHECKOUT_EXPIRES_MINUTES = 31;
export const PENDING_HOLD_MINUTES = 36;

// 按周计价的广告按整周订,按月计价的按 30 天一段订;价格 = 单价 × 周数/段数,
// 卖家填的周价/月价就是套餐价,不要求等于日价 × 7/30。
const UNIT_DAYS: Record<Exclude<PricingUnit, "one_time">, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export type BookingUnit = keyof typeof UNIT_DAYS;

export function isBookingUnit(unit: PricingUnit): unit is BookingUnit {
  return unit !== "one_time";
}

export function unitDays(unit: BookingUnit): number {
  return UNIT_DAYS[unit];
}

export function maxBookingUnits(unit: BookingUnit): number {
  return Math.floor(MAX_BOOKING_DAYS / UNIT_DAYS[unit]);
}

/** 最少订几个单位:按天计价用卖家设的最少天数,按周/按月最少 1 周/1 个月。 */
export function minBookingUnits(unit: BookingUnit, minBookingDays: number | null): number {
  return unit === "daily" ? (minBookingDays ?? DEFAULT_MIN_BOOKING_DAYS) : 1;
}

export function describeUnits(unit: BookingUnit, units: number): string {
  if (unit === "daily") return `${units} day${units === 1 ? "" : "s"}`;
  if (unit === "weekly") return `${units} week${units === 1 ? "" : "s"}`;
  return `${units} month${units === 1 ? "" : "s"} (${units * 30} days)`;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidDate(date: string): boolean {
  return DATE_PATTERN.test(date) && formatDate(parseDate(date)) === date;
}

export function addDays(date: string, days: number): string {
  return formatDate(parseDate(date) + days * 86_400_000);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / 86_400_000);
}

export function bookingEndDate(start: string, unit: BookingUnit, units: number): string {
  return addDays(start, units * UNIT_DAYS[unit] - 1);
}

export interface DateRange {
  start: string;
  end: string;
}

// 日期字符串按字典序比较就是按时间比较。
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** 英国时间的"今天"。 */
export function bookingToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// 某个时刻英国时间比 UTC 快多少毫秒(冬令时 0,夏令时 1 小时)。
function londonOffsetMs(at: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** 预订日期当天英国时间 00:00 对应的时刻。 */
export function bookingDayStart(date: string): Date {
  const utcMidnight = parseDate(date);
  return new Date(utcMidnight - londonOffsetMs(utcMidnight));
}

/** 例:"21 Oct 2026"。 */
export function formatBookingDate(date: string, withYear = true): string {
  return new Date(parseDate(date)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** 例:"12 Oct – 21 Oct 2026"。 */
export function formatBookingRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatBookingDate(start, !sameYear)} – ${formatBookingDate(end)}`;
}
