const DAY_MS = 24 * 60 * 60 * 1000;
// 预订还没走真正的支付流程,只有这几个状态代表"这段日期已经被占用"。
const BLOCKING_ORDER_STATUSES = ["pending_payment", "paid", "in_progress"];

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD, inclusive
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function getBlockingRanges(
  orders: { status: string; start_date: string | null; end_date: string | null }[]
): DateRange[] {
  return orders
    .filter(
      (o) =>
        BLOCKING_ORDER_STATUSES.includes(o.status) &&
        o.start_date &&
        o.end_date
    )
    .map((o) => ({ start: o.start_date as string, end: o.end_date as string }));
}

/**
 * 从 `from`(默认今天)开始,找下一个连续 durationDays 天、且不跟任何
 * 已占用区间重叠的起始日期。
 */
export function getNextAvailableStart(
  blockingRanges: DateRange[],
  durationDays: number,
  from: Date = new Date()
): string {
  const today = new Date(toDateOnly(from));
  const ranges = blockingRanges.map((r) => ({
    start: new Date(r.start),
    end: new Date(r.end),
  }));

  let candidateStart = today;
  // 找不到就放弃(理论上两年内一定能找到,除非 durationDays 大到离谱)。
  const searchLimit = addDays(today, 730);

  while (candidateStart <= searchLimit) {
    const candidateEnd = addDays(candidateStart, durationDays - 1);
    const conflict = ranges.find((r) =>
      rangesOverlap(candidateStart, candidateEnd, r.start, r.end)
    );
    if (!conflict) {
      return toDateOnly(candidateStart);
    }
    // 跳到冲突区间结束的第二天,继续找
    candidateStart = addDays(conflict.end, 1);
  }

  return toDateOnly(today);
}

export function isDateBlocked(date: Date, blockingRanges: DateRange[]): boolean {
  const day = toDateOnly(date);
  return blockingRanges.some((r) => day >= r.start && day <= r.end);
}

export { toDateOnly, addDays };
