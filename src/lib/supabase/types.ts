import type {
  AdSpaceStatus,
  AdSpaceType,
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

export interface AdSpace {
  id: string;
  seller_id: string;
  space_type: AdSpaceType;
  title: string;
  description: string | null;
  keyword: string | null;
  photo_urls: string[] | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  price_amount: number;
  price_currency: string;
  duration_days: number;
  status: AdSpaceStatus;
  created_at: string;
  updated_at: string;
}

export interface SellerProfile {
  user_id: string;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
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

// 预订记录,用来算日历上哪些天已经被占用。start_date/end_date
// 需要先在 orders 表里加(见 SQL 说明),加之前这两个字段读出来是 undefined。
export interface Order {
  id: string;
  ad_space_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  currency: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  // Stripe Checkout / PaymentIntent 关联字段,加之前读出来是 undefined。
  // 见 README 支付章节的 SQL。
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

/**
 * MVP v2 新模型("HereForAds MVP 产品方案"文档)—— 跟上面 AdSpace/Order 是两套
 * 完全独立的实体,分别对应 listings/orders(新)/payments/messages 四张新表。
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
  created_at: string;
}
