"use client";

import { useActionState, useState } from "react";
import {
  markDeliveredAction,
  updateProofUrlAction,
  type DeliverOrderState,
} from "@/app/dashboard/sales/actions";

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const buttonClass =
  "self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50";

export function DeliverOrderForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<
    DeliverOrderState,
    FormData
  >(markDeliveredAction, {});

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input
        type="text"
        inputMode="url"
        name="proof_url"
        required
        placeholder="Link the buyer can check, e.g. youtube.com/shorts/…"
        className={inputClass}
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Mark as delivered"}
      </button>
    </form>
  );
}

// 交付后、放款前修改交付链接(见 updateProofUrlAction)。默认收起,点 "Change link" 才展开。
export function EditProofUrlForm({
  orderId,
  currentUrl,
}: {
  orderId: string;
  currentUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    DeliverOrderState,
    FormData
  >(updateProofUrlAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 self-start text-xs text-zinc-500 underline"
      >
        Change link
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input
        type="text"
        inputMode="url"
        name="proof_url"
        required
        defaultValue={currentUrl}
        className={inputClass}
      />
      <p className="text-xs text-zinc-500">
        Changing the link restarts the buyer&apos;s 3-day check, and we&apos;ll email them the
        new link. The old link stays on record.
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save new link"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm text-zinc-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
