import type {
  AdSpaceStatus,
  AdSpaceType,
  SocialPlatform,
  UserRole,
} from "./enums";

export interface Profile {
  id: string;
  role: UserRole;
  display_name: string | null;
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
