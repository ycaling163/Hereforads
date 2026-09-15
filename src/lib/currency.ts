// 固定的大致汇率(1 单位外币 = 多少人民币),仅用于价格旁边显示一个参考换算,
// 不是实时汇率,后续需要人工更新。
const APPROX_CNY_RATE: Record<string, number> = {
  CNY: 1,
  USD: 7.2,
  GBP: 9.1,
  EUR: 7.8,
  HKD: 0.92,
  JPY: 0.048,
  AUD: 4.7,
  SGD: 5.3,
};

export function approxCnyAmount(
  amount: number,
  currency: string
): number | null {
  const rate = APPROX_CNY_RATE[currency.toUpperCase()];
  if (!rate || currency.toUpperCase() === "CNY") {
    return null;
  }
  return Math.round(amount * rate);
}
