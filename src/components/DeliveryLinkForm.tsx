"use client";

import { useActionState } from "react";
import { addDeliveryLinkAction, type DeliverOrderState } from "@/app/dashboard/sales/actions";

export function DeliveryLinkForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<
    DeliverOrderState,
    FormData
  >(addDeliveryLinkAction, {});

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input
        type="url"
        name="proof_url"
        required
        placeholder="Optional: link the buyer can check (e.g. your live post URL)"
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save link"}
      </button>
    </form>
  );
}
