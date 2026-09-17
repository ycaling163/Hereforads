"use client";

import { useActionState } from "react";
import type { ReplyState } from "@/app/dashboard/messages/actions";

export function ReplyForm({
  action,
}: {
  action: (prevState: ReplyState, formData: FormData) => Promise<ReplyState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-2">
      <textarea
        name="body"
        rows={3}
        placeholder="Write a reply…"
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
        className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Reply"}
      </button>
    </form>
  );
}
