import { isVideoUrl } from "@/lib/listingMedia";

// 广告媒体的静态预览(封面、缩略图):图片直接显示;视频显示第一帧(不自动播放),
// 之前视频被当成 <img> 渲染,显示成一张裂图。
export function MediaPreview({
  url,
  alt = "",
  className,
  isVideo = isVideoUrl(url),
}: {
  url: string;
  alt?: string;
  className?: string;
  /** 本地预览(blob: URL)没有扩展名,由调用方直接告诉是不是视频。 */
  isVideo?: boolean;
}) {
  if (isVideo) {
    return (
      <video
        src={url.startsWith("blob:") ? url : `${url}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        className={className}
        aria-label={alt || undefined}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}

export function PlayBadge() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900/60 pl-0.5 text-xs text-white">
        ▶
      </span>
    </span>
  );
}
