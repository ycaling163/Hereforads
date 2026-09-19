"use client";

import { useActionState, useState } from "react";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
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

  if (!isEditing) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm">
        <span className="flex flex-1 items-center justify-between gap-2 pr-2">
          <span className="text-zinc-700">{item.title}</span>
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
          <label htmlFor={`title-${item.id}`} className={labelClass}>
            Title
          </label>
          <input
            id={`title-${item.id}`}
            name="title"
            type="text"
            required
            defaultValue={item.title}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`price-${item.id}`} className={labelClass}>
            Price
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
