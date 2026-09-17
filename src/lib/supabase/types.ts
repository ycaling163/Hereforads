import type {
  ListingCategory,
  ListingOrderStatus,
  ListingStatus,
  PricingUnit,
  SocialPlatform,
  UserRole,
} from "./enums";

export interface Profile {
  id: string;
  role: UserRole;
  display_name: string | null;
  // MVP v2 新增字段,见 README 里的 schema 迁移说明。老账号这三个字段读出来是 null,
  // 代表还没走过新流程 —— country 未填、stripe_onboarded 视为 false。
  country: string | null;
  stripe_connect_account_id: string | null;
  stripe_onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface SellerProfile {
  user_id: string;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  // 创作者自己的内容领域(比如"手工/创作类博主"),跟 Listing.categories(这个
  // 广告位愿意接哪些品牌类目的广告)是两个独立概念,不要混用。加之前读出来是 undefined。
  content_categories: ListingCategory[];
  // Stripe Connect(Express 账户)相关字段,加之前读出来是 undefined。
  // 见 README 支付章节的 SQL。
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SocialAccount {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  handle: string | null;
  url: string;
  follower_count: number | null;
  created_at: string;
}

/**
 * MVP v2 新模型("HereForAds MVP 产品方案"文档)—— 对应 listings/orders/payments/messages 四张表。
 */

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  categories: ListingCategory[];
  price_amount: number;
  price_currency: string;
  pricing_unit: PricingUnit;
  media_urls: string[];
  status: ListingStatus;
  created_at: string;
  updated_at: string;
}

export interface ListingOrder {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  currency: string;
  status: ListingOrderStatus;
  proof_url: string | null;
  // 仅 pricing_unit 非 one_time 的 listing 才会填,用于判断档期冲突。
  start_date: string | null;
  end_date: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  platform_fee_amount: number | null;
  // Stripe 自己的处理手续费和卖家实际到手净额,只有订单走到 released(真正发起
  // Transfer)那一步才知道,之前(paid_in_escrow/delivered/confirmed)读出来是 null。
  // 见 README 支付章节和 src/lib/stripe/release.ts。
  stripe_fee_amount: number | null;
  net_amount: number | null;
  status: string;
  created_at: string;
}

// 绑在某个 listing 下的一对一消息串,不做群聊。
export interface ListingMessage {
  id: string;
  listing_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  // 收件人打开这条会话时才会补上这个时间戳,null 就是未读。加之前读出来是 undefined。
  read_at: string | null;
  // 消息可以只发图片、不写文字(这时 body 是空字符串),用来在沟通交付细节时
  // 直接甩参考图/效果图。加之前读出来是 undefined。
  image_url: string | null;
  created_at: string;
}
