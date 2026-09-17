"use client";

import { useActionState } from "react";
import {
  sendListingMessageAction,
  type SendMessageState,
} from "@/app/listings/[id]/actions";

export function ContactSellerForm({ listingId }: { listingId: string }) {
  const [state, formAction, pending] = useActionState<
    SendMessageState,
    FormData
  >(sendListingMessageAction, {});

  if (state.success) {
    return (
      <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
        Message sent — the seller can reply from their inbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="listing_id" value={listingId} />
      <textarea
        name="body"
        rows={3}
        placeholder="Ask the seller a question about this listing…"
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
      />
      <input
        type="file"
        name="image"
        accept="image/*"
        className="text-xs text-zinc-500"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
