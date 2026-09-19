"use client";

import { useActionState, useState } from "react";
import {
  AD_TYPES,
  AD_TYPE_LABELS,
  CURRENCIES,
  PRICE_CARD_PLATFORM_OPTIONS,
} from "@/lib/supabase/enums";
import type { PriceCardItem } from "@/lib/supabase/types";
import { PriceCardItemRow } from "./PriceCardItemRow";
import { addPriceCardItemAction, type PriceCardItemFormState } from "./actions";

const itemInitialState: PriceCardItemFormState = {};

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function PriceCardManager({ items }: { items: PriceCardItem[] }) {
  const [itemState, itemFormAction, itemPending] = useActionState(
    addPriceCardItemAction,
    itemInitialState
  );
  const [platformChoice, setPlatformChoice] = useState("");

  return (
    <div className="flex flex-col gap-6">
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <PriceCardItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      <form
        action={itemFormAction}
        className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-200 p-4"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ad_type" className={labelClass}>
            Ad type
          </label>
          <select id="ad_type" name="ad_type" required defaultValue="" className={inputClass}>
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
          <label htmlFor="platform_choice" className={labelClass}>
            Platform (optional)
          </label>
          <select
            id="platform_choice"
            value={platformChoice}
            onChange={(e) => setPlatformChoice(e.target.value)}
            className={inputClass}
          >
            <option value="">Not specified</option>
            {PRICE_CARD_PLATFORM_OPTIONS.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
            <option value="other">Other</option>
          </select>
          {platformChoice === "other" ? (
            <input
              name="platform"
              type="text"
              required
              placeholder="Type the platform name"
              className={inputClass}
            />
          ) : (
            <input type="hidden" name="platform" value={platformChoice} />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price_currency" className={labelClass}>
            Currency
          </label>
          <select
            id="price_currency"
            name="price_currency"
            required
            defaultValue="USD"
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
          <label htmlFor="price_amount" className={labelClass}>
            Starting price
          </label>
          <input
            id="price_amount"
            name="price_amount"
            type="number"
            step="0.01"
            min={0}
            required
            placeholder="e.g. 20"
            className={inputClass}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor="note" className={labelClass}>
            Note (optional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            placeholder="e.g. Final price depends on requirements — message me for a quote"
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          {itemState.error && (
            <p className="mb-2 text-sm text-red-600">{itemState.error}</p>
          )}
          <button
            type="submit"
            disabled={itemPending}
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            {itemPending ? "Adding…" : "+ Add price row"}
          </button>
        </div>
      </form>
    </div>
  );
}
