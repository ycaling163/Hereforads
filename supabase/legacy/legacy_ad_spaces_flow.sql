-- 存档:老流程(ad_spaces/orders 日历预订,2026-09-17 起代码已下线)在线上还留着的表结构。
-- 来自 2026-09-25 线上导出。只作参考,不属于迁移,不要执行;新站点不需要这些表。
-- 线上的这些表暂时没动(产品负责人 2026-09-25 决定)。

-- enums
create type public.ad_space_status as enum ('available', 'reserved', 'active_campaign', 'inactive');
create type public.ad_space_type as enum ('wall', 'picture_frame', 'clothing_pocket', 'clothing_back', 'face_left', 'face_right', 'other');
create type public.order_status as enum ('pending_payment', 'paid', 'in_progress', 'completed', 'cancelled', 'refunded', 'confirmed', 'rejected');
create type public.payment_channel as enum ('stripe', 'wechat_pay', 'alipay');
create type public.payout_status as enum ('pending', 'paid', 'failed');

-- tables
create table public.ad_spaces (
  id uuid default gen_random_uuid() not null,
  seller_id uuid not null,
  space_type ad_space_type not null,
  title text not null,
  description text,
  photo_urls text[] default '{}'::text[] not null,
  city text,
  latitude numeric,
  longitude numeric,
  price_amount numeric(10,2) not null,
  price_currency text default 'CNY'::text not null,
  duration_days integer default 7 not null,
  status ad_space_status default 'available'::ad_space_status not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  keyword text
);
create table public.campaigns (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  creative_url text not null,
  caption text,
  created_at timestamp with time zone default now() not null
);
create table public.orders (
  id uuid default gen_random_uuid() not null,
  ad_space_id uuid not null,
  buyer_id uuid not null,
  seller_id uuid not null,
  payment_channel payment_channel not null,
  amount numeric(10,2) not null,
  currency text default 'CNY'::text not null,
  status order_status default 'pending_payment'::order_status not null,
  external_payment_id text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  start_date date,
  end_date date,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text
);
create table public.payouts (
  id uuid default gen_random_uuid() not null,
  seller_id uuid not null,
  order_id uuid not null,
  amount numeric(10,2) not null,
  currency text default 'CNY'::text not null,
  status payout_status default 'pending'::payout_status not null,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);
create table public.proof_uploads (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  media_url text not null,
  note text,
  uploaded_at timestamp with time zone default now() not null
);

-- constraints
alter table public.ad_spaces add constraint ad_spaces_pkey PRIMARY KEY (id);
alter table public.campaigns add constraint campaigns_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.payouts add constraint payouts_pkey PRIMARY KEY (id);
alter table public.proof_uploads add constraint proof_uploads_pkey PRIMARY KEY (id);

-- foreign_keys
alter table public.ad_spaces add constraint ad_spaces_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.campaigns add constraint campaigns_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_ad_space_id_fkey FOREIGN KEY (ad_space_id) REFERENCES ad_spaces(id);
alter table public.orders add constraint orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id);
alter table public.orders add constraint orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id);
alter table public.payouts add constraint payouts_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.payouts add constraint payouts_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id);
alter table public.proof_uploads add constraint proof_uploads_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- indexes
CREATE INDEX idx_ad_spaces_seller ON public.ad_spaces USING btree (seller_id);
CREATE INDEX idx_ad_spaces_status ON public.ad_spaces USING btree (status);
CREATE INDEX idx_orders_ad_space ON public.orders USING btree (ad_space_id);
CREATE INDEX idx_orders_buyer ON public.orders USING btree (buyer_id);
CREATE INDEX idx_orders_seller ON public.orders USING btree (seller_id);
CREATE INDEX idx_payouts_seller ON public.payouts USING btree (seller_id);

-- rls
alter table ad_spaces enable row level security;
alter table campaigns enable row level security;
alter table orders enable row level security;
alter table payouts enable row level security;
alter table proof_uploads enable row level security;

-- policies
create policy "Sellers can update own ad_spaces" on ad_spaces as permissive for update to public
  using ((auth.uid() = seller_id))
  with check ((auth.uid() = seller_id));
create policy "anyone can view ad_spaces" on ad_spaces as permissive for select to anon, authenticated
  using (true);
create policy "sellers can delete own ad_spaces" on ad_spaces as permissive for delete to authenticated
  using ((auth.uid() = seller_id));
create policy "sellers can insert own ad_spaces" on ad_spaces as permissive for insert to authenticated
  with check ((auth.uid() = seller_id));
create policy "sellers can update own ad_spaces" on ad_spaces as permissive for update to authenticated
  using ((auth.uid() = seller_id))
  with check ((auth.uid() = seller_id));
create policy "anyone can view orders" on orders as permissive for select to anon, authenticated
  using (true);
create policy "buyers can create their own orders" on orders as permissive for insert to authenticated
  with check ((auth.uid() = buyer_id));
create policy "buyers can update their own confirmed orders" on orders as permissive for update to authenticated
  using (((auth.uid() = buyer_id) AND (status = 'confirmed'::order_status)))
  with check (((auth.uid() = buyer_id) AND (status = 'confirmed'::order_status)));
create policy "sellers can update their own orders" on orders as permissive for update to authenticated
  using ((auth.uid() = seller_id))
  with check ((auth.uid() = seller_id));

-- table_grants
revoke all on table ad_spaces from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table ad_spaces to service_role;
revoke all on table campaigns from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table campaigns to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table campaigns to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table campaigns to service_role;
revoke all on table orders from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table orders to service_role;
revoke all on table payouts from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table payouts to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table payouts to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table payouts to service_role;
revoke all on table proof_uploads from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on table proof_uploads to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on table proof_uploads to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on table proof_uploads to service_role;
