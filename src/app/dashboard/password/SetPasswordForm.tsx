"use client";

import { useActionState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { setPasswordAction, type SetPasswordState } from "./actions";

export function SetPasswordForm({ submitLabel }: { submitLabel: string }) {
  const [state, formAction, pending] = useActionState<SetPasswordState, FormData>(
    setPasswordAction,
    {}
  );
  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <PasswordInput id="password" name="password" label="New password" autoComplete="new-password" />
      <PasswordInput
        id="confirm_password"
        name="confirm_password"
        label="Confirm new password"
        autoComplete="new-password"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
