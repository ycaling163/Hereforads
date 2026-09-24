import {
  AD_TYPES,
  LISTING_CATEGORIES,
  CURRENCIES,
  PRICING_UNITS,
  type AdType,
  type ListingCategory,
  type PricingUnit,
} from "@/lib/supabase/enums";
import { currencyDecimals, minListingPrice } from "@/lib/fees";
import { DEFAULT_MIN_BOOKING_DAYS, MAX_BOOKING_DAYS } from "@/lib/booking";

export interface ParsedListingFields {
  title: string;
  description: string | null;
  categories: ListingCategory[];
  adType: AdType;
  priceAmount: number;
  priceCurrency: string;
  pricingUnit: PricingUnit;
  socialAccountId: string | null;
  isWebsitePlacement: boolean;
  bookingEnabled: boolean;
  minBookingDays: number | null;
}

// Shared between createListingAction and updateListingAction — everything a
// listing needs except media, which the two callers handle differently
// (create only ever adds files; update also has to diff against what's
// already stored).
export function parseListingFormFields(
  formData: FormData,
  ownAccountIds: string[],
  hasWebsite: boolean
): { fields: ParsedListingFields } | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceAmountRaw = String(formData.get("price_amount") ?? "").trim();
  const priceCurrency = String(formData.get("price_currency") ?? "").trim();
  const pricingUnitRaw = String(formData.get("pricing_unit") ?? "");
  const adTypeRaw = String(formData.get("ad_type") ?? "");
  const rawCategories = formData
    .getAll("categories")
    .map(String)
    .filter((c): c is ListingCategory =>
      (LISTING_CATEGORIES as readonly string[]).includes(c)
    );
  // "any" 是"接任何类目"的特殊值,跟具体类目互斥——不管前端提交了什么组合,
  // 只要出现 "any" 就归一化成只存这一个值,避免存成 "any" + 一堆具体类目
  // 混在一起,详情页渲染出来会很奇怪。
  const categories = rawCategories.includes("any") ? (["any"] as ListingCategory[]) : rawCategories;
  const placementRaw = String(formData.get("placement") ?? "");

  if (!title) {
    return { error: "Please enter a title" };
  }
  if (!placementRaw) {
    return { error: "Please choose where this ad runs" };
  }

  // Validate against the seller's own accounts/website server-side — never
  // trust a client-submitted account id without checking ownership.
  let socialAccountId: string | null = null;
  let isWebsitePlacement = false;
  if (placementRaw === "website") {
    if (!hasWebsite) {
      return { error: "You don't have a website on file — add one on your profile first" };
    }
    isWebsitePlacement = true;
  } else if (placementRaw !== "other") {
    const accountId = placementRaw.startsWith("account:")
      ? placementRaw.slice("account:".length)
      : "";
    if (!accountId || !ownAccountIds.includes(accountId)) {
      return { error: "Please choose a valid ad placement" };
    }
    socialAccountId = accountId;
  }

  if (!(CURRENCIES as readonly string[]).includes(priceCurrency)) {
    return { error: "Please choose a currency" };
  }
  const priceAmount = Number(priceAmountRaw);
  const minPrice = minListingPrice(priceCurrency);
  if (!priceAmountRaw || Number.isNaN(priceAmount) || priceAmount < minPrice) {
    return { error: `Please enter a valid price (minimum ${minPrice} ${priceCurrency})` };
  }
  if (currencyDecimals(priceCurrency) === 0 && !Number.isInteger(priceAmount)) {
    return { error: `${priceCurrency} prices can't have decimals` };
  }
  if (!(PRICING_UNITS as readonly string[]).includes(pricingUnitRaw)) {
    return { error: "Please choose a pricing unit" };
  }
  // 日历预订只对按天/周/月计价开放(README"日历按天预订"第 1 条);一次性交付的
  // 广告就算前端提交了开关也不存。最少预订天数只对按天计价有意义。
  const bookingEnabled =
    formData.get("booking_enabled") === "on" && pricingUnitRaw !== "one_time";
  let minBookingDays: number | null = null;
  if (bookingEnabled && pricingUnitRaw === "daily") {
    const minDaysRaw = String(formData.get("min_booking_days") ?? "").trim();
    minBookingDays = minDaysRaw ? Number(minDaysRaw) : DEFAULT_MIN_BOOKING_DAYS;
    if (!Number.isInteger(minBookingDays) || minBookingDays < 1 || minBookingDays > MAX_BOOKING_DAYS) {
      return { error: `Minimum booking must be between 1 and ${MAX_BOOKING_DAYS} days` };
    }
  }
  if (categories.length === 0) {
    return { error: "Please select at least one category" };
  }
  if (!(AD_TYPES as readonly string[]).includes(adTypeRaw)) {
    return { error: "Please choose an ad type" };
  }

  return {
    fields: {
      title,
      description: description || null,
      categories,
      adType: adTypeRaw as AdType,
      priceAmount,
      priceCurrency,
      pricingUnit: pricingUnitRaw as PricingUnit,
      socialAccountId,
      isWebsitePlacement,
      bookingEnabled,
      minBookingDays,
    },
  };
}
