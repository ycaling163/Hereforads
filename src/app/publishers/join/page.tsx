import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Get Paid For Your Ad Space",
  description:
    "Publish your bio link, page space, or content slot for free and get discovered by brands ready to pay for it — set your own price, paid safely through escrow.",
};

const BENEFITS = [
  {
    emoji: "💰",
    title: "Get found by brands",
    body: "Buyers come here specifically to book ad space — you're not shouting into the void hoping someone notices.",
  },
  {
    emoji: "🎯",
    title: "You're in control",
    body: "Set your own price, pick what kind of ads you'll accept, and publish only what you actually want to sell.",
  },
  {
    emoji: "🔒",
    title: "Get paid safely",
    body: "Payments are held in escrow until you deliver and the buyer confirms — no invoices to chase, no chargebacks to fear.",
  },
  {
    emoji: "⚡",
    title: "Free, and fast",
    body: "No listing fees, no subscription. Publishing your first ad space takes minutes.",
  },
];

const STEPS = [
  {
    title: "Create your free account",
    body: "Just an email and password — no application, no waiting for approval to sign up.",
  },
  {
    title: "Publish your ad space",
    body: "Describe what you're offering (a bio link, a page placement, a shoutout — whatever it is) and set your price.",
  },
  {
    title: "Get booked, get paid",
    body: "Brands find you and buy directly. Funds are released to you once you deliver and the buyer confirms.",
  },
];

export default async function JoinAsPublisherPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const primaryCtaHref = user
    ? "/dashboard/new-listing"
    : `/register?next=${encodeURIComponent("/dashboard/new-listing")}`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pt-16 pb-12 text-center">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          For creators, account owners &amp; site operators
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
          Get paid for the space you already have.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-zinc-600">
          Brands are looking for ad space to buy right now. List yours for
          free and let them come to you.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href={primaryCtaHref}
            className="rounded-full bg-zinc-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Join free — publish your ad space
          </Link>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Free to join. Free to publish. No subscription, ever.
        </p>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <div
              key={benefit.title}
              className="rounded-2xl border border-zinc-200 p-6"
            >
              <span className="text-2xl">{benefit.emoji}</span>
              <h3 className="mt-3 text-base font-semibold text-zinc-900">
                {benefit.title}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-zinc-600">
                {benefit.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-900">
          How it works
        </h2>
        <div className="mt-8 flex flex-col gap-8">
          {STEPS.map((step, index) => (
            <div key={step.title} className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="font-semibold text-zinc-900">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pb-20 pt-4 text-center">
        <Link
          href={primaryCtaHref}
          className="rounded-full bg-zinc-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Join free — publish your ad space
        </Link>
      </div>
    </div>
  );
}
