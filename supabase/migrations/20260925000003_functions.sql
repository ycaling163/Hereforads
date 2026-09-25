-- 函数和触发器。函数体从 2026-09-25 线上导出原样取出(pg_get_functiondef 的输出)。
-- ⚠️ 只给新建的空项目用,不要在 HereForAds 线上库执行。

-- 日历预订下单:加锁检查日期是否冲突、同一买家/同一 IP 未付款占用不超过 2 个,通过就插入订单。
-- 只给 service_role 调(src/lib/orders/bookings.ts)。
CREATE OR REPLACE FUNCTION public.create_booking_order(p_order jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_listing_id uuid := (p_order->>'listing_id')::uuid;
  v_buyer_id uuid := (p_order->>'buyer_id')::uuid;
  v_ip_hash text := nullif(p_order->>'hold_ip_hash', '');
  v_start date := (p_order->>'start_date')::date;
  v_end date := (p_order->>'end_date')::date;
  v_id uuid;
begin
  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'create_booking_order: invalid dates';
  end if;

  perform pg_advisory_xact_lock(hashtext('create_booking_order:pending_holds'));
  if (
    select count(*) from public.listing_orders o
    where o.status = 'pending_payment'
      and o.hold_expires_at > now()
      and (o.buyer_id = v_buyer_id or (v_ip_hash is not null and o.hold_ip_hash = v_ip_hash))
  ) >= 2 then
    raise exception 'too_many_pending_holds';
  end if;

  perform 1 from public.listings where id = v_listing_id for update;
  if not found then
    raise exception 'create_booking_order: listing not found';
  end if;

  if exists (
    select 1 from public.listing_orders o
    where o.listing_id = v_listing_id
      and o.start_date is not null
      and o.start_date <= v_end
      and o.end_date >= v_start
      and o.status <> 'cancelled'
      and (o.status <> 'pending_payment' or o.hold_expires_at > now())
  ) then
    return null;
  end if;

  insert into public.listing_orders (
    listing_id, buyer_id, seller_id, amount, currency, status, buyer_email,
    terms_accepted_at, immediate_start_consent_at,
    start_date, end_date, booking_units, hold_expires_at, hold_ip_hash
  ) values (
    v_listing_id,
    v_buyer_id,
    (p_order->>'seller_id')::uuid,
    (p_order->>'amount')::numeric,
    p_order->>'currency',
    'pending_payment',
    p_order->>'buyer_email',
    (p_order->>'terms_accepted_at')::timestamptz,
    (p_order->>'immediate_start_consent_at')::timestamptz,
    v_start,
    v_end,
    (p_order->>'booking_units')::integer,
    (p_order->>'hold_expires_at')::timestamptz,
    v_ip_hash
  )
  returning id into v_id;

  return v_id;
end;
$function$
;

-- 当前登录用户有没有设过密码(guest 账号没有),给 /dashboard/password 用。
CREATE OR REPLACE FUNCTION public.current_user_has_password()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(u.encrypted_password is not null and u.encrypted_password <> '', false)
  from auth.users u
  where u.id = auth.uid();
$function$
;

-- 按邮箱查用户 ID(guest 结账时找已有账号)。只给 service_role 调。
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'auth', 'pg_temp'
AS $function$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$function$
;

-- 触发器函数:日历订单从 pending_payment 变成 paid_in_escrow 时,再查一次日期冲突,
-- 冲突就报 booking_conflict(webhook 收到后自动退款)。
CREATE OR REPLACE FUNCTION public.guard_booking_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.start_date is null
     or old.status::text <> 'pending_payment'
     or new.status::text <> 'paid_in_escrow' then
    return new;
  end if;

  perform 1 from public.listings where id = new.listing_id for update;

  if exists (
    select 1 from public.listing_orders o
    where o.listing_id = new.listing_id
      and o.id <> new.id
      and o.start_date is not null
      and o.start_date <= new.end_date
      and o.end_date >= new.start_date
      and o.status::text not in ('pending_payment', 'cancelled')
  ) then
    raise exception 'booking_conflict';
  end if;

  return new;
end;
$function$
;

-- 清理一天前的限流计数。
CREATE OR REPLACE FUNCTION public.purge_rate_limits()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$function$
;

-- 限流计数 +1,返回是否还在额度内(src/lib/security/rateLimit.ts)。
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_bucket text, p_key text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'rate_limit_hit: invalid arguments';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key, v_window, 1)
  on conflict (bucket, key_hash, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  return v_hits <= p_limit;
end;
$function$
;

-- 卖家修改交付链接并记历史(listing_order_proof_changes)。
CREATE OR REPLACE FUNCTION public.update_order_proof_url(p_order_id uuid, p_seller_id uuid, p_new_url text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_old text;
begin
  select proof_url into v_old
  from public.listing_orders
  where id = p_order_id and seller_id = p_seller_id and status = 'delivered'
  for update;

  if not found then
    return false;
  end if;

  update public.listing_orders
  set proof_url = p_new_url, delivered_at = now()
  where id = p_order_id;

  insert into public.listing_order_proof_changes (order_id, old_proof_url, new_proof_url, changed_by)
  values (p_order_id, v_old, p_new_url, p_seller_id);

  return true;
end;
$function$
;
;

create trigger listing_orders_booking_payment_guard
  before update of status on public.listing_orders
  for each row execute function public.guard_booking_payment();
