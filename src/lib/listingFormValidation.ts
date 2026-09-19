import {
  AD_TYPES,
  LISTING_CATEGORIES,
  MIN_LISTING_PRICE,
  PRICING_UNITS,
  type AdType,
  type ListingCategory,
  type PricingUnit,
} from "@/lib/supabase/enums";

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

  const priceAmount = Number(priceAmountRaw);
  if (!priceAmountRaw || Number.isNaN(priceAmount) || priceAmount < MIN_LISTING_PRICE) {
    return { error: `Please enter a valid price (minimum $${MIN_LISTING_PRICE})` };
  }
  if (!priceCurrency) {
    return { error: "Please choose a currency" };
  }
  if (!(PRICING_UNITS as readonly string[]).includes(pricingUnitRaw)) {
    return { error: "Please choose a pricing unit" };
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
    },
  };
}
