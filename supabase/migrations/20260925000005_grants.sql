-- 表 / 列 / 函数权限。以 2026-09-25 线上导出为准。
-- ⚠️ 只给新建的空项目用,不要在 HereForAds 线上库执行。
--
-- Supabase 新项目默认把 public 里新建的表、序列、函数的全部权限给 anon、authenticated、
-- service_role。这里只写跟默认不一样的地方。
--
-- Postgres 的规则:表级权限还在的时候,单独 revoke 某一列不起作用。所以要限制列的地方,
-- 都是先收回整张表的这项权限,再按列授予。

-- 只有服务端读写
revoke all on table public.contact_messages from anon, authenticated;
revoke all on table public.rate_limits from anon, authenticated;

-- listing_orders:买卖双方只能读下面这些列(读不到买家邮箱/姓名/电话/地址、
-- view_token、hold_ip_hash、checkout_session_id 等),写全部走服务端
revoke select, insert, update, delete, truncate, references, trigger
  on table public.listing_orders from anon, authenticated;
grant select (
  id, listing_id, buyer_id, seller_id, amount, currency, status, proof_url, start_date, end_date,
  paid_at, delivered_at, confirmed_at, created_at, cancelled_at, cancelled_by, cancel_reason,
  terms_accepted_at, immediate_start_consent_at, booking_units, hold_expires_at, order_number,
  payout_hold, payout_hold_at
) on table public.listing_orders to authenticated;

-- payments:RLS 只放了 select;另外收回这三项
revoke truncate, references, trigger on table public.payments from anon, authenticated;

-- listing_order_proof_changes:只读
revoke insert, update, delete, truncate, references, trigger
  on table public.listing_order_proof_changes from anon, authenticated;

-- listing_messages:收件人只能改 read_at
revoke update on table public.listing_messages from anon, authenticated;
grant update (read_at) on table public.listing_messages to authenticated;

-- listings:发布时可以填 status(草稿/上架)和两个确认时间;之后卖家改不了 status、
-- is_featured、rights_attested_at、terms_accepted_at(暂停/下架/推荐走服务端)
revoke insert, update on table public.listings from anon, authenticated;
grant insert (
  id, seller_id, title, description, categories, price_amount, price_currency, pricing_unit,
  media_urls, status, created_at, updated_at, social_account_id, is_website_placement, ad_type,
  rights_attested_at, terms_accepted_at, booking_enabled, min_booking_days
) on table public.listings to authenticated;
grant update (
  id, seller_id, title, description, categories, price_amount, price_currency, pricing_unit,
  media_urls, created_at, updated_at, social_account_id, is_website_placement, ad_type,
  booking_enabled, min_booking_days
) on table public.listings to authenticated;

-- profiles:用户改不了 is_banned、stripe_onboarded、stripe_connect_account_id、country
revoke insert, update on table public.profiles from anon, authenticated;
grant insert (id, role, display_name, created_at, updated_at, username)
  on table public.profiles to authenticated;
grant update (id, role, display_name, created_at, updated_at, username)
  on table public.profiles to authenticated;

-- seller_profiles:用户改不了 is_verified 和 Stripe 相关字段
revoke insert, update on table public.seller_profiles from anon, authenticated;
grant insert (
  user_id, bio, avatar_url, created_at, updated_at, content_categories, website_url, banner_url,
  price_card_image_url
) on table public.seller_profiles to authenticated;
grant update (
  user_id, bio, avatar_url, created_at, updated_at, content_categories, website_url, banner_url,
  price_card_image_url
) on table public.seller_profiles to authenticated;

-- 函数:只给服务端调
revoke all on function public.create_booking_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_booking_order(jsonb) to service_role;

-- get_user_id_by_email 能读 auth.users,绝不能给 anon/authenticated(2026-09-25 发现线上
-- 这两个角色还能调,已同步收回,见 README"模板化整理"一节)
revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

revoke all on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_rate_limits() to service_role;

revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;

revoke all on function public.update_order_proof_url(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.update_order_proof_url(uuid, uuid, text) to service_role;

-- 登录用户查自己有没有密码
revoke all on function public.current_user_has_password() from public, anon;
grant execute on function public.current_user_has_password() to authenticated;
