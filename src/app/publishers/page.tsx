import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PublisherCard } from "@/components/PublisherCard";
import { getActivePublishers } from "@/lib/publisherCards";

export const metadata: Metadata = {
  title: "Publishers",
  description:
    "Browse publishers with live ad spaces — reach, content focus, and pricing at a glance.",
};

export default async function PublishersPage() {
  const supabase = await createClient();
  const publishers = await getActivePublishers(supabase);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            Publishers
          </h1>
          <p className="mt-2 text-zinc-600">
            Publishers with live ad spaces — browse by reach, content focus,
            and price
          </p>
        </div>
        <Link
          href="/publishers/join"
          className="shrink-0 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400"
        >
          List your ad space free →
        </Link>
      </div>

      {publishers.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="text-zinc-500">
            No publishers yet — be the first to get discovered.
          </p>
          <Link
            href="/publishers/join"
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Join free — publish your ad space
          </Link>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {publishers.map((publisher) => (
          <PublisherCard key={publisher.profile.id} publisher={publisher} />
        ))}
      </div>
    </div>
  );
}
