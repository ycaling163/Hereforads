"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
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
  duplicatedFromTitle,
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
  // Set when this form was pre-filled by copying another listing (not
  // editing it) — shows a reminder to double-check fields that shouldn't
  // just be carried over blindly, like which platform this new one is for.
  duplicatedFromTitle?: string;
  socialAccounts: SocialAccount[];
  websiteUrl: string | null;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [keptMedia, setKeptMedia] = useState(initialListing?.media_urls ?? []);

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

      {keptMedia.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>
            {duplicatedFromTitle ? "Copied media" : "Uploaded media"}
          </p>
          {duplicatedFromTitle && (
            <p className="text-xs text-zinc-500">
              The first image is used as the cover. Remove and re-upload to
              replace it (e.g. with a platform-specific screenshot).
            </p>
          )}
          <div className="grid grid-cols-4 gap-3">
            {keptMedia.map((url) => (
              <div key={url} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="aspect-square w-full rounded-lg object-cover"
                />
                <input type="hidden" name="existing_media" value={url} />
                <button
                  type="button"
                  onClick={() =>
                    setKeptMedia((current) => current.filter((kept) => kept !== url))
                  }
                  aria-label="Remove image"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="media" className={labelClass}>
          {keptMedia.length > 0
            ? "Add more media (optional, appended after the ones above)"
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
