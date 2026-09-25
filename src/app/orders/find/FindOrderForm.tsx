"use client";

import { useActionState } from "react";
import { Turnstile } from "@/components/Turnstile";
import { formatOrderNumber } from "@/lib/orders/orderNumber";
import { findOrderAction, type FindOrderState } from "./actions";

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";

export function FindOrderForm({ initialOrderNumber }: { initialOrderNumber?: string }) {
  const [state, formAction, pending] = useActionState<FindOrderState, FormData>(
    findOrderAction,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="order_number" className="text-sm font-medium text-zinc-700">
          Order number
        </label>
        <input
          id="order_number"
          name="order_number"
          required
          defaultValue={initialOrderNumber}
          placeholder={`e.g. ${formatOrderNumber(118)}`}
          autoCapitalize="characters"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          Email you used for the order
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
      </div>
      <Turnstile resetKey={state} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Looking up…" : "Find my order"}
      </button>
    </form>
  );
}
