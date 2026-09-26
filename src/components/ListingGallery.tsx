"use client";

import { useState } from "react";
import { MediaPreview, PlayBadge } from "@/components/MediaPreview";
import { isVideoUrl } from "@/lib/listingMedia";

// 广告详情页的媒体画廊:大图区显示当前选中的一张(视频可以直接播放),下面一排缩略图
// 列出全部图片和视频(包括封面),点哪张看哪张。之前大图只显示第一张、视频被当成 <img>
// 渲染成裂图,买家实际上只能看到一张。
export function ListingGallery({ media, title }: { media: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const current = media[active] ?? media[0];

  if (!current) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
        No image
      </div>
    );
  }

  const go = (delta: -1 | 1) => setActive((index) => (index + delta + media.length) % media.length);

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-zinc-100">
        {isVideoUrl(current) ? (
          <video
            key={current}
            src={current}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full bg-black object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={title} className="h-full w-full object-cover" />
        )}

        {media.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous"
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-zinc-800 shadow-sm backdrop-blur hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-zinc-800 shadow-sm backdrop-blur hover:bg-white"
            >
              ›
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-zinc-900/70 px-2.5 py-0.5 text-xs font-medium text-white">
              {active + 1} / {media.length}
            </span>
          </>
        )}
      </div>

      {media.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5">
          {media.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Show ${isVideoUrl(url) ? "video" : "image"} ${index + 1}`}
              aria-current={index === active}
              className={`relative overflow-hidden rounded-lg border-2 transition-colors ${
                index === active ? "border-zinc-900" : "border-transparent hover:border-zinc-300"
              }`}
            >
              <MediaPreview url={url} alt="" className="aspect-square w-full object-cover" />
              {isVideoUrl(url) && <PlayBadge />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
