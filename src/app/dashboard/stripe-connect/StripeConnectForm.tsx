"use client";

import { useActionState } from "react";
import {
  startStripeOnboardingAction,
  type StripeConnectState,
} from "./actions";
import { STRIPE_SUPPORTED_COUNTRIES } from "@/lib/stripe/countries";

export function StripeConnectForm({
  hasAccount,
  submitLabel,
}: {
  hasAccount: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<
    StripeConnectState,
    FormData
  >(startStripeOnboardingAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {!hasAccount && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="country" className="text-sm font-medium text-zinc-700">
            Country / region for payouts
          </label>
          <select
            id="country"
            name="country"
            required
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
          >
            <option value="">Select a country</option>
            {STRIPE_SUPPORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">
            Mainland China isn&apos;t supported by Stripe Connect payouts yet.
          </p>
        </div>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Redirecting to Stripe…" : submitLabel}
      </button>
    </form>
  );
}
