import { bookingDayStart } from "@/lib/booking";
import { ESCROW_HOLD_DAYS, FREE_CANCEL_HOURS } from "@/config/site";
import type { PayoutHold } from "./types";

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
  douyin: "Douyin",
  xiaohongshu: "Xiaohongshu",
  weibo: "Weibo",
  wechat_channel: "WeChat Channels",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  bilibili: "Bilibili",
  other: "Other",
};

// 结账用的货币列表——`listings.price_currency`/Price Card 价格都是自由文本列
// (不是数据库枚举),这里只是发布表单/Price Card 表单共用的一份下拉选项,原来
// 只在 ListingForm.tsx 里定义,2026-09-19 挪到这里给 Price Card 也复用,避免
// 两处各写一份、以后改动漏掉一边。
export const CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD", "SGD", "HKD", "JPY"];

// Price Card(个人主页价目表,2026-09-19 加)的平台下拉选项——纯 UI 层面的建议
// 列表,不是数据库枚举(`seller_price_card_items.platform` 就是一个 text 列,
// 想填什么都行)。故意不复用上面 SOCIAL_PLATFORMS:那边是"已绑定的真实社交
// 账号"要跟粉丝数据对齐的枚举,这里只是给卖家一份常见平台清单,不用自己想
// 怎么写,选不到就选 Other 自己打字。
export const PRICE_CARD_PLATFORM_OPTIONS = [
  "TikTok",
  "Instagram",
  "YouTube",
  "X (Twitter)",
  "Facebook",
  "Douyin",
  "Xiaohongshu",
  "Weibo",
  "WeChat Channels",
  "Bilibili",
  "Blog / Website",
] as const;

/**
 * MVP v2("HereForAds MVP 产品方案"文档)新模型的枚举 —— listings/orders/payments/messages。
 * 跟上面 ad_spaces 时代的枚举并存,不复用,避免混淆两套完全不同的产品形态。
 */

