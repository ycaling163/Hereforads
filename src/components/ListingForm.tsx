"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Listing, SocialAccount } from "@/lib/supabase/types";
import {
  AD_TYPES,
  AD_TYPE_LABELS,
  CURRENCIES,
  LISTING_CATEGORIES,
  LISTING_CATEGORY_LABELS,
  PRICING_UNITS,
  PRICING_UNIT_LABELS,
  SOCIAL_PLATFORM_LABELS,
} from "@/lib/supabase/enums";
import {
  PROCESSING_FEE_RATE,
  PROCESSING_FIXED_FEE_MINOR,
  SERVICE_FEE_RATE,
  calculateFees,
  currencyDecimals,
  formatMoney,
  minListingPrice,
} from "@/lib/fees";
import { ListingMediaManager } from "@/components/ListingMediaManager";
import { DEFAULT_MIN_BOOKING_DAYS, MAX_BOOKING_DAYS } from "@/lib/booking";

export interface ListingFormState {
  error?: string;
}

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function ListingForm({
  action,
  initialListing,
  duplicatedFromTitle,
  socialAccounts,
  websiteUrl,
  userId,
  submitLabel,
  pendingLabel,
  defaultCurrency,
}: {
  action: (
    prevState: ListingFormState,
    formData: FormData
  ) => Promise<ListingFormState>;
  initialListing?: Listing;
  // Set when this form was pre-filled by copying another listing (not
  // editing it) — shows a reminder to double-check fields that shouldn't
  // just be carried over blindly, like which platform this new one is for.
  duplicatedFromTitle?: string;
  socialAccounts: SocialAccount[];
  websiteUrl: string | null;
  /** 当前卖家的 user id,视频直传 Storage 时用作文件夹名。 */
  userId: string;
  submitLabel: string;
  pendingLabel: string;
  /** 新发布时的默认币种(卖家收款国家的货币);编辑/复制时用原来的币种。 */
  defaultCurrency?: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [priceAmount, setPriceAmount] = useState(
    initialListing?.price_amount !== undefined ? String(initialListing.price_amount) : ""
  );
  const [priceCurrency, setPriceCurrency] = useState(
    initialListing?.price_currency ??
      (defaultCurrency && CURRENCIES.includes(defaultCurrency) ? defaultCurrency : "USD")
  );
  const [pricingUnit, setPricingUnit] = useState(initialListing?.pricing_unit ?? "one_time");
  const [bookingEnabled, setBookingEnabled] = useState(initialListing?.booking_enabled ?? false);
  const minPrice = minListingPrice(priceCurrency);
  const parsedPrice = Number(priceAmount);
  const feePreview =
    priceAmount && !Number.isNaN(parsedPrice) && parsedPrice >= minPrice
      ? calculateFees(parsedPrice, priceCurrency)
      : null;
  const [acceptsAnyCategory, setAcceptsAnyCategory] = useState(
    initialListing?.categories.includes("any") ?? false
  );

  const defaultPlacement = initialListing?.social_account_id
    ? `account:${initialListing.social_account_id}`
    : initialListing?.is_website_placement
      ? "website"
      : initialListing
        ? "other"
        : "";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {duplicatedFromTitle && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">
            This is a copy of &ldquo;{duplicatedFromTitle}&rdquo;.
          </p>
          <p className="mt-1">
            Every listing is tied to exactly one platform. If this ad runs
            somewhere different from the original (e.g. the original was
            YouTube and this one is TikTok), update the{" "}
            <strong>Ad placement</strong> field below — and swap the cover
            image if it&apos;s platform-specific. To offer the same ad on
            multiple platforms, publish one listing per platform rather than
            listing them all under one.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={initialListing?.title}
          placeholder="e.g. Bio-link placement on my Instagram (50k followers)"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ad_type" className={labelClass}>
          Ad type
        </label>
        <p className="text-xs text-zinc-500">
          What kind of ad is this? Buyers can compare this across listings.
          Pick <strong>Custom</strong> if this placement doesn&apos;t fit the
          standard types — buyers will be nudged to message you before
          buying so you can agree on scope first.
        </p>
        <select
          id="ad_type"
          name="ad_type"
          required
          defaultValue={initialListing?.ad_type ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Choose an ad type
          </option>
          {AD_TYPES.map((type) => (
            <option key={type} value={type}>
              {AD_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="placement" className={labelClass}>
          Ad placement
        </label>
        <p className="text-xs text-zinc-500">
          Exactly where this specific listing runs. Buyers only see this one
          platform on the listing — not your other accounts — so be precise;
          it&apos;s what they&apos;re paying for.
        </p>
        <select
          id="placement"
          name="placement"
          required
          defaultValue={defaultPlacement}
          className={inputClass}
        >
          <option value="" disabled>
            Choose where this ad runs
          </option>
          {socialAccounts.map((account) => (
            <option key={account.id} value={`account:${account.id}`}>
              {SOCIAL_PLATFORM_LABELS[account.platform] ?? account.platform}
              {account.handle ? ` · ${account.handle}` : ""}
            </option>
          ))}
          {websiteUrl && <option value="website">My website</option>}
          <option value="other">Other / not tied to a specific account</option>
        </select>
        {socialAccounts.length === 0 && !websiteUrl && (
          <p className="text-xs text-zinc-500">
            No social accounts or website on file yet — add one on your{" "}
            <Link href="/dashboard/profile" className="underline">
              profile
            </Link>{" "}
            for buyers to see exactly where this ad runs.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={initialListing?.description ?? ""}
          placeholder="Please describe in English — what the buyer gets, where it shows up, how long it stays up."
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={labelClass}>Ad categories you accept</p>
        <p className="text-xs text-zinc-500">
          What kind of brands can advertise here? This doesn&apos;t have to
          match your own content niche (set that on your{" "}
          <Link href="/dashboard/profile" className="underline">
            profile
          </Link>
          ) — e.g. a crafts creator can still take fashion or food ads. Not
          sure, or happy to take anything? Check &ldquo;Any category&rdquo;
          instead of picking one by one.
        </p>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
          <input
            type="checkbox"
            checked={acceptsAnyCategory}
            onChange={(e) => setAcceptsAnyCategory(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          {LISTING_CATEGORY_LABELS.any}
        </label>
        {acceptsAnyCategory ? (
          <input type="hidden" name="categories" value="any" />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {LISTING_CATEGORIES.filter((category) => category !== "any").map(
              (category) => (
                <label
                  key={category}
                  className="flex items-center gap-2 text-sm text-zinc-700"
                >
                  <input
                    type="checkbox"
                    name="categories"
                    value={category}
                    defaultChecked={initialListing?.categories?.includes(category)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  {LISTING_CATEGORY_LABELS[category]}
                </label>
              )
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price_amount" className={labelClass}>
            Price
          </label>
          <input
            id="price_amount"
            name="price_amount"
            type="number"
            step={currencyDecimals(priceCurrency) === 0 ? "1" : "0.01"}
            min={minPrice}
            required
            value={priceAmount}
            onChange={(event) => setPriceAmount(event.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-zinc-500">
            Minimum {minPrice} {priceCurrency}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price_currency" className={labelClass}>
            Currency
          </label>
          <select
            id="price_currency"
            name="price_currency"
            required
            value={priceCurrency}
            onChange={(event) => setPriceCurrency(event.target.value)}
            className={inputClass}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">
            Tip: price in your bank account&apos;s currency
            {defaultCurrency ? ` (${defaultCurrency})` : ""} — otherwise Stripe converts your
            earnings (about 2%, paid by you).
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pricing_unit" className={labelClass}>
            Pricing unit
          </label>
          <select
            id="pricing_unit"
            name="pricing_unit"
            required
            value={pricingUnit}
            onChange={(event) => setPricingUnit(event.target.value as typeof pricingUnit)}
            className={inputClass}
          >
            {PRICING_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {PRICING_UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 日历按天预订(README"日历按天预订"第 1 条):只有按天/周/月计价才出现这个开关。
          按周/按月的广告按整周/30 天一段订,没有最少天数设置。 */}
      {pricingUnit !== "one_time" && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4">
          <label className="flex items-start gap-2 text-sm font-medium text-zinc-800">
            <input
              type="checkbox"
              name="booking_enabled"
              checked={bookingEnabled}
              onChange={(event) => setBookingEnabled(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300"
            />
            <span>
              Let buyers pick dates
              <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                For ads that run for a period of time (banner, pinned post, bio
                link…). Buyers choose a start date and how long; booked dates
                can&apos;t be booked again.{" "}
                {pricingUnit === "weekly"
                  ? "Buyers book whole weeks at your weekly price."
                  : pricingUnit === "monthly"
                    ? "Buyers book whole months (30 days each) at your monthly price."
                    : "Buyers pay your daily price × number of days."}{" "}
                Dates are in UK time.
              </span>
            </span>
          </label>
          {bookingEnabled && pricingUnit === "daily" && (
            <div className="flex items-center gap-2 pl-6 text-sm text-zinc-700">
              <label htmlFor="min_booking_days">Minimum booking</label>
              <input
                id="min_booking_days"
                name="min_booking_days"
                type="number"
                min={1}
                max={MAX_BOOKING_DAYS}
                step={1}
                required
                defaultValue={initialListing?.min_booking_days ?? DEFAULT_MIN_BOOKING_DAYS}
                className={`${inputClass} w-20`}
              />
              <span>days</span>
            </div>
          )}
        </div>
      )}

      {/* 固定费率(README"费用、取消与退款规则"第 2 条):卖家挂单时就能看到到手金额。 */}
      <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
        {feePreview ? (
          <>
            <div className="flex justify-between">
              <span>Buyer pays</span>
              <span>{formatMoney(feePreview.grossMinor, feePreview.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Service fee ({SERVICE_FEE_RATE * 100}%)</span>
              <span>−{formatMoney(feePreview.serviceFeeMinor, feePreview.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>
                Payment processing fee ({PROCESSING_FEE_RATE * 100}% +{" "}
                {formatMoney(
                  PROCESSING_FIXED_FEE_MINOR[feePreview.currency],
                  feePreview.currency
                )}
                )
              </span>
              <span>−{formatMoney(feePreview.processingFeeMinor, feePreview.currency)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1 font-medium text-zinc-900">
              <span>You&apos;ll receive</span>
              <span>{formatMoney(feePreview.sellerNetMinor, feePreview.currency)}</span>
            </div>
          </>
        ) : (
          <p>
            Enter a price to see what you&apos;ll receive after the {SERVICE_FEE_RATE * 100}%
            service fee and the payment processing fee.
          </p>
        )}
      </div>

      <ListingMediaManager
        initialUrls={initialListing?.media_urls ?? []}
        userId={userId}
        hint={
          duplicatedFromTitle
            ? "Copied from the original listing. Swap the cover for a platform-specific screenshot if needed."
            : undefined
        }
      />

      {/* 只在真正创建新 listing 时问一次(见 README"发布免审核 + KYC 后置"
          一节)——编辑已有 listing 不重新要求勾选,不然改个价格都要重新同意
          一遍条款,体验很糟。这两条不勾,createListingAction 服务端会拒绝提交,
          这里的 required 只是前端提前挡一下。 */}
      {!initialListing && (
        <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="rights_confirmed"
              required
              className="mt-0.5 h-4 w-4 rounded border-zinc-300"
            />
            <span>
              I own this account (or have explicit authorization to run ads
              on it), and the content I&apos;ll use is original / not subject
              to any copyright dispute. I&apos;m responsible for any legal
              claims resulting from false or infringing content.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="terms_accepted"
              required
              className="mt-0.5 h-4 w-4 rounded border-zinc-300"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="underline">
                Terms of Service
              </Link>
              .
            </span>
          </label>
        </div>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 self-start rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
