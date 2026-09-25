-- 行级安全(RLS)开关和策略。以 2026-09-25 线上导出为准,策略名、角色、条件都跟线上一致。
-- ⚠️ 只给新建的空项目用,不要在 HereForAds 线上库执行。
--
-- 注意:能改哪些列另外由列级权限控制(见下一个迁移 _grants.sql),比如卖家能 update 自己的
-- listing,但改不了 status / is_featured;RLS 只管"哪些行"。
-- contact_messages、rate_limits 开了 RLS 但没有策略:只有服务端(service_role)能读写。

alter table public.admins enable row level security;
alter table public.contact_messages enable row level security;
alter table public.listing_messages enable row level security;
alter table public.listing_order_proof_changes enable row level security;
alter table public.listing_orders enable row level security;
alter table public.listings enable row level security;
alter table public.payments enable row level security;
alter table public.profiles enable row level security;
alter table public.rate_limits enable row level security;
alter table public.seller_price_card_items enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.site_pages enable row level security;
alter table public.social_accounts enable row level security;

-- admins
create policy "users can check their own admin status" on public.admins
  for select to authenticated
  using (auth.uid() = user_id);

-- listing_messages:只能发给这条广告的卖家,或者卖家回复给先来找过他的人
create policy "sender and receiver can view their messages" on public.listing_messages
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "send to the listing seller, or reply as the seller" on public.listing_messages
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and exists (
      select 1 from public.listings l
      where l.id = listing_messages.listing_id
        and (
          l.seller_id = listing_messages.receiver_id
          or (
            l.seller_id = listing_messages.sender_id
            and exists (
              select 1 from public.listing_messages m
              where m.listing_id = listing_messages.listing_id
                and m.sender_id = listing_messages.receiver_id
                and m.receiver_id = listing_messages.sender_id
            )
          )
        )
    )
  );

-- 收件人只能改 read_at(列级权限限制)
create policy "receiver can mark their messages read" on public.listing_messages
  for update to authenticated
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- listing_order_proof_changes
create policy "buyers and sellers can view proof changes of their orders" on public.listing_order_proof_changes
  for select to authenticated
  using (exists (
    select 1 from public.listing_orders o
    where o.id = listing_order_proof_changes.order_id
      and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  ));

-- listing_orders:买卖双方只能读(而且只能读部分列),写全部走服务端
create policy "buyers and sellers can view their own orders" on public.listing_orders
  for select to authenticated
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

-- listings
create policy "anyone can view active listings, sellers can view their own" on public.listings
  for select to anon, authenticated
  using (status = 'active'::public.listing_status or seller_id = auth.uid());

create policy "sellers can insert own listings" on public.listings
  for insert to authenticated
  with check (auth.uid() = seller_id);

create policy "sellers can update own listings" on public.listings
  for update to authenticated
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

create policy "sellers can delete own listings" on public.listings
  for delete to authenticated
  using (auth.uid() = seller_id);

-- payments:只读,写全部走服务端
create policy "buyers and sellers can view their own payments" on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.listing_orders o
    where o.id = payments.order_id
      and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  ));

-- profiles
create policy "anyone can view profiles" on public.profiles
  for select to anon, authenticated
  using (true);

create policy "users can insert own profile" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

create policy "users can update own profile" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 早期建的重复策略(to public,跟上一条效果相同;anon 没有 update 列权限,不会多放权)。
-- 线上有,这里保留以保持一致。
create policy "Users can update own profile" on public.profiles
  for update to public
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- seller_price_card_items
create policy "anyone can view price card items" on public.seller_price_card_items
  for select to anon, authenticated
  using (true);

create policy "sellers can insert own price card items" on public.seller_price_card_items
  for insert to authenticated
  with check (auth.uid() = seller_id);

create policy "sellers can update own price card items" on public.seller_price_card_items
  for update to authenticated
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

create policy "sellers can delete own price card items" on public.seller_price_card_items
  for delete to authenticated
  using (auth.uid() = seller_id);

-- seller_profiles
create policy "anyone can view seller_profiles" on public.seller_profiles
  for select to anon, authenticated
  using (true);

create policy "users can insert own seller_profiles" on public.seller_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users can update own seller_profiles" on public.seller_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 早期建的重复策略(同上,线上有,保留以保持一致)
create policy "Users can upsert own seller_profiles" on public.seller_profiles
  for insert to public
  with check (auth.uid() = user_id);

create policy "Users can update own seller_profiles" on public.seller_profiles
  for update to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- site_pages:谁都能读,写走服务端(/admin/pages)
create policy "anyone can read site pages" on public.site_pages
  for select to public
  using (true);

-- social_accounts
create policy "anyone can view social_accounts" on public.social_accounts
  for select to anon, authenticated
  using (true);

create policy "users can insert own social_accounts" on public.social_accounts
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users can update own social_accounts" on public.social_accounts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own social_accounts" on public.social_accounts
  for delete to authenticated
  using (auth.uid() = user_id);