// 固定类目列表,卖家可多选(标签式),不开放自定义,避免同义词泛滥。`any` 是
// 2026-09-19 加的特殊值("这个位置接任何类目的广告"),跟其他类目互斥——勾了
// `any`,`parseListingFormFields` 会把 categories 强制归一化成只剩 `['any']`
// 这一个元素(不管前端有没有同时勾了别的),这样详情页渲染"Accepts ads
// from"那一行 map 出来天然就只有一个"Any category"标签,不会出现"any + 20
// 个具体类目"堆一起的情况。目前站内没有按类目筛选 listing 的功能,`any` 不
// 涉及任何"筛选时要不要也匹配 any"的额外逻辑,纯展示层面的简化。
export const LISTING_CATEGORIES = [
  "any",
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
  any: "Any category",
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

// 广告类型(2026-09-19 加,产品讨论见 README"广告类型"一节)——固定模板,方便
// 买家跨卖家比较"这是哪种广告",不开放自定义文案。跟 categories(接哪些品牌
// 类目)是两个independent维度:一条 listing 一个 ad_type + 一组 categories。
// `custom` 不是"没填",是卖家主动选的"这个投放位不是标准套餐,买家下单前先
// 私信谈清楚范围/价格"——listing 详情页会在 Buy now 上方提示先私信卖家,但
// 不强制拦掉购买按钮(卖家标了 custom 也可能已经想好了固定价)。老 listing
// (这个字段上线前发布的)这一列是 null,前端按"Other"处理,不强制补录。
export const AD_TYPES = [
  "static_image_ad",
  "video_product_placement",
  "product_intro_video",
  "sponsored_feature",
  "product_test_video",
  "custom",
] as const;
export type AdType = (typeof AD_TYPES)[number];

export const AD_TYPE_LABELS: Record<AdType, string> = {
  static_image_ad: "Static image ad",
  video_product_placement: "Video product placement",
  product_intro_video: "Product introduction in video",
  sponsored_feature: "Sponsored feature",
  product_test_video: "Product test / review video",
  custom: "Custom (discuss with seller)",
};

// pending_review/rejected/removed 是 2026-09-18 加的管理员审核流程用的状态,
// 见 README"管理员系统"一节。draft -> (卖家连好 Stripe 提交) -> pending_review
// -> 管理员 approve -> active,或 reject -> rejected;active 之后管理员随时可以
// remove -> removed(下架违规内容,买家/首页都看不到,但卖家自己在 My listings 还能看到)。
export const LISTING_STATUSES = [
  "draft",
  "pending_review",
  "active",
  "paused",
  "rejected",
  "removed",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Draft (hidden until Stripe is connected)",
  pending_review: "Pending review",
  active: "Live",
  paused: "Paused",
  rejected: "Rejected by moderation",
  removed: "Removed by moderation",
};

// 托管式交易状态机(2026-09-18 二次调整,见 README"平台责任边界"一节的决策记录):
// 一度试过"付款后固定冻结期,不管卖家有没有交付都自动放款",但这样等于卖家什么都不做、
// 光收钱躺 N 天也能拿到钱,买家完全没有信号可以判断要不要提前放款——退回来了。现在的
// 设计:平台仍然不裁定"交付内容好不好"(不验证卖家提交的链接是否属实),但要求卖家先
// 做一次自证式的"我已交付"操作(`delivered`,带一个买家能核对的链接)才能开始计时,
// 免得卖家零操作就能通过超时自动拿到钱。流程:pending_payment -> paid_in_escrow
// (卖家标记交付)-> delivered -> confirmed(内部锁定态,发起 Stripe transfer 前的原子
// 性保护,不代表买家做了什么额外确认)-> released,触发 confirmed 的可以是买家主动
// 提前放款,也可以是定时任务在交付后的确认窗口到期后自动放款。
export const LISTING_ORDER_STATUSES = [
  "pending_payment",
  "paid_in_escrow",
  "delivered",
  "confirmed",
  "released",
  "expired_auto_confirmed",
  "cancelled",
] as const;
export type ListingOrderStatus = (typeof LISTING_ORDER_STATUSES)[number];

export const LISTING_ORDER_STATUS_LABELS: Record<ListingOrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid_in_escrow: "In escrow — awaiting delivery",
  delivered: "Delivered — awaiting buyer confirmation",
  confirmed: "Releasing…",
  released: "Released to seller",
  expired_auto_confirmed: "Released to seller", // 历史遗留标签,当前流程放款一律落在 released
  cancelled: "Cancelled — refunded",
};

// 暂停放款的原因(listing_orders.payout_hold),买卖双方页面和管理员页面共用。
export const PAYOUT_HOLD_LABELS: Record<PayoutHold, string> = {
  dispute: "Payment disputed",
  refund: "Refunded outside the normal flow",
  seller_banned: "Seller account suspended",
  review: "Payout review (new seller or large order)",
};

// 最低发布价和费率在 src/lib/fees.ts / src/config/site.ts(2026-09-23 改成固定费率,按币种区分最低价)。

// 托管确认天数、免费取消小时数在 src/config/site.ts(说明也在那里)。
export { ESCROW_HOLD_DAYS, FREE_CANCEL_HOURS };

/**
 * 免费取消截止时间;订单没付款时返回 null。日历预订的订单(有 start_date)另外要求
 * 取消那一刻离开始日期(英国时间 00:00)还有 24 小时以上(README"日历按天预订"第 5 条),
 * 所以截止时间取"付款后 24 小时"和"开始前 24 小时"里较早的那个;付款时就已经在开始前
 * 24 小时之内的,截止时间早于付款时间,等于不能免费取消。
 */
export function freeCancelDeadline(order: {
  paid_at: string | null;
  start_date?: string | null;
}): Date | null {
  if (!order.paid_at) return null;
  const windowMs = FREE_CANCEL_HOURS * 60 * 60 * 1000;
  const afterPayment = new Date(order.paid_at).getTime() + windowMs;
  if (!order.start_date) return new Date(afterPayment);
  const beforeStart = bookingDayStart(order.start_date).getTime() - windowMs;
  return new Date(Math.min(afterPayment, beforeStart));
}
