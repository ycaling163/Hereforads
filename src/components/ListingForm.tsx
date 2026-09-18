"use client";

import { useActionState } from "react";
import type { Listing, SocialAccount } from "@/lib/supabase/types";
import {
  LISTING_CATEGORIES,
  LISTING_CATEGORY_LABELS,
  MIN_LISTING_PRICE,
  PRICING_UNITS,
  PRICING_UNIT_LABELS,
  SOCIAL_PLATFORM_LABELS,
} from "@/lib/supabase/enums";

export interface ListingFormState {
  error?: string;
}

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

const CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD", "SGD", "HKD", "JPY"];

export function ListingForm({
  action,
  initialListing,
  socialAccounts,
  websiteUrl,
  submitLabel,
  pendingLabel,
}: {
  action: (
    prevState: ListingFormState,
    formData: FormData
  ) => Promise<ListingFormState>;
  initialListing?: Listing;
  socialAccounts: SocialAccount[];
  websiteUrl: string | null;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const defaultPlacement = initialListing?.social_account_id
    ? `account:${initialListing.social_account_id}`
    : initialListing?.is_website_placement
      ? "website"
      : initialListing
        ? "other"
        : "";

  return (
    <form action={formAction} className="flex flex-col gap-5">
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
            <a href="/dashboard/profile" className="underline">
              profile
            </a>{" "}
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
          <a href="/dashboard/profile" className="underline">
            profile
          </a>
          ) — e.g. a crafts creator can still take fashion or food ads.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {LISTING_CATEGORIES.map((category) => (
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
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price_amount" className={labelClass}>
            Price
          </label>
          <input
            id="price_amount"
            name="price_amount"
            type="number"
            step="0.01"
            min={MIN_LISTING_PRICE}
            required
            defaultValue={initialListing?.price_amount}
            className={inputClass}
          />
          <p className="text-xs text-zinc-500">Minimum ${MIN_LISTING_PRICE}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price_currency" className={labelClass}>
            Currency
          </label>
          <select
            id="price_currency"
            name="price_currency"
            required
            defaultValue={initialListing?.price_currency ?? "USD"}
            className={inputClass}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pricing_unit" className={labelClass}>
            Pricing unit
          </label>
          <select
            id="pricing_unit"
            name="pricing_unit"
            required
            defaultValue={initialListing?.pricing_unit ?? "one_time"}
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

      {initialListing && initialListing.media_urls.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>Uploaded media</p>
          <div className="grid grid-cols-4 gap-3">
            {initialListing.media_urls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="media" className={labelClass}>
          {initialListing
            ? "Add more media (optional, appended after existing ones)"
            : "Media (optional, multiple allowed)"}
        </label>
        <input
          id="media"
          name="media"
          type="file"
          accept="image/*,video/*"
          multiple
          className={inputClass}
        />
      </div>

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
