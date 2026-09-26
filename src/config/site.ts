// 站点配置:复制这套代码做新站点时,品牌和业务参数都在这里改(另外还有 public/logo.png、
// 环境变量、数据库和第三方服务,按 docs/NEW_SITE_CHECKLIST.md 的顺序做)。
//
// 这个文件服务端和浏览器端都会引用(比如发布表单的"到手金额"预览要用费率),
// 只能放公开的常量,不要放密钥——密钥一律放环境变量。

// ── 品牌 ────────────────────────────────────────────────────────────────────

export const SITE = {
  /** 站名:页面标题、页脚、登录/注册页、订单页、邮件落款、条款默认文案都用它。 */
  name: "HereForAds",
  /** 正式域名(不带结尾斜杠)。用于 metadataBase、分享卡片链接、"个人主页链接"前缀。 */
  url: "https://hereforads.com",
  /** 首页标题里站名后面那句话。 */
  tagline: "Turn Your Space Into Ad Space",
  /** 搜索引擎描述。 */
  description:
    "HereForAds is a marketplace where creators and everyday people list their physical or digital space as ad placements, and brands find and book the right spot to advertise.",
  /** 分享到社交媒体时的描述。 */
  shareDescription:
    "List your space and get paid by brands, or browse ad placements — from creator bio-links to real-world walls and desks.",
  /** 页头 logo(文件放在 public/ 下),同时用作分享图。 */
  logo: { src: "/logo.png", alt: "Here For Ads", width: 140, height: 111 },
  /** 浏览器标签页图标 / 手机桌面图标(src/app/icon.tsx、apple-icon.tsx)的主色和文字。 */
  brandColor: "#0B5CFF",
  iconText: "Ad",
  /**
   * 订单邮件的发件人。环境变量 EMAIL_FROM 优先;没配时用这个。域名要先在 Resend 验证过。
   * 联系表单的新留言提醒发给环境变量 ADMIN_ALERT_EMAIL。
   */
  defaultEmailFrom: "HereForAds <hello@hereforads.com>",
  /** 订单号前缀:数据库存数字,展示成 HFA-000123。 */
  orderNumberPrefix: "HFA-",
} as const;

/** 不带协议的域名,比如 "hereforads.com"。 */
export const SITE_DOMAIN = SITE.url.replace(/^https?:\/\//, "");

// ── 存储 ────────────────────────────────────────────────────────────────────

/**
 * Supabase Storage 的 bucket 名。广告媒体、头像、横幅、私信图片都放这里。
 * 跟 supabase/migrations/*_storage.sql 里建的 bucket 对应,改名要两边一起改。
 */
export const MEDIA_BUCKET = "ad-space-photos";

// ── 费用(README"费用、取消与退款规则"第 2 条) ───────────────────────────────

// 固定费率:卖家挂单时就能算出到手金额,不按 Stripe 实报手续费扣。Stripe 实际扣的
// 手续费由平台自己承担。
export const SERVICE_FEE_RATE = 0.12;
export const PROCESSING_FEE_RATE = 0.04;

// Payment processing fee 的固定部分:GBP 0.20,其他币种按大致等值取整(USD/EUR 的
// 0.25 是 README 第 2 条写明的;其余几种是按 2026-09 汇率取的等值整数)。
// 最小货币单位。改金额只改这里。
export const PROCESSING_FIXED_FEE_MINOR: Record<string, number> = {
  GBP: 20,
  USD: 25,
  EUR: 25,
  CAD: 35,
  AUD: 40,
  SGD: 35,
  HKD: 200,
  JPY: 40,
};

// 最低发布价:约等于 USD 1(2026-09-24 产品负责人定;不是每种货币都填 1——1 日元连
// Stripe 的最低收款额都不到)。最小货币单位。
export const MIN_LISTING_PRICE_MINOR: Record<string, number> = {
  USD: 100,
  GBP: 80,
  EUR: 90,
  CAD: 140,
  AUD: 150,
  SGD: 130,
  HKD: 800,
  JPY: 150,
};

// ── 托管与取消 ──────────────────────────────────────────────────────────────

// 卖家标记交付后,给买家留几天确认窗口,窗口内没有异议(或买家主动提前确认)就自动
// 放款 —— 平台不验证卖家提交的交付链接是否属实、也不裁定履约质量,这几天纯粹是给
// 买家一个"看一眼、有问题赶紧联系卖家"的机会,同时也给拒付/欺诈留操作窗口(见 README
// "平台责任边界"一节)。这个窗口从卖家标记 `delivered` 开始算,不是从付款时间算——
// 卖家不标记交付,订单就一直停在 `paid_in_escrow`,不会超时自动放款。
export const ESCROW_HOLD_DAYS = 3;

// 放款前人工审核(产品负责人 2026-09-26,README"放款审核"一节):防止"盗卡买自己的广告、
// 填个假交付链接、3 天后自动放款提走"。满足任一条件的订单,放款时先暂停,管理员在
// /admin/holds 点 "Approve payout" 之后才转账:
// - 卖家已经成功放款的订单少于 PAYOUT_REVIEW_FIRST_ORDERS 笔(新卖家);
// - 订单金额 >= 该币种的 PAYOUT_REVIEW_THRESHOLDS(约等于 £200),表里没有的币种一律审核。
export const PAYOUT_REVIEW_FIRST_ORDERS = 3;
export const PAYOUT_REVIEW_THRESHOLDS: Record<string, number> = {
  GBP: 200,
  EUR: 230,
  USD: 250,
  CAD: 350,
  AUD: 400,
  SGD: 350,
  HKD: 2000,
  JPY: 40000,
};

// 付款后多少小时内,买家或卖家可以单方面免费取消(卖家还没交付的前提下),全额退款,
// 不收卖家任何费用,不算违约。见 README"费用、取消与退款规则"第 4 条。
export const FREE_CANCEL_HOURS = 24;

// ── 日历按天预订(README"日历按天预订"一节,2026-09-24 决策) ─────────────────

// "一天"按英国时间算(产品负责人定:按卖家当地时区会碰到美国这种一国多时区、买卖双方
// 看到的日期对不上,MVP 先统一英国时间),页面上注明 "Dates are in UK time"。
export const BOOKING_TIME_ZONE = "Europe/London";

// 按天计价:卖家设最少预订天数,默认 7 天,可设 1–90。
export const DEFAULT_MIN_BOOKING_DAYS = 7;
// 单次预订最多 90 天(按周最多 12 周,按月最多 3 个月)。数据库约束 listings_booking_check
// 也限制最少预订天数在 1–90 之间,改这里要同时改迁移。
export const MAX_BOOKING_DAYS = 90;
// 开始日期最远在今天之后 60 天。
export const MAX_ADVANCE_DAYS = 60;
// 还没付款的订单占用日期的时间。Stripe Checkout 付款链接的有效期设成
// CHECKOUT_EXPIRES_MINUTES(Stripe 要求至少 30 分钟),占用时间比它多几分钟,
// 保证付款链接失效之前日期一直是这个买家的。
export const CHECKOUT_EXPIRES_MINUTES = 31;
export const PENDING_HOLD_MINUTES = 36;
