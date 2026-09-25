"use client";

import { useActionState, type ReactNode } from "react";
import {
  submitContactMessageAction,
  type ContactFormState,
} from "@/lib/contact/actions";
import { Turnstile } from "@/components/Turnstile";

// intro:表单上方的说明文字;提交成功后跟表单一起隐藏,只留感谢语。
export function ContactForm({ intro }: { intro?: ReactNode }) {
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(
    submitContactMessageAction,
    {}
  );

  if (state.success) {
    return (
      <p className="mt-2 text-sm text-zinc-600">
        Thanks — we&rsquo;ve got your message and will get back to you by
        email.
      </p>
    );
  }

  return (
    <>
      {intro}
      <form action={formAction} className="mt-8 flex flex-col gap-2">
        <input
          type="text"
          name="name"
          placeholder="Your name"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        />
        <input
          type="email"
          name="email"
          placeholder="Your email"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        />
        <textarea
          name="message"
          rows={3}
          placeholder="How can we help?"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        />
        <Turnstile resetKey={state} />
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send message"}
        </button>
      </form>
    </>
  );
}
