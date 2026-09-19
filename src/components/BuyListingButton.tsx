"use client";

import { useActionState } from "react";
import { buyListingAction, type BuyListingState } from "@/app/listings/[id]/actions";

export function BuyListingButton({
  listingId,
  isLoggedIn,
}: {
  listingId: string;
  isLoggedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState<BuyListingState, FormData>(
    buyListingAction,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="listing_id" value={listingId} />
      {!isLoggedIn && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="guest_email" className="text-xs font-medium text-zinc-700">
            Email
          </label>
          <input
            id="guest_email"
            name="guest_email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
          <p className="text-xs text-zinc-500">
            No account needed to buy — we&apos;ll email you a link to track this order.
          </p>
        </div>
      )}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Redirecting to checkout…" : "Buy now"}
      </button>
      <p className="text-center text-xs text-zinc-500">
        Payment is held in escrow until you confirm delivery.
      </p>
    </form>
  );
}
