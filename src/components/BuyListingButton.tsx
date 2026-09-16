"use client";

import { useActionState } from "react";
import { buyListingAction, type BuyListingState } from "@/app/listings/[id]/actions";

export function BuyListingButton({ listingId }: { listingId: string }) {
  const [state, formAction, pending] = useActionState<BuyListingState, FormData>(
    buyListingAction,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="listing_id" value={listingId} />
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
