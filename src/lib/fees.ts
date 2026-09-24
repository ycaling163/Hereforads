// 固定费率(README"费用、取消与退款规则"第 2 条):卖家挂单时就能算出到手金额,
// 不再按 Stripe 实报手续费扣。Stripe 实际扣的手续费由平台自己承担。
//
// 纯函数、不碰 Stripe/Supabase,服务端(webhook、放款)和客户端(发布表单的
// "到手金额"预览)共用这一份,保证两边算出来一模一样。所有金额都先换成最小货币
// 单位(便士/分/日元)的整数再算,避免浮点误差。

export const SERVICE_FEE_RATE = 0.12;
export const PROCESSING_FEE_RATE = 0.04;

// Payment processing fee 的固定部分:GBP 0.20,其他币种按大致等值取整(USD/EUR 的
// 0.25 是 README 第 2 条写明的;其余几种是按 2026-09 汇率取的等值整数)。
// 最小货币单位。改金额只改这里。
export const PROCESSING_FIXED_FEE_MINOR: Record<string, number> = {
  GBP: 20,
  USD: 25,
  EUR: 25,
  CAD: 35,
  AUD: 40,
  SGD: 35,
  HKD: 200,
  JPY: 40,
};

// 最低发布价:按 USD 0.99 的等值(不是每种货币都 0.99——0.99 日元连 Stripe 的最低
// 收款额都不到)。同样是最小货币单位。
export const MIN_LISTING_PRICE_MINOR: Record<string, number> = {
  USD: 99,
  GBP: 79,
  EUR: 89,
  CAD: 139,
  AUD: 149,
  SGD: 129,
  HKD: 799,
  JPY: 150,
};

// Stripe 的零小数位货币(金额本身就是最小单位)。本站支持的币种里只有 JPY。
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY"]);

export function currencyDecimals(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyDecimals(currency));
}

export function fromMinorUnits(minor: number, currency: string): number {
  return minor / 10 ** currencyDecimals(currency);
}

export function formatMoney(minor: number, currency: string): string {
  return `${fromMinorUnits(minor, currency).toFixed(currencyDecimals(currency))} ${currency.toUpperCase()}`;
}

export function minListingPrice(currency: string): number {
  const code = currency.toUpperCase();
  return fromMinorUnits(MIN_LISTING_PRICE_MINOR[code] ?? MIN_LISTING_PRICE_MINOR.USD, code);
}

export interface FeeBreakdown {
  currency: string;
  grossMinor: number;
  serviceFeeMinor: number;
  processingFeeMinor: number;
  sellerNetMinor: number;
}

/** 例:GBP 100.00 → Service fee 12.00、Payment processing fee 4.20、卖家到手 83.80。 */
export function calculateFees(amount: number, currency: string): FeeBreakdown {
  const code = currency.toUpperCase();
  const fixed = PROCESSING_FIXED_FEE_MINOR[code];
  if (fixed === undefined) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  const grossMinor = toMinorUnits(amount, code);
  const serviceFeeMinor = Math.round(grossMinor * SERVICE_FEE_RATE);
  const processingFeeMinor = Math.round(grossMinor * PROCESSING_FEE_RATE) + fixed;
  const sellerNetMinor = Math.max(grossMinor - serviceFeeMinor - processingFeeMinor, 0);
  return { currency: code, grossMinor, serviceFeeMinor, processingFeeMinor, sellerNetMinor };
}

export function isSupportedCurrency(currency: string): boolean {
  return currency.toUpperCase() in PROCESSING_FIXED_FEE_MINOR;
}
