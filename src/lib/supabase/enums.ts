/**
 * 数据库真实枚举取值（Database → Enumerated Types 核对过）。
 */

export const USER_ROLES = ["seller", "buyer", "both"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const DEFAULT_USER_ROLE: UserRole = "both";

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

/**
 * MVP v2("HereForAds MVP 产品方案"文档)新模型的枚举 —— listings/orders/payments/messages。
 * 跟上面 ad_spaces 时代的枚举并存,不复用,避免混淆两套完全不同的产品形态。
 */

// 固定类目列表,卖家可多选(标签式),不开放自定义,避免同义词泛滥。
export const LISTING_CATEGORIES = [
  "beauty_skincare",
  "fashion_style",
  "fitness_health",
  "food_beverage",
  "travel",
  "technology_gadgets",
  "gaming",
  "lifestyle",
  "home_decor",
  "parenting_family",
  "education_learning",
  "arts_crafts",
  "business_finance",
  "automotive",
  "sports",
  "music_entertainment",
  "pets_animals",
  "photography",
  "comedy_entertainment",
  "other",
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const LISTING_CATEGORY_LABELS: Record<ListingCategory, string> = {
  beauty_skincare: "Beauty & Skincare",
  fashion_style: "Fashion & Style",
  fitness_health: "Fitness & Health",
  food_beverage: "Food & Beverage",
  travel: "Travel",
  technology_gadgets: "Technology & Gadgets",
  gaming: "Gaming",
  lifestyle: "Lifestyle",
  home_decor: "Home & Decor",
  parenting_family: "Parenting & Family",
  education_learning: "Education & Learning",
  arts_crafts: "Arts & Crafts",
  business_finance: "Business & Finance",
  automotive: "Automotive",
  sports: "Sports",
  music_entertainment: "Music & Entertainment",
  pets_animals: "Pets & Animals",
  photography: "Photography",
  comedy_entertainment: "Comedy & Entertainment",
  other: "Other",
};

// 计价单位。one_time 不占用日历;daily/weekly/monthly 是"占用式",需要日历判断档期冲突。
// 后续如果加拍卖模式,预计会加一个 "auction" 值 —— 这版先不实现,只是不把字段设计堵死。
export const PRICING_UNITS = ["one_time", "daily", "weekly", "monthly"] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

export const PRICING_UNIT_LABELS: Record<PricingUnit, string> = {
  one_time: "One-time",
  daily: "Per day",
  weekly: "Per week",
  monthly: "Per month",
};

export const LISTING_STATUSES = ["draft", "active", "paused"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "草稿(Stripe 未开通,买家不可见)",
  active: "已发布",
  paused: "已下架",
};

// 托管式交易状态机,见产品方案文档"交易状态机"一节。
export const LISTING_ORDER_STATUSES = [
  "pending_payment",
  "paid_in_escrow",
  "delivered",
  "confirmed",
  "released",
  "expired_auto_confirmed",
] as const;
export type ListingOrderStatus = (typeof LISTING_ORDER_STATUSES)[number];

export const LISTING_ORDER_STATUS_LABELS: Record<ListingOrderStatus, string> = {
  pending_payment: "待支付",
  paid_in_escrow: "托管中",
  delivered: "卖家已交付,待买家确认",
  confirmed: "买家已确认",
  released: "已放款",
  expired_auto_confirmed: "超时自动确认",
};

// 最低发布价 —— 纯技术防呆(留一点余量在 Stripe 自己的最低收款额 $0.50 之上),
// 不是商业门槛:扣费顺序是先扣 Stripe 实报手续费、再扣平台佣金,两项都从卖家应得里出,
// 平台佣金收入恒定不受客单价影响,低价商品到手净额薄不薄是卖家自己的选择。
export const MIN_LISTING_PRICE = 0.99;

// 平台佣金比例,参考 Etsy(6.5% 交易费+3%+$0.25 支付处理费,总负担约 10-12%)取上限。
export const PLATFORM_COMMISSION_RATE = 0.12;

// 买家交付后未确认的自动放款超时天数,对齐 Fiverr。
export const AUTO_CONFIRM_DAYS = 3;
