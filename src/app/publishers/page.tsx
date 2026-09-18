import type { Metadata } from "next";
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
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Publishers
      </h1>
      <p className="mt-2 text-zinc-600">
        Publishers with live ad spaces — browse by reach, content focus, and
        price
      </p>

      {publishers.length === 0 && (
        <p className="mt-16 text-center text-zinc-500">
          No publishers yet — check back soon.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {publishers.map((publisher) => (
          <PublisherCard key={publisher.profile.id} publisher={publisher} />
        ))}
      </div>
    </div>
  );
}
