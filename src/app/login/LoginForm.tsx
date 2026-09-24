"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/PasswordInput";
import { OAuthButtons } from "@/components/OAuthButtons";
import {
  loginAction,
  sendSignInLinkAction,
  type LoginState,
  type SignInLinkState,
} from "./actions";

const initialState: LoginState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState
  );

  return (
    <div className="flex flex-col gap-6">
      <OAuthButtons next={next} />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-200" />
        <span className="text-xs font-medium text-zinc-400">OR</span>
        <div className="h-px flex-1 bg-zinc-200" />
      </div>

      <SignInLinkForm />

      <form action={formAction} className="flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
        </div>
        <PasswordInput
          id="password"
          name="password"
          label="Password"
          autoComplete="current-password"
        />

        {state.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Logging in…" : "Log in"}
        </button>

        <p className="text-center text-sm text-zinc-600">
          Bought as a guest?{" "}
          <Link href="/orders/find" className="font-medium text-zinc-900 underline">
            Find your order
          </Link>
        </p>

        <p className="text-center text-sm text-zinc-600">
          Don&apos;t have an account?{" "}
          <Link
            href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
            className="font-medium text-zinc-900 underline"
          >
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}

// 免密码登录链接(没设过密码的 guest 买家,或者忘了密码的人)。默认收起。
function SignInLinkForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SignInLinkState, FormData>(
    sendSignInLinkAction,
    {}
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-900"
      >
        Email me a sign-in link (no password)
      </button>
    );
  }

  if (state.sent) {
    return (
      <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
        If there&apos;s an account for that email, a sign-in link is on its way. Check your
        inbox (and spam folder).
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-4">
      <label htmlFor="link_email" className="text-sm font-medium text-zinc-700">
        Email
      </label>
      <input
        id="link_email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
