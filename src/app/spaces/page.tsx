import { createClient } from "@/lib/supabase/server";
import { SpaceCard } from "@/components/SpaceCard";
import type { AdSpace } from "@/lib/supabase/types";

export default async function SpacesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ad_spaces")
    .select("*")
    .order("created_at", { ascending: false });

  const spaces = (data ?? []) as AdSpace[];

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        广告位
      </h1>
      <p className="mt-2 text-zinc-600">发现正在招租的实体广告空间</p>

      {error && (
        <p className="mt-8 text-sm text-red-600">
          加载失败:{error.message}
        </p>
      )}

      {!error && spaces.length === 0 && (
        <p className="mt-16 text-center text-zinc-500">
          还没有广告位,来
          <a href="/dashboard/new-space" className="mx-1 underline">
            发布第一个
          </a>
          吧。
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {spaces.map((space) => (
          <SpaceCard key={space.id} space={space} />
        ))}
      </div>
    </div>
  );
}
