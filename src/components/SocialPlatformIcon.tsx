import type { IconType } from "react-icons";
import {
  SiInstagram,
  SiTiktok,
  SiYoutube,
  SiXiaohongshu,
  SiSinaweibo,
  SiWechat,
  SiBilibili,
} from "react-icons/si";
import { HiOutlineGlobeAlt } from "react-icons/hi2";
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "@/lib/supabase/enums";

// Real brand marks (via react-icons' Simple Icons set), each tinted with its
// platform's brand color. Douyin has no dedicated glyph in Simple Icons —
// it's ByteDance's own music-note mark, near-identical to TikTok's, so we
// reuse that icon in black rather than invent a shape. "Other" isn't a real
// platform, so it gets a plain generic globe icon instead.
const PLATFORM_ICON: Record<SocialPlatform, { Icon: IconType; color: string }> = {
  instagram: { Icon: SiInstagram, color: "#E4405F" },
  tiktok: { Icon: SiTiktok, color: "#000000" },
  youtube: { Icon: SiYoutube, color: "#FF0000" },
  douyin: { Icon: SiTiktok, color: "#000000" },
  xiaohongshu: { Icon: SiXiaohongshu, color: "#FF2442" },
  weibo: { Icon: SiSinaweibo, color: "#E6162D" },
  wechat_channel: { Icon: SiWechat, color: "#07C160" },
  bilibili: { Icon: SiBilibili, color: "#00A1D6" },
  other: { Icon: HiOutlineGlobeAlt, color: "#71717A" },
};

export function SocialPlatformIcon({
  platform,
  className = "h-4 w-4",
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  const { Icon, color } = PLATFORM_ICON[platform] ?? PLATFORM_ICON.other;

  return (
    <Icon
      className={`shrink-0 ${className}`}
      style={{ color }}
      aria-label={SOCIAL_PLATFORM_LABELS[platform] ?? platform}
    />
  );
}
