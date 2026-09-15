/**
 * 数据库真实枚举取值（Database → Enumerated Types 核对过）。
 */

export const USER_ROLES = ["seller", "buyer", "both"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const DEFAULT_USER_ROLE: UserRole = "both";

export const AD_SPACE_TYPES = [
  "wall",
  "picture_frame",
  "clothing_pocket",
  "clothing_back",
  "face_left",
  "face_right",
  "other",
] as const;
export type AdSpaceType = (typeof AD_SPACE_TYPES)[number];

// orders.status 目前在库里是自由文本,没有对应的 Postgres 枚举类型,
// 这里列出的是代码里实际会写入/读取的取值。
export const ORDER_STATUSES = [
  "pending_payment",
  "confirmed",
  "rejected",
  "paid",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "待卖家确认",
  confirmed: "已确认(待付款)",
  rejected: "已拒绝",
  paid: "已付款",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

export const AD_SPACE_STATUSES = [
  "available",
  "reserved",
  "active_campaign",
  "inactive",
] as const;
export type AdSpaceStatus = (typeof AD_SPACE_STATUSES)[number];

export const SOCIAL_PLATFORMS = [
  "douyin",
  "xiaohongshu",
  "weibo",
  "wechat_channel",
  "youtube",
  "instagram",
  "tiktok",
  "bilibili",
  "other",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const AD_SPACE_TYPE_LABELS: Record<AdSpaceType, string> = {
  wall: "墙面",
  picture_frame: "画框",
  clothing_pocket: "衣服口袋",
  clothing_back: "衣服背面",
  face_left: "左脸",
  face_right: "右脸",
  other: "其他",
};

export const AD_SPACE_STATUS_LABELS: Record<AdSpaceStatus, string> = {
  available: "招租中",
  reserved: "已预订",
  active_campaign: "投放中",
  inactive: "已下线",
};

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  weibo: "微博",
  wechat_channel: "微信视频号",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  bilibili: "哔哩哔哩",
  other: "其他",
};
