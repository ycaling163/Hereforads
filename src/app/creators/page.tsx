import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CreatorCard } from "@/components/CreatorCard";
import { getActiveCreators } from "@/lib/creatorCards";

export const metadata: Metadata = {
  title: "Creators",
  description:
    "Browse creators and sellers with live ad spaces — reach, content focus, and pricing at a glance.",
};

export default async function CreatorsPage() {
  const supabase = await createClient();
  const creators = await getActiveCreators(supabase);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Creators
      </h1>
      <p className="mt-2 text-zinc-600">
        Creators and sellers with live ad spaces — browse by reach, content
        focus, and price
      </p>

      {creators.length === 0 && (
        <p className="mt-16 text-center text-zinc-500">
          No creators yet — check back soon.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {creators.map((creator) => (
          <CreatorCard key={creator.profile.id} creator={creator} />
        ))}
      </div>
    </div>
  );
}
