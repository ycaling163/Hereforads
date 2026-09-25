-- 枚举类型。以 2026-09-25 线上导出(supabase/scripts/export_schema.sql)为准。
--
-- ⚠️ 这些迁移是给「新建的空 Supabase 项目」用的,不要在 HereForAds 线上库执行
-- (线上已经有这些对象,重复执行会报错)。用法见 docs/NEW_SITE_CHECKLIST.md。
--
-- 扩展:用到的 gen_random_uuid() 是 Postgres 自带的,不需要额外装扩展;Supabase
-- 新项目默认装好的 pgcrypto / uuid-ossp / pg_stat_statements 保持默认即可。
--
-- 老流程(ad_spaces/orders)用的枚举 ad_space_status、ad_space_type、order_status、
-- payment_channel、payout_status 没放进来,存档在 supabase/legacy/。

create type public.ad_type as enum (
  'static_image_ad', 'video_product_placement', 'product_intro_video',
  'sponsored_feature', 'product_test_video', 'custom'
);

create type public.listing_category as enum (
  'beauty_skincare', 'fashion_style', 'fitness_health', 'food_beverage', 'travel',
  'technology_gadgets', 'gaming', 'lifestyle', 'home_decor', 'parenting_family',
  'education_learning', 'arts_crafts', 'business_finance', 'automotive', 'sports',
  'music_entertainment', 'pets_animals', 'photography', 'comedy_entertainment', 'other', 'any'
);

create type public.listing_order_status as enum (
  'pending_payment', 'paid_in_escrow', 'delivered', 'confirmed', 'released',
  'expired_auto_confirmed', 'cancelled'
);

-- pending_review / rejected 是早期"发布要审核"时加的,2026-09-19 起不再使用,但保留取值
create type public.listing_status as enum (
  'draft', 'active', 'paused', 'pending_review', 'rejected', 'removed'
);

create type public.pricing_unit as enum ('one_time', 'daily', 'weekly', 'monthly');

create type public.social_platform as enum (
  'douyin', 'xiaohongshu', 'weibo', 'wechat_channel', 'youtube', 'instagram',
  'tiktok', 'bilibili', 'other'
);

create type public.user_role as enum ('seller', 'buyer', 'both');
