"use client";

import { useActionState } from "react";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import type { PriceCardItem } from "@/lib/supabase/types";
import { PriceCardItemRow } from "./PriceCardItemRow";
import {
  addPriceCardItemAction,
  removePriceCardImageAction,
  updatePriceCardImageAction,
  type PriceCardImageState,
  type PriceCardItemFormState,
} from "./actions";

const itemInitialState: PriceCardItemFormState = {};
const imageInitialState: PriceCardImageState = {};

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function PriceCardManager({
  items,
  imageUrl,
}: {
  items: PriceCardItem[];
  imageUrl: string | null;
}) {
  const [itemState, itemFormAction, itemPending] = useActionState(
    addPriceCardItemAction,
    itemInitialState
  );
  const [imageState, imageFormAction, imagePending] = useActionState(
    updatePriceCardImageAction,
    imageInitialState
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p className={labelClass}>Background image (optional)</p>
        <p className="text-xs text-zinc-500">
          Shown behind your price list on your public profile — e.g. a
          branded rate-card graphic you&apos;ve already designed.
        </p>
        {imageUrl && (
          <div className="h-28 w-full max-w-sm overflow-hidden rounded-xl bg-zinc-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <form action={imageFormAction} className="flex flex-wrap items-center gap-3">
          <input
            name="price_card_image"
            type="file"
            accept="image/*"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={imagePending}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            {imagePending ? "Uploading…" : "Upload"}
          </button>
          {imageUrl && (
            <ConfirmSubmitForm
              action={removePriceCardImageAction}
              confirmMessage="Remove the price card background image?"
              label="Remove"
              className="text-sm text-zinc-500 transition-colors hover:text-red-600"
            />
          )}
        </form>
        {imageState.error && <p className="text-sm text-red-600">{imageState.error}</p>}
      </div>

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
          <label htmlFor="title" className={labelClass}>
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g. Static Image Ad (TikTok)"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price" className={labelClass}>
            Price
          </label>
          <input
            id="price"
            name="price"
            type="text"
            required
            placeholder="e.g. £20"
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
