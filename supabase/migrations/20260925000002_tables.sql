-- 表、约束、索引、序列。以 2026-09-25 线上导出为准(列顺序、约束名都跟线上一致,
-- 方便用 supabase/scripts/export_schema.sql 两边对比)。
-- ⚠️ 只给新建的空项目用,不要在 HereForAds 线上库执行。

-- 用户资料。id 就是 auth.users.id;注册/首次登录时由代码建(src/lib/supabase/ensure-profile.ts)。
create table public.profiles (
  id uuid not null,
  role public.user_role default 'both'::public.user_role not null,
  display_name text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  country text,
  stripe_connect_account_id text,
  stripe_onboarded boolean default false not null,
  is_banned boolean default false not null,
  username text,
  constraint profiles_pkey primary key (id),
  constraint profiles_username_unique unique (username),
  constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade
);

-- 管理员名单(/admin/*)。第一个管理员要手动 insert,见 docs/NEW_SITE_CHECKLIST.md。
create table public.admins (
  user_id uuid not null,
  created_at timestamp with time zone default now() not null,
  constraint admins_pkey primary key (user_id),
  constraint admins_user_id_fkey foreign key (user_id) references public.profiles (id)
);

create table public.seller_profiles (
  user_id uuid not null,
  bio text,
  avatar_url text,
  is_verified boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  stripe_account_id text,
  stripe_charges_enabled boolean default false not null,
  stripe_payouts_enabled boolean default false not null,
  content_categories public.listing_category[] default '{}'::public.listing_category[] not null,
  website_url text,
  banner_url text,
  price_card_image_url text,
  constraint seller_profiles_pkey primary key (user_id),
  constraint seller_profiles_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade
);
-- 线上是 not valid(加约束时不检查已有数据),这里保持一致
alter table public.seller_profiles
  add constraint seller_profiles_website_url_http
  check (website_url is null or website_url ~* '^https?://') not valid;

create table public.social_accounts (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  platform public.social_platform not null,
  handle text,
  url text,
  follower_count text,
  created_at timestamp with time zone default now() not null,
  constraint social_accounts_pkey primary key (id),
  constraint social_accounts_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade
);
-- 只填账号名、不填链接时代码存的是空字符串,所以允许 ''(2026-09-25 修正版;
-- 线上补执行同一条,见 README"模板化整理"一节)
alter table public.social_accounts
  add constraint social_accounts_url_http
  check (url is null or url = '' or url ~* '^https?://') not valid;
create index idx_social_accounts_user on public.social_accounts using btree (user_id);

create table public.seller_price_card_items (
  id uuid default gen_random_uuid() not null,
  seller_id uuid not null,
  ad_type public.ad_type not null,
  platform text,
  price_amount numeric not null,
  price_currency text not null,
  note text,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint seller_price_card_items_pkey primary key (id),
  constraint seller_price_card_items_seller_id_fkey foreign key (seller_id) references public.profiles (id)
);

-- /terms、/privacy 的后台可编辑内容。没有行时页面用代码里的默认文案
-- (src/lib/legalPageDefaults.ts),所以不需要种子数据。
create table public.site_pages (
  slug text not null,
  title text not null,
  content_html text default ''::text not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid,
  constraint site_pages_pkey primary key (slug),
  constraint site_pages_slug_check check (slug = any (array['terms'::text, 'privacy'::text])),
  constraint site_pages_updated_by_fkey foreign key (updated_by) references public.profiles (id)
);

create table public.listings (
  id uuid default gen_random_uuid() not null,
  seller_id uuid not null,
  title text not null,
  description text,
  categories public.listing_category[] default '{}'::public.listing_category[] not null,
  price_amount numeric not null,
  price_currency text default 'USD'::text not null,
  pricing_unit public.pricing_unit default 'one_time'::public.pricing_unit not null,
  media_urls text[] default '{}'::text[] not null,
  status public.listing_status default 'draft'::public.listing_status not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_featured boolean default false not null,
  social_account_id uuid,
  is_website_placement boolean default false not null,
  ad_type public.ad_type,
  rights_attested_at timestamp with time zone,
  terms_accepted_at timestamp with time zone,
  booking_enabled boolean default false not null,
  min_booking_days integer,
  constraint listings_pkey primary key (id),
  constraint listings_booking_check check (
    (not booking_enabled or pricing_unit <> 'one_time'::public.pricing_unit)
    and (min_booking_days is null or (min_booking_days >= 1 and min_booking_days <= 90))
  ),
  constraint listings_seller_id_fkey foreign key (seller_id) references public.profiles (id),
  constraint listings_social_account_id_fkey foreign key (social_account_id)
    references public.social_accounts (id) on delete set null
);

-- 订单号(展示成 HFA-000123,前缀在 src/config/site.ts)
create sequence public.listing_order_number_seq;

create table public.listing_orders (
  id uuid default gen_random_uuid() not null,
  listing_id uuid not null,
  buyer_id uuid not null,
  seller_id uuid not null,
  amount numeric not null,
  currency text not null,
  status public.listing_order_status default 'pending_payment'::public.listing_order_status not null,
  proof_url text,
  start_date date,
  end_date date,
  paid_at timestamp with time zone,
  delivered_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  buyer_name text,
  buyer_phone text,
  buyer_address text,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancel_reason text,
  buyer_email text,
  terms_accepted_at timestamp with time zone,
  immediate_start_consent_at timestamp with time zone,
  booking_units integer,
  hold_expires_at timestamp with time zone,
  order_number bigint default nextval('public.listing_order_number_seq'::regclass) not null,
  view_token uuid default gen_random_uuid() not null,
  payout_hold text,
  payout_hold_at timestamp with time zone,
  payout_hold_note text,
  hold_ip_hash text,
  checkout_session_id text,
  -- 赞助商展示(2026-09-26,README"赞助商展示"):买家自愿展示的品牌名 + 一个链接
  sponsor_name text,
  sponsor_url text,
  sponsor_public boolean default false not null,
  sponsor_hidden_by_seller_at timestamp with time zone,
  sponsor_hidden_by_admin_at timestamp with time zone,
  constraint listing_orders_pkey primary key (id),
  constraint listing_orders_sponsor_name_len check (
    sponsor_name is null or char_length(sponsor_name) between 1 and 60
  ),
  constraint listing_orders_sponsor_url_http check (
    sponsor_url is null or (sponsor_url ~* '^https?://' and char_length(sponsor_url) <= 300)
  ),
  constraint listing_orders_booking_dates_check check (
    ((start_date is null) = (end_date is null))
    and (end_date is null or end_date >= start_date)
    and (booking_units is null or booking_units > 0)
  ),
  constraint listing_orders_payout_hold_check check (
    payout_hold is null or payout_hold = any (array['dispute'::text, 'refund'::text, 'seller_banned'::text, 'review'::text])
  ),
  constraint listing_orders_buyer_id_fkey foreign key (buyer_id) references public.profiles (id),
  constraint listing_orders_cancelled_by_fkey foreign key (cancelled_by) references public.profiles (id),
  constraint listing_orders_listing_id_fkey foreign key (listing_id) references public.listings (id),
  constraint listing_orders_seller_id_fkey foreign key (seller_id) references public.profiles (id)
);
alter sequence public.listing_order_number_seq owned by public.listing_orders.order_number;

-- 卖家给日历空档设的自选展示(2026-09-26,README"赞助商展示"第 3 条),只有服务端读写
create table public.seller_house_ads (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  url text,
  hidden_by_admin_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint seller_house_ads_pkey primary key (id),
  constraint seller_house_ads_name_check check (char_length(name) between 1 and 60),
  constraint seller_house_ads_url_check check (
    url is null or (url ~* '^https?://' and char_length(url) <= 300)
  ),
  constraint seller_house_ads_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade
);
create index seller_house_ads_user_idx on public.seller_house_ads using btree (user_id);

create unique index listing_orders_order_number_key on public.listing_orders using btree (order_number);
create unique index listing_orders_view_token_key on public.listing_orders using btree (view_token);
create index listing_orders_listing_dates_idx on public.listing_orders using btree (listing_id, end_date)
  where (start_date is not null);
create index listing_orders_payout_hold_idx on public.listing_orders using btree (payout_hold_at)
  where (payout_hold is not null);
create index listing_orders_pending_holds_idx on public.listing_orders using btree (hold_expires_at)
  where ((status = 'pending_payment'::public.listing_order_status) and (hold_expires_at is not null));

create table public.payments (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  platform_fee_amount numeric,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  stripe_fee_amount numeric,
  net_amount numeric,
  stripe_refund_id text,
  settlement_currency text,
  settlement_amount numeric,
  stripe_actual_fee numeric,
  transfer_amount numeric,
  transfer_currency text,
  constraint payments_pkey primary key (id),
  constraint payments_order_id_fkey foreign key (order_id) references public.listing_orders (id)
);
-- 一个订单只能有一条托管付款记录(金额对不上的记录除外)
create unique index payments_one_escrow_payment_per_order on public.payments using btree (order_id)
  where (status <> 'amount_mismatch'::text);

-- 卖家修改交付链接的历史
create table public.listing_order_proof_changes (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  old_proof_url text,
  new_proof_url text not null,
  changed_by uuid not null,
  changed_at timestamp with time zone default now() not null,
  constraint listing_order_proof_changes_pkey primary key (id),
  constraint listing_order_proof_changes_changed_by_fkey foreign key (changed_by) references public.profiles (id),
  constraint listing_order_proof_changes_order_id_fkey foreign key (order_id)
    references public.listing_orders (id) on delete cascade
);
create index listing_order_proof_changes_order_idx on public.listing_order_proof_changes
  using btree (order_id, changed_at);

-- 站内私信
create table public.listing_messages (
  id uuid default gen_random_uuid() not null,
  listing_id uuid not null,
  sender_id uuid not null,
  receiver_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  read_at timestamp with time zone,
  image_url text,
  constraint listing_messages_pkey primary key (id),
  constraint listing_messages_listing_id_fkey foreign key (listing_id) references public.listings (id),
  constraint listing_messages_receiver_id_fkey foreign key (receiver_id) references public.profiles (id),
  constraint listing_messages_sender_id_fkey foreign key (sender_id) references public.profiles (id)
);

-- /contact 联系表单(只有服务端读写)
create table public.contact_messages (
  id uuid default gen_random_uuid() not null,
  name text not null,
  email text not null,
  message text not null,
  created_at timestamp with time zone default now() not null,
  read_at timestamp with time zone,
  constraint contact_messages_pkey primary key (id)
);
create index contact_messages_unread_idx on public.contact_messages using btree (created_at)
  where (read_at is null);

-- 限流计数(只有服务端读写,见 src/lib/security/rateLimit.ts)
create table public.rate_limits (
  bucket text not null,
  key_hash text not null,
  window_start timestamp with time zone not null,
  hits integer default 0 not null,
  constraint rate_limits_pkey primary key (bucket, key_hash, window_start)
);
