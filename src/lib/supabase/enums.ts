/**
 * TODO: 这几个是数据库里自定义枚举类型（user_role / ad_space_type /
 * ad_space_status / social_platform）的取值，目前是按常见场景猜的占位值。
 * 请在 Supabase 后台 Database → Enumerated Types 里核对真实取值，
 * 不一致的话改这一个文件就行，其他地方都是引用这里的常量。
 */

export const USER_ROLES = ["buyer", "seller", "both"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const DEFAULT_USER_ROLE: UserRole = "both";

export const AD_SPACE_TYPES = [
  "wall",
  "window",
  "storefront",
  "billboard",
  "vehicle",
  "other",
] as const;
export type AdSpaceType = (typeof AD_SPACE_TYPES)[number];

export const AD_SPACE_STATUSES = [
  "pending",
  "active",
  "sold",
  "expired",
] as const;
export type AdSpaceStatus = (typeof AD_SPACE_STATUSES)[number];

export const SOCIAL_PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "facebook",
  "wechat",
  "xiaohongshu",
  "other",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const AD_SPACE_TYPE_LABELS: Record<AdSpaceType, string> = {
  wall: "墙面",
  window: "橱窗",
  storefront: "门店/店面",
  billboard: "广告牌",
  vehicle: "车身",
  other: "其他",
};

export const AD_SPACE_STATUS_LABELS: Record<AdSpaceStatus, string> = {
  pending: "审核中",
  active: "招租中",
  sold: "已出租",
  expired: "已下架",
};

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X / Twitter",
  facebook: "Facebook",
  wechat: "微信",
  xiaohongshu: "小红书",
  other: "其他",
};
