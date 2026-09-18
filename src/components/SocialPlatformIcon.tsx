import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/supabase/enums";

// Small monogram badges (not the real brand logos — avoids trademarked art
// while still giving each platform a distinct, recognizable color + mark).
const PLATFORM_STYLE: Record<SocialPlatform, { abbr: string; className: string }> = {
  instagram: {
    abbr: "IG",
    className: "bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400",
  },
  tiktok: { abbr: "TT", className: "bg-zinc-900" },
  youtube: { abbr: "YT", className: "bg-red-600" },
  douyin: { abbr: "DY", className: "bg-zinc-900" },
  xiaohongshu: { abbr: "XH", className: "bg-red-500" },
  weibo: { abbr: "WB", className: "bg-orange-600" },
  wechat_channel: { abbr: "WX", className: "bg-emerald-500" },
  bilibili: { abbr: "BL", className: "bg-sky-500" },
  other: { abbr: "•", className: "bg-zinc-400" },
};

export function SocialPlatformIcon({
  platform,
  className = "h-5 w-5 text-[9px]",
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  const style = PLATFORM_STYLE[platform] ?? PLATFORM_STYLE.other;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${style.className} ${className}`}
      title={SOCIAL_PLATFORM_LABELS[platform] ?? platform}
    >
      {style.abbr}
    </span>
  );
}
