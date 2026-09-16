// Stripe Express 账户支持的国家/地区,手动摘录自 Stripe 官方文档,不含中国大陆
// (见产品方案文档:中国大陆无法开通 Stripe Connect 收款账户,收款通道留待后期跟
// Airwallex 等方案一起解决)。Stripe 会不时调整支持范围,这份列表要定期跟官方核对,
// 增删国家只需要改这一个文件。
export const STRIPE_SUPPORTED_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "JP", name: "Japan" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TH", name: "Thailand" },
  { code: "MY", name: "Malaysia" },
] as const;

export type StripeSupportedCountryCode =
  (typeof STRIPE_SUPPORTED_COUNTRIES)[number]["code"];

export function isStripeSupportedCountry(
  code: string
): code is StripeSupportedCountryCode {
  return STRIPE_SUPPORTED_COUNTRIES.some((c) => c.code === code);
}
