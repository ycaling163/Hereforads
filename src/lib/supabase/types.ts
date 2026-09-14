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
