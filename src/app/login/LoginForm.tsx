"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/PasswordInput";
import { OAuthButtons } from "@/components/OAuthButtons";
import { Turnstile } from "@/components/Turnstile";
import {
  loginAction,
  sendSignInLinkAction,
  verifySignInCodeAction,
  type LoginState,
  type SignInLinkState,
  type VerifyCodeState,
} from "./actions";

const initialState: LoginState = {};

export function LoginForm({ next, startWithCode }: { next?: string; startWithCode?: boolean }) {
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

      <SignInLinkForm next={next} startWithCode={startWithCode} />

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

        <Turnstile resetKey={state} />

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

// 免密码登录(没设过密码的 guest 买家,或者忘了密码的人):发一封带登录链接和验证码(位数按 Supabase 设置,目前是 8 位)的
// 邮件;点链接,或者回到这里填验证码都能登录。默认收起。
function SignInLinkForm({ next, startWithCode }: { next?: string; startWithCode?: boolean }) {
  const [open, setOpen] = useState(!!startWithCode);
  const [email, setEmail] = useState("");
  const [showCode, setShowCode] = useState(!!startWithCode);
  const [linkState, linkAction, linkPending] = useActionState<SignInLinkState, FormData>(
    async (prev, formData) => {
      const result = await sendSignInLinkAction(prev, formData);
      if (result.sent) setShowCode(true);
      return result;
    },
    {}
  );
  const [codeState, codeAction, codePending] = useActionState<VerifyCodeState, FormData>(
    verifySignInCodeAction,
    {}
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-900"
      >
        Forgot password or bought as a guest? Email me a sign-in link
      </button>
    );
  }

  const inputClass =
    "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4">
      {!showCode ? (
        <form action={linkAction} className="flex flex-col gap-2">
          <label htmlFor="link_email" className="text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            id="link_email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <Turnstile resetKey={linkState} />
          {linkState.error && <p className="text-sm text-red-600">{linkState.error}</p>}
          <button
            type="submit"
            disabled={linkPending}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {linkPending ? "Sending…" : "Send sign-in email"}
          </button>
          <button
            type="button"
            onClick={() => setShowCode(true)}
            className="text-xs text-zinc-500 underline"
          >
            I already have a code
          </button>
        </form>
      ) : (
        <form action={codeAction} className="flex flex-col gap-2">
          {linkState.sent && (
            <p className="text-sm text-green-700">
              If there&apos;s an account for that email, we&apos;ve sent a sign-in link and a
              code. Click the link, or enter the code here — either one works, once. (Check
              your spam folder too.)
              {linkState.quotaNote && (
                <span className="mt-1 block text-xs text-zinc-500">{linkState.quotaNote}</span>
              )}
            </p>
          )}
          {next && <input type="hidden" name="next" value={next} />}
          <label htmlFor="code_email" className="text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            id="code_email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <label htmlFor="code" className="text-sm font-medium text-zinc-700">
            Code from the email
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className={`${inputClass} tracking-widest`}
          />
          <Turnstile resetKey={codeState} />
          {codeState.error && <p className="text-sm text-red-600">{codeState.error}</p>}
          <button
            type="submit"
            disabled={codePending}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {codePending ? "Checking…" : "Log in with code"}
          </button>
          <button
            type="button"
            onClick={() => setShowCode(false)}
            className="text-xs text-zinc-500 underline"
          >
            Send me a new email
          </button>
        </form>
      )}
    </div>
  );
}
