"use client";

import { useActionState, useState } from "react";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import {
  AD_TYPES,
  AD_TYPE_LABELS,
  PRICE_CARD_PLATFORM_OPTIONS,
} from "@/lib/supabase/enums";
import type { PriceCardItem } from "@/lib/supabase/types";
import {
  deletePriceCardItemAction,
  updatePriceCardItemAction,
  type PriceCardItemFormState,
} from "./actions";

const initialState: PriceCardItemFormState = {};

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function PriceCardItemRow({ item }: { item: PriceCardItem }) {
  const [isEditing, setIsEditing] = useState(false);
  const updateAction = updatePriceCardItemAction.bind(null, item.id);
  const [state, formAction, pending] = useActionState(updateAction, initialState);
  const [platformChoice, setPlatformChoice] = useState(
    (PRICE_CARD_PLATFORM_OPTIONS as readonly string[]).includes(item.platform)
      ? item.platform
      : "other"
  );

  if (!isEditing) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm">
        <span className="flex flex-1 items-center justify-between gap-2 pr-2">
          <span className="text-zinc-700">
            {AD_TYPE_LABELS[item.ad_type]} — {item.platform}
          </span>
          <span className="font-medium text-zinc-900">{item.price}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-900"
          >
            Edit
          </button>
          <ConfirmSubmitForm
            action={deletePriceCardItemAction.bind(null, item.id)}
            confirmMessage="Delete this price row?"
            label="Delete"
            className="text-xs text-zinc-400 transition-colors hover:text-red-600"
          />
        </span>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-300 p-4">
      <form action={formAction} className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`ad_type-${item.id}`} className={labelClass}>
            Ad type
          </label>
          <select
            id={`ad_type-${item.id}`}
            name="ad_type"
            required
            defaultValue={item.ad_type}
            className={inputClass}
          >
            {AD_TYPES.map((type) => (
              <option key={type} value={type}>
                {AD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`platform_choice-${item.id}`} className={labelClass}>
            Platform
          </label>
          <select
            id={`platform_choice-${item.id}`}
            value={platformChoice}
            onChange={(e) => setPlatformChoice(e.target.value)}
            required
            className={inputClass}
          >
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
              defaultValue={
                (PRICE_CARD_PLATFORM_OPTIONS as readonly string[]).includes(item.platform)
                  ? ""
                  : item.platform
              }
              placeholder="Type the platform name"
              className={inputClass}
            />
          ) : (
            <input type="hidden" name="platform" value={platformChoice} />
          )}
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor={`price-${item.id}`} className={labelClass}>
            Starting price
          </label>
          <input
            id={`price-${item.id}`}
            name="price"
            type="text"
            required
            defaultValue={item.price}
            className={inputClass}
          />
        </div>
        <div className="col-span-2 flex items-center gap-3">
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}
