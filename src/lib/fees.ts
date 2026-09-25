// 固定费率(README"费用、取消与退款规则"第 2 条):卖家挂单时就能算出到手金额,
// 不再按 Stripe 实报手续费扣。Stripe 实际扣的手续费由平台自己承担。
//
// 纯函数、不碰 Stripe/Supabase,服务端(webhook、放款)和客户端(发布表单的
// "到手金额"预览)共用这一份,保证两边算出来一模一样。所有金额都先换成最小货币
// 单位(便士/分/日元)的整数再算,避免浮点误差。

// 费率、固定手续费、最低发布价的数值在 src/config/site.ts。
import {
  SERVICE_FEE_RATE,
  PROCESSING_FEE_RATE,
  PROCESSING_FIXED_FEE_MINOR,
  MIN_LISTING_PRICE_MINOR,
} from "@/config/site";

export { SERVICE_FEE_RATE, PROCESSING_FEE_RATE, PROCESSING_FIXED_FEE_MINOR, MIN_LISTING_PRICE_MINOR };

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
