// 订单卡片、消息列表里的广告小封面图(产品负责人 2026-09-25 要求:卖家/买家对自己的
// 产品图更有记忆,一眼能认出是哪条广告)。封面是视频时显示视频第一帧,没有媒体时显示灰块。
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov)(\?|$)/i;

export function ListingThumb({ url, size = 48 }: { url?: string | null; size?: number }) {
  const style = { width: size, height: size };
  const className = "shrink-0 rounded-lg bg-zinc-100 object-cover";
  if (!url) {
    return <div style={style} className={className} aria-hidden />;
  }
  if (VIDEO_EXTENSIONS.test(url)) {
    return (
      <video
        src={`${url}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        style={style}
        className={className}
        aria-hidden
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" loading="lazy" style={style} className={className} />;
}

/** listings.media_urls 的第一张当封面。 */
export function coverOf(mediaUrls: string[] | null | undefined): string | null {
  return mediaUrls?.[0] ?? null;
}
