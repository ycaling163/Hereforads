import Link from "next/link";
import type { AdSpace } from "@/lib/supabase/types";
import { AD_SPACE_STATUS_LABELS } from "@/lib/supabase/enums";
import { approxCnyAmount } from "@/lib/currency";

export function SpaceCard({ space }: { space: AdSpace }) {
  const cover = space.photo_urls?.[0];
  const approxCny = approxCnyAmount(space.price_amount, space.price_currency);

  return (
    <Link
      href={`/spaces/${space.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 transition-shadow hover:shadow-lg"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={space.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
            暂无图片
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          {space.keyword ? (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
              {space.keyword}
            </span>
          ) : (
            <span />
          )}
          <span className="rounded-full bg-zinc-900/5 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
            {AD_SPACE_STATUS_LABELS[space.status] ?? space.status}
          </span>
        </div>
        <h3 className="line-clamp-1 text-base font-semibold text-zinc-900">
          {space.title}
        </h3>
        {space.city && (
          <p className="text-sm text-zinc-500">{space.city}</p>
        )}
        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-semibold text-zinc-900">
              {space.price_amount}
            </span>
            <span className="text-sm text-zinc-500">
              {space.price_currency}
              {space.duration_days ? ` / ${space.duration_days} 天` : ""}
            </span>
          </div>
          {approxCny !== null && (
            <p className="text-xs text-zinc-400">
              约合 ¥{approxCny.toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
