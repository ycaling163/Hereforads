# myadsspace

把个人实体空间（墙面、橱窗等)当广告位出租的小市场。卖家发布空间,买家在日历上选日期预订。参考风格: [thewall.ink](https://thewall.ink)——简洁、大字号、卡片式。

技术栈: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Auth / Postgres / Storage)。

> **开始干活前先看 [`WORKLOG.md`](./WORKLOG.md) 最近几条 + 本文件的决策记录**,这个仓库好几个 session 在并行改,只看代码/git log 容易漏掉背景和已经拍板的决策(教训见 WORKLOG 2026-09-17 那条)。改完之后记得回 WORKLOG 补一条。

## 当前卡住的问题(2026-09-17,下一个 session 先看这个)

**症状**:买家在 `/listings/[id]` 点"购买"、走完 Stripe Checkout 真实付款(已确认能看到 `checkout.stripe.com/c/pay/...` 付款页、输测试卡 `4242 4242 4242 4242`、点 Pay、成功跳转回 `/dashboard/purchases?checkout=success`),但订单在"Purchases"/"Sales"页面**一直显示 `待支付`(`pending_payment`)**,没有推进到 `paid_in_escrow`。代码逻辑(`src/app/listings/[id]/actions.ts` 的 `buyListingAction`、`src/app/api/stripe/webhook/route.ts` 的 `checkout.session.completed` 分支)已经过审查,看起来是对的——**问题不在代码,在域名/网络这一层**,`/api/stripe/webhook` 这个 URL 大概率没有真正被 Stripe 的服务器请求到。

**已经排查确认的事实**:
- Stripe 后台(Developers → Webhooks → 目的地 "hereforads-production",URL `https://hereforads.com/api/stripe/webhook`,订阅 `checkout.session.completed`,scope "Your account")在很长一段时间里 "Event deliveries" 一直是 **Total 0 / Failed 0**——不是"发了但失败",是 Stripe **压根没有尝试**投递,账户级别的 Events 日志里也搜不到这次购买对应的事件。
- 域名 `hereforads.com` 在 **IONOS** 买的,但 **nameserver 指向 Cloudflare**,Cloudflare 管 DNS。
- 排查发现 `hereforads.com`(不带 www)的 A 记录原本指向 `216.150.1.1`——这是 **IONOS 自己的服务器 IP,根本没有指向 Vercel**;`www.hereforads.com` 的 CNAME 倒是正确指向 Vercel(`...vercel-dns...`),但两条记录在 Cloudflare 里都开着**橙色云朵(Proxied)**。Vercel 项目的 Domains 页面对应显示 `hereforads.com` 是 "Invalid Configuration",`www.hereforads.com` 是 "Proxy Detected"。
- 高度怀疑:Cloudflare 的代理/机器人防护把 Stripe 服务器对服务器发的 webhook POST 请求当成可疑流量拦截了(普通浏览器 GET 请求能过,是因为浏览器能配合过 Cloudflare 的验证;Stripe 的 webhook 没有浏览器,直接被挡)。

**已经做的修复动作(但还没验证成功)**:
1. 把 Cloudflare 里 `hereforads.com` 的 A 记录值改成了 Vercel 官方标准值 `76.76.21.21`(改对了)
2. 删掉了多余的第二条 A 记录和一条无关的 AAAA 记录
3. 在 Vercel 域名设置里把 `hereforads.com` 设成了 Primary/Production,`www.hereforads.com` 配成 308 跳转过去(中途误删过一次 `www.hereforads.com` 又用 "Add Existing" 加回来了,注意确认它还在)
4. 尝试把 Cloudflare 里 `hereforads.com` 的 A 记录、`www.hereforads.com` 的 CNAME 记录云朵图标改成灰色(DNS only,绕开代理)——**用户反馈"没有用"**,最后一次确认截图里这两条云朵状态到底是灰是橙**没有得到清楚确认**,这是接下来最先要核实的事。

**下一步建议(按顺序)**:
1. 先截图确认 Cloudflare 里 `hereforads.com`(A,`76.76.21.21`)和 `www.hereforads.com`(CNAME)这两条记录的云朵图标现在到底是不是灰色(DNS only)。如果还是橙色,重新点一次云朵图标(不是 "Edit" 按钮,是云朵图标本身),这是个独立的开关。
2. 灰色确认之后,等几分钟 DNS 生效,回 Vercel Domains 页面刷新,确认 `hereforads.com` 变成绿色 "Valid Configuration",不再显示 "Proxy Detected"。
3. 如果切成 DNS only 后网站还是能正常访问(大概率没问题,因为 Vercel 自己也有基础的 DDoS 防护),重新测一次购买流程,然后去 Stripe 那个 webhook 目的地的 "Event deliveries" 标签看这次有没有出现新的投递记录、状态码是多少。
4. 如果做完以上还是 Total 0,要考虑一个更彻底的方案:**这个阶段(还在测试,没正式上线)干脆先把 Cloudflare 从 nameserver 里去掉,DNS 直接托管在 Vercel 或者 IONOS**,减少一层可能出问题的中间环节——等支付流程全部验证通过、要正式上线时,再考虑要不要重新接入 Cloudflare(如果要接,记得单独给 `/api/stripe/webhook` 这个路径配一条 Cloudflare 防火墙放行规则,不要用默认的机器人防护规则挡住 Stripe)。
5. 域名/网络问题解决、webhook 真正能收到事件之后,还需要验证:webhook 收到事件后 `SUPABASE_SERVICE_ROLE_KEY` 能不能正常写库(用户已确认填的是真实值,但还没有在 webhook 真正跑通的情况下验证过)。

**这次顺带修好但跟这个问题无关的其他事**(不用重复排查):
- Stripe 新账户默认不让用 Accounts v1 API 建连接账户,已经去 Stripe 后台 `Settings → Features → Accounts v1 support` 打开了这个开关,现在能正常建 Express 连接账户
- `src/lib/stripe/server.ts` 之前在模块顶层直接 `new Stripe(...)`,导致 `STRIPE_SECRET_KEY` 没配置好时会把整个 Vercel 构建炸掉,已经改成 Proxy 惰性初始化,commit `7c1202c`

**还没做、用户说"等会一起改"的功能缺口**(优先级在这个 webhook 问题之后):
- 卖家没有"我的广告位"列表页,看不到自己发布的所有 listing(尤其是 `draft` 状态的)
- Sales 页面点订单看不到买家身份/联系方式,也没有单独的订单详情页
- 私信没有未读提示(`listing_messages` 表连"已读"字段都没有)

## 本地运行

```bash
npm install
cp .env.example .env.local   # 填入下面两个真实值
npm run dev
```

`.env.local` 需要两个变量(在 Supabase 后台 Settings → API 里拿):

```
NEXT_PUBLIC_SUPABASE_URL=https://jnfllsllahunbfgpopfv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 anon/publishable key
```

anon key 是设计给前端用的,可以放心提交/分享,真正的权限控制在下面的 RLS 策略里。**千万不要**把 `service_role` key 放到这个项目里。

Next.js 16 把 `middleware.ts` 改名成了 `proxy.ts`(功能一样),本项目的 `src/proxy.ts` 就是用来刷新 Supabase 登录态 cookie 的,别按旧版教程建 `middleware.ts`。

## 页面一览

| 路径 | 说明 |
| --- | --- |
| `/` | 首页 |
| `/login`、`/register` | 邮箱密码登录/注册,密码框带显示/隐藏切换。注册成功后自动在 `profiles` 建一条记录(`role='both'`);如果 Supabase 开了邮箱验证、注册时还没有 session,会在验证后**首次登录**时补建 |
| `/spaces` | 广告位卡片列表,读 `ad_spaces` 表 |
| `/spaces/[id]` | 详情页:图片、关键词、状态、卖家信息(`profiles`+`seller_profiles`,头像/名字可点进 `/sellers/[id]`)、社交账号(`social_accounts`,可点击跳转)、**预订日历** |
| `/sellers/[id]` | 卖家公开主页:头像/简介/认证标记、全部社交账号、该卖家发布的全部广告位(卡片列表) |
| `/dashboard/new-space` | 卖家发布表单:标题/描述/关键词/城市/价格/币种/租期天数(卖家自定,不限 30 天)/图片(真实文件上传) |

以上是老的"实体广告位日历预订"流程(参考 thewall.ink),线上还在跑,没有下线。下面是"HereForAds MVP 产品方案"确认稿(发布+交易工具,Stripe Connect 托管交易)对应的新页面,两套并存,数据模型互不相干(见下面"MVP v2 数据库变更"一节):

| 路径 | 说明 |
| --- | --- |
| `/listings` | 新版广告位/服务列表,读 `listings` 表(只显示 `status='active'` 的) |
| `/listings/[id]` | 详情页:分类标签、价格、卖家信息、购买按钮(Stripe Checkout)、联系卖家 |
| `/dashboard/new-listing` | 发布表单:英文标题/描述、类目多选、价格(最低 $0.99)、计价单位、媒体上传。卖家没开通 Stripe 也能提交,但落库状态强制是 `draft`,买家看不到 |
| `/dashboard/stripe-connect` | Stripe Connect Express 开户入口,发布的 listing 要 `stripe_onboarded=true` 才会变成 `active` |
| `/dashboard/sales` | 卖家看到自己 listing 收到的订单,`paid_in_escrow` 状态下可以提交交付凭证链接把订单推进到 `delivered` |
| `/dashboard/purchases` | 买家看到自己下的单,`delivered` 状态下可以"确认收到"触发放款(或 3 天后自动放款,见 `/api/cron/auto-confirm`) |
| `/dashboard/messages`、`/dashboard/messages/[listingId]/[otherUserId]` | 绑在某个 listing 下的一对一消息,不是群聊 |
| `/api/stripe/webhook` | Stripe webhook:`account.updated` 刷新 `stripe_onboarded`,`checkout.session.completed` 把订单推进到 `paid_in_escrow` |
| `/api/cron/auto-confirm` | 需要外部定时器(Vercel Cron / Supabase pg_cron)调用,处理买家超时未确认的自动放款,见下面"收付款设计要点" |

## 预订日历怎么工作的

- 从 `orders` 表读出该广告位所有 `pending_payment` / `paid` / `in_progress` 状态的订单,算出哪些日期已被占用(`src/lib/booking.ts`)
- 日历里点任意一个空闲日期,会高亮从那天起、连续 `duration_days` 天的整个档期;跟已有预订冲突会变红并禁止提交
- 点"预订"提交后,`src/app/spaces/[id]/actions.ts` 会**用数据库里最新的订单重新校验一遍**该档期是否还空着(防止两人同时抢同一天),校验通过就插入一条 `status: pending_payment` 的订单
- 卖家在"收到的预订请求"页确认后,状态变成 `confirmed`;买家在"我的预订"页对 `confirmed` 的订单会看到"去支付"按钮,走 Stripe Checkout 完成真正扣款(见下面"支付流程"一节),支付成功后 webhook 把状态推进到 `paid`

## 支付流程(Stripe Connect)

用的是 **Stripe Connect · Express 账户 + destination charge**:买家在 Stripe 托管的 Checkout 页付款,钱直接转进卖家的连接账户,平台不经手资金,也还没抽成(`payment_intent_data.transfer_data.destination` 转全额给卖家,没设置 `application_fee_amount`)。

流程:

1. 卖家在 `/dashboard/payments` 点"连接 Stripe 账户"(`src/app/dashboard/payments/actions.ts` → `startStripeOnboardingAction`),后端建一个 Stripe Express account、存 `stripe_account_id`,跳到 Stripe 托管的入驻表单(Account Link)
2. 卖家资料填完、Stripe 审核通过后,Stripe 发 `account.updated` webhook,把 `seller_profiles.stripe_charges_enabled` / `stripe_payouts_enabled` 更新成 `true`
3. 买家的订单被卖家确认(`confirmed`)后,在 `/dashboard/bookings` 点"去支付"(`src/app/dashboard/bookings/actions.ts` → `createCheckoutSessionAction`),后端校验订单属于当前买家且状态是 `confirmed`、卖家 `stripe_charges_enabled` 为真,才会建 Stripe Checkout Session 并跳转过去;卖家还没连好 Stripe 时会提示"卖家还没完成收款设置"
4. 买家付款成功后,Stripe 发 `checkout.session.completed` webhook 到 `/api/stripe/webhook`(`src/app/api/stripe/webhook/route.ts`),校验签名后把订单从 `confirmed` 推进到 `paid`、记下 `stripe_payment_intent_id`

**Webhook 用的是 service_role key,不是 RLS**:Stripe 的 webhook 请求没有买家/卖家的登录态,没法靠 `auth.uid()` 的 RLS 策略去改别人的订单/资料,所以 `/api/stripe/webhook` 单独用 `SUPABASE_SERVICE_ROLE_KEY`(`src/lib/supabase/service.ts` → `createServiceClient`)绕过 RLS,安全性完全靠 `stripe.webhooks.constructEvent` 校验请求确实来自 Stripe、带着正确签名。这个 key 只应该出现在服务端环境变量里,不能加 `NEXT_PUBLIC_` 前缀,也不能在这个文件之外的地方 import `service.ts`。

**这个 webhook 端点同时服务老流程和下面的 MVP v2**:Stripe 后台一个项目只挂得了一个 webhook 端点,`src/app/api/stripe/webhook/route.ts` 里 `account.updated` 会同时尝试更新 `seller_profiles`(老流程)和 `profiles`(MVP v2)两边的字段,`eq()` 匹配不到目标账户 id 的那一半就是无操作;`checkout.session.completed` 先按 `metadata.order_id` 试着把老流程的 `orders` 从 `confirmed` 推进到 `paid`,一行都没改到(说明这不是老流程的订单)才去按 MVP v2 的 `listing_orders` 处理。新增/修改任何一边的 webhook 逻辑时,注意别改坏另一边。

**本地测试 webhook**:装 [Stripe CLI](https://docs.stripe.com/stripe-cli),跑 `stripe listen --forward-to localhost:3000/api/stripe/webhook`,它会打印一个 `whsec_...`,填到 `.env.local` 的 `STRIPE_WEBHOOK_SECRET`。线上部署时去 Stripe 后台 Developers → Webhooks 加一个指向 `https://hereforads.com/api/stripe/webhook` 的 endpoint,订阅 `checkout.session.completed` 和 `account.updated` 这两个事件,把后台生成的 signing secret 填到部署环境的 `STRIPE_WEBHOOK_SECRET`。

**还没做的**:卖家没连 Stripe 时依然可以正常发布广告位、收到预订请求(只是买家到付款那一步会被挡住),没有强制卖家先连好 Stripe 才能收预订;没有退款(`refunded`)流程;没有平台抽成。

## 数据库(Supabase 项目 `myadsspace`, ref `jnfllsllahunbfgpopfv`)

这个 Supabase 项目是团队独立建的,不在这个开发环境的 MCP 直连列表里,所以下面的表结构是靠让人截图/贴 SQL 核对出来的,**不是**从 schema 自动生成,如果后续表结构变了这份文档要记得手动更新。

### 本项目用到的表

- **profiles**(`id` uuid PK, `role` user_role, `display_name` text, `created_at`, `updated_at`)——目前**没有任何页面能编辑 `display_name`**,所以卖家信息一直显示"匿名卖家"
- **ad_spaces**(`id`, `seller_id`→profiles, `space_type` ad_space_type, `title`, `description`, `keyword` text, `photo_urls` text[] NOT NULL, `city`, `latitude`/`longitude` numeric NOT NULL(现在恒为 0,表单已不采集,纯历史遗留字段), `price_amount`, `price_currency`, `duration_days` int NOT NULL, `status` ad_space_status, `created_at`, `updated_at`)
- **seller_profiles**(`user_id`→profiles, `bio`, `avatar_url`, `is_verified` bool, `stripe_account_id` text, `stripe_charges_enabled` bool, `stripe_payouts_enabled` bool, ...)——`/dashboard/profile` 页可以编辑 `bio`/`avatar_url`,`is_verified` 仍只读(没有人工审核入口);`stripe_*` 三列是这次接支付新加的,见下面"支付流程"一节
- **social_accounts**(`id`, `user_id`→profiles, `platform` social_platform, `handle`, `url` text, `follower_count` integer 可空, ...)——`/dashboard/profile` 页可以新增/编辑/删除;`url` 和 `handle` 至少填一个
- **orders**(`id`, `ad_space_id`, `buyer_id`, `seller_id`, `payment_channel`, `amount`, `currency`, `status` order_status, `start_date`/`end_date` date, `stripe_checkout_session_id` text, `stripe_payment_intent_id` text, ...)——预订日历在用,`start_date`/`end_date` 是早前加的列,`stripe_checkout_session_id`/`stripe_payment_intent_id` 是这次接支付新加的

### 已知但本项目暂未使用的表

`campaigns`(`order_id`, `creative_url`, `caption`)、`payouts`、`proof_uploads`——大概率是订单确认后"买家提交广告创意"、"卖家提现"、"上架凭证"用的,目前代码完全没碰。

### 枚举取值(Database → Enumerated Types 核对过)

- `user_role`: `seller` / `buyer` / `both`(注册默认 `both`)
- `ad_space_type`: `wall` / `picture_frame` / `clothing_pocket` / `clothing_back` / `face_left` / `face_right` / `other`——**产品上暂时只用 `wall` 一种**,发布表单没有分类选择器,`src/app/dashboard/new-space/actions.ts` 里写死了 `DEFAULT_SPACE_TYPE = "wall"`。真实取值和展示文案在 `src/lib/supabase/enums.ts`,以后要放开分类选择,改这一个文件+表单加个 `<select>` 就行
- `ad_space_status`: `available` / `reserved` / `active_campaign` / `inactive`
- `social_platform`: `douyin` / `xiaohongshu` / `weibo` / `wechat_channel` / `youtube` / `instagram` / `tiktok` / `bilibili` / `other`
- `order_status`: `pending_payment` / `confirmed` / `rejected` / `paid` / `in_progress` / `completed` / `cancelled` / `refunded`(`confirmed`/`rejected` 是后加的值,见下面 RLS 策略章节的 `alter type` 语句,**这条还没确认在线上库里执行过**)
- `payment_channel`: `stripe` / `wechat_pay` / `alipay`(预订时先硬编码成 `stripe` 占位,没有真实选择/扣款)
- `payout_status`: `pending` / `paid` / `failed`

### RLS 策略(必须配置,否则对应功能会报"违反行级安全策略"或查出来是空的)

这几条是开发过程里一步步加上去的,记录在这里方便以后在新环境(比如建测试库)重新执行一遍:

```sql
-- profiles: 允许用户建自己的资料、所有人可查看
create policy "users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "anyone can view profiles"
on public.profiles for select
to anon, authenticated
using (true);

-- ad_spaces: 卖家只能建自己的,所有人可查看
create policy "sellers can insert own ad_spaces"
on public.ad_spaces for insert
to authenticated
with check (auth.uid() = seller_id);

create policy "anyone can view ad_spaces"
on public.ad_spaces for select
to anon, authenticated
using (true);

-- ad_spaces 加关键词列(表单里的"关键词"字段用)
alter table public.ad_spaces add column if not exists keyword text;

-- ad_spaces: 卖家在"我的广告位"页编辑/删除自己的广告位要 UPDATE / DELETE 权限,
-- 之前漏配这两条策略,导致编辑保存、删除按钮点击后不会有任何变化(RLS 默认拒绝、静默 0 行)。
-- 代码这边已经加了检测(0 行时显示错误提示),但只有权限策略真的配上才会真正生效。
create policy "sellers can update own ad_spaces"
on public.ad_spaces for update
to authenticated
using (auth.uid() = seller_id)
with check (auth.uid() = seller_id);

create policy "sellers can delete own ad_spaces"
on public.ad_spaces for delete
to authenticated
using (auth.uid() = seller_id);

-- orders: 加预订日历用的起止日期列 + 策略
alter table public.orders add column if not exists start_date date;
alter table public.orders add column if not exists end_date date;

create policy "anyone can view orders"
on public.orders for select
to anon, authenticated
using (true);

create policy "buyers can create their own orders"
on public.orders for insert
to authenticated
with check (auth.uid() = buyer_id);

-- orders: 卖家在"收到的预订请求"页确认/拒绝订单要 UPDATE 权限,
-- 之前漏配这条策略,导致确认/拒绝按钮点击后状态不会变(RLS 默认拒绝、update 静默 0 行)
create policy "sellers can update their own orders"
on public.orders for update
to authenticated
using (auth.uid() = seller_id)
with check (auth.uid() = seller_id);

-- orders.status 实际是 Postgres 枚举类型 order_status,当初建表时只给了
-- pending_payment/paid/in_progress/completed/cancelled/refunded 这几个值。
-- 卖家"确认预订"/"拒绝"页要把状态改成 confirmed/rejected,枚举里没有这两个值会
-- 报 400 invalid input value for enum order_status,跟上面的 RLS 策略是两个独立问题,
-- 两个都要执行确认预订/拒绝才能真正生效。
alter type public.order_status add value if not exists 'confirmed';
alter type public.order_status add value if not exists 'rejected';

-- seller_profiles / orders: 接 Stripe Connect 支付新加的列
alter table public.seller_profiles add column if not exists stripe_account_id text;
alter table public.seller_profiles add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.seller_profiles add column if not exists stripe_payouts_enabled boolean not null default false;

alter table public.orders add column if not exists stripe_checkout_session_id text;
alter table public.orders add column if not exists stripe_payment_intent_id text;

-- orders: 买家在"我的预订"页发起 Stripe Checkout 时,要把生成的
-- session id 写回自己的订单。故意把 using/with check 都锁在
-- status = 'confirmed',这样这条策略只能用来在"待付款"状态下
-- 补写 stripe_checkout_session_id 这类字段,买家没法借着这条策略
-- 直接把 status 改成 paid(改了 with check 就不满足,会被拒绝)——
-- 真正把订单推进到 paid 只能通过 webhook 的 service_role key。
create policy "buyers can update their own confirmed orders"
on public.orders for update
to authenticated
using (auth.uid() = buyer_id and status = 'confirmed')
with check (auth.uid() = buyer_id and status = 'confirmed');

-- 注意:/api/stripe/webhook 改订单状态(推进到 paid)、改 seller_profiles 的
-- stripe_charges_enabled/stripe_payouts_enabled,走的是 service_role key,
-- 会绕过上面所有 RLS 策略,不需要专门为 webhook 开策略。

-- social_accounts: "个人资料"页新增/编辑/删除社交账号要的策略
create policy "anyone can view social_accounts"
on public.social_accounts for select
to anon, authenticated
using (true);

create policy "users can insert own social_accounts"
on public.social_accounts for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can update own social_accounts"
on public.social_accounts for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own social_accounts"
on public.social_accounts for delete
to authenticated
using (auth.uid() = user_id);

-- Storage: 广告位图片的 public bucket + 策略
insert into storage.buckets (id, name, public)
values ('ad-space-photos', 'ad-space-photos', true)
on conflict (id) do nothing;

create policy "public can view ad space photos"
on storage.objects for select
to public
using (bucket_id = 'ad-space-photos');

create policy "authenticated can upload their own ad space photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ad-space-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

## MVP v2 产品方案(权威决策记录)

这一节是从团队 2026-09-16 确认的《HereForAds MVP 产品方案》文档(Claude Docs,artifact id `f8644333-62bb-4bf1-a897-0bf72e4a5b6c`)搬过来的,原文档在协作工具里可以被随时编辑、容易跟代码库的实际状态脱节(之前就出现过一次:代码已经按确认过的 $0.99/12% 定价实现了,但文档没同步更新导致后来的 session 看着文档以为这俩数字还没拍板)。**从现在起这里是权威版本**——如果这里和 Claude Docs 那份文档对不上,以这里为准,发现不一致时顺手把那份文档也改一致。

**产品定位**:发布 + 交易工具,不是数字广告投放平台。卖家把能提供的"广告位/广告服务"连同价格发布出来,买家看到后点击购买、在站内完成整个交易;平台不做招商、不做媒介资源采买、不做广告效果投放/追踪,供给完全靠用户自发发布。范围要小:只做"发布"和"交易"这两件事的闭环。

**用户角色**:卖家、买家都不限国家、不限身份形式,只要合法合规。同一用户可以既是卖家也是买家,不做严格角色隔离。卖家典型画像是海外内容创作者/账号主(拥有能展示广告的数字空间,想变现);买家是愿意付费推广个人品牌或产品的任何人,以海外品牌/个体商家为主。

**为什么 MVP 先做海外(获客逻辑)**:"数字广告位"没有固定形式(照片/视频里的某块空间、账号 banner、bio link,也可以是实体空间但不是主力)。海外社交平台(Instagram/YouTube/TikTok 等)允许在个人主页/简介公开挂外链,卖家可以把 HereForAds 上的商品链接放进简介直接引流;国内平台(微信/小红书/抖音)普遍不允许公开招揽广告合作、不让挂外链,这条路暂时走不通,是 MVP 先做海外的直接原因。平台本身不做引流/推广,流量完全靠卖家自己在站外带进来。

**MVP 范围**(做什么/不做什么):

| 项目 | MVP 做法 |
| --- | --- |
| 界面语言 | 仅英文,发布表单提示 "Please describe in English" |
| 翻译 | 不做自动翻译,成本转嫁给用户自己用工具处理 |
| 广告位类型 | 不预设固定分类,由卖家自由描述 |
| 行业类目 | 固定枚举(`listing_category`,20 个),多选标签,不开放用户自定义 |
| 收付款 | 要做,不是占位符——没有真实支付卖家发了位卖不出去,产品跑不通 |
| 收款覆盖国家 | 仅 Stripe 支持地区,不含中国大陆(中国大陆无法开通 Stripe Connect 收款账户) |
| 纠纷/退款 | 不做产品化流程,出问题人工介入 |
| 可嵌入组件/插件 | 不做,但数据模型/URL 设计上为将来预留余地 |
| 咨询/私信 | MVP 就做,但只做最简形式——绑在某个 listing 下的一对一消息串,不做群聊 |

**已确认的关键决策**(不是待定,不要再当成开放问题问一遍):

- **托管放款超时 3 天**:对齐 Fiverr——卖家交付后买家 3 天内不确认/不申诉就自动完成放款
- **需要私信/咨询功能**:MVP 就做,绑在 listing 下的一对一消息串
- **卖家必须先 Stripe onboarded 才能发布**:Stripe Connect 账户没完成 KYC 前,listing 状态停留在 `draft`,买家看不到也下不了单
- **最低发布价 $0.99**:纯技术防呆(留一点余量在 Stripe 自己的最低收款额 $0.50 之上),不是商业门槛
- **平台佣金 12%**:参考 Etsy(6.5% 交易费 + 3%+$0.25 支付处理费,总负担约 10-12%,取上限);扣费顺序是卖家到手金额 = `amount − 实际 Stripe 手续费 − 12% 平台佣金`,两项都从卖家应得里扣,平台的 12% 收入不受 Stripe 手续费波动影响

**预留但 MVP 不写进代码的扩展点**(设计数据模型/页面结构时留了余地,不代表马上要做):可嵌入卡片/插件(需要每个 listing 有稳定可引用的公开 ID/URL)、自动翻译(卖家中文发布自动转英文给买家看,反之亦然)、中国卖家收款通道(候选方案 Airwallex,需要跟中文版一起上)、正式的纠纷/申诉系统、订阅收费模式(除交易抽成外的月费营收)。

## MVP v2 数据库变更(HereForAds MVP 产品方案)

这一节是"HereForAds MVP 产品方案"确认稿(定位:发布+交易工具,不是实体广告位日历预订)对应的新表结构,和上面 `ad_spaces`/`orders` 是两套**完全独立**的实体,新表都用了不会跟老表撞名的名字(`listings`/`listing_orders`/`listing_messages`),没有互相依赖,可以单独执行、单独回滚。

要不要下线老的 `ad_spaces`/日历预订流程、`orders` 表怎么处理,这版没有自动做,是团队后面要拍板的事——这份 SQL 只新增,不删除任何东西。

这个 Supabase 项目同样不在这个开发环境的 MCP 直连列表里(见上面"数据库"一节的说明),下面的 SQL 需要去 Supabase 后台手动执行。

```sql
-- ===== 新枚举类型 =====
create type public.listing_category as enum (
  'beauty_skincare','fashion_style','fitness_health','food_beverage','travel',
  'technology_gadgets','gaming','lifestyle','home_decor','parenting_family',
  'education_learning','arts_crafts','business_finance','automotive','sports',
  'music_entertainment','pets_animals','photography','comedy_entertainment','other'
);

create type public.pricing_unit as enum ('one_time','daily','weekly','monthly');

create type public.listing_status as enum ('draft','active','paused');

create type public.listing_order_status as enum (
  'pending_payment','paid_in_escrow','delivered','confirmed','released','expired_auto_confirmed'
);

-- ===== profiles 扩展:卖家 Stripe Connect 状态 =====
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists stripe_connect_account_id text;
alter table public.profiles add column if not exists stripe_onboarded boolean not null default false;

-- dashboard/profile 页面代码里已经在 update profiles,但老 README 的 RLS 记录里没有
-- 对应的 UPDATE 策略,不确定线上库是不是已经配过、只是没记录下来——如果执行时报策略已存在,跳过这条即可。
create policy "users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- ===== listings(卖家发布的广告位/服务)=====
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  title text not null,
  description text,
  categories public.listing_category[] not null default '{}',
  price_amount numeric not null,
  price_currency text not null default 'USD',
  pricing_unit public.pricing_unit not null default 'one_time',
  media_urls text[] not null default '{}',
  status public.listing_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listings enable row level security;

-- status='draft' 的 listing(卖家还没开通 Stripe)只有卖家自己能看到,买家看不到也搜不到。
create policy "anyone can view active listings, sellers can view their own"
on public.listings for select
to anon, authenticated
using (status = 'active' or seller_id = auth.uid());

create policy "sellers can insert own listings"
on public.listings for insert
to authenticated
with check (auth.uid() = seller_id);

create policy "sellers can update own listings"
on public.listings for update
to authenticated
using (auth.uid() = seller_id)
with check (auth.uid() = seller_id);

create policy "sellers can delete own listings"
on public.listings for delete
to authenticated
using (auth.uid() = seller_id);

-- ===== listing_orders(托管式交易订单,故意不叫 orders 以免跟老表混)=====
create table public.listing_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  amount numeric not null,
  currency text not null,
  status public.listing_order_status not null default 'pending_payment',
  proof_url text,
  start_date date,
  end_date date,
  paid_at timestamptz,
  delivered_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.listing_orders enable row level security;

create policy "buyers and sellers can view their own orders"
on public.listing_orders for select
to authenticated
using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "buyers can create their own orders"
on public.listing_orders for insert
to authenticated
with check (auth.uid() = buyer_id);

-- 状态流转的合法性(比如不能从 pending_payment 直接跳 released)在 Server Action /
-- webhook 里校验,这条 RLS 策略只负责"是不是这单的买家/卖家才能碰这一行"。
create policy "buyers and sellers can update their own orders"
on public.listing_orders for update
to authenticated
using (auth.uid() = buyer_id or auth.uid() = seller_id)
with check (auth.uid() = buyer_id or auth.uid() = seller_id);

-- ===== payments(只由 Stripe webhook 用 service_role key 写,不给普通用户开口子)=====
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.listing_orders(id),
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  platform_fee_amount numeric,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "buyers and sellers can view their own payments"
on public.payments for select
to authenticated
using (
  exists (
    select 1 from public.listing_orders o
    where o.id = payments.order_id
      and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  )
);
-- 故意不建 insert/update 策略:service_role key 会绕过 RLS,普通登录用户写不进这张表,
-- 保证支付记录只能由服务端 webhook(见 src/app/api/stripe/webhook/route.ts)写入。

-- ===== listing_messages(绑在某个 listing 下的一对一消息串,不做群聊)=====
create table public.listing_messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  sender_id uuid not null references public.profiles(id),
  receiver_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.listing_messages enable row level security;

create policy "sender and receiver can view their messages"
on public.listing_messages for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "authenticated users can send messages"
on public.listing_messages for insert
to authenticated
with check (auth.uid() = sender_id);
```

Listing 图片复用已有的 `ad-space-photos` public bucket,不用新建。

### 收付款设计要点(实现前必读)

- **卖家必须 `stripe_onboarded = true` 才能把 listing 状态从 `draft` 改成 `active`**,发布表单/action 里两头都要校验(RLS 只挡"是不是自己的 listing",挡不住状态值本身)
- **Charges & Transfers 模式**:买家在 Stripe Checkout 付款,钱先进平台自己的 Stripe 账户(不是 destination charge、不直接进卖家账户);卖家点"确认收到"或超时 3 天自动确认后,服务端才对卖家的 Connect 账户发起一笔 Transfer
- **佣金 12%**,参考 Etsy(6.5% 交易费 + 3%+$0.25 支付处理费,总负担约 10-12%,取上限)。扣费顺序:卖家到手金额 = `amount − 实际 Stripe 手续费 − 12% 平台佣金`,两项都从卖家应得里扣,平台的 12% 收入不受 Stripe 手续费波动影响
- **最低发布价 $0.99**,纯技术防呆(留一点余量在 Stripe 自己的最低收款额 $0.50 之上),不是商业门槛——具体到手净额薄不薄,是卖家自己的选择
- webhook 需要 `SUPABASE_SERVICE_ROLE_KEY`(在 Supabase 后台 Settings → API 里拿),**千万不能**带 `NEXT_PUBLIC_` 前缀、不能出现在任何浏览器端代码里,只在 `src/app/api/stripe/webhook/route.ts` 这种服务端专用文件里用

## 部署(Vercel)

- Environment Variables 里配 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`(类型选 Secret 或 Config 都行,`NEXT_PUBLIC_` 前缀的值反正都会被打进浏览器端代码,选哪个纯粹是 Vercel 后台能不能再看到明文的区别,不影响功能),再加支付相关的 `SUPABASE_SERVICE_ROLE_KEY`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`NEXT_PUBLIC_SITE_URL`(生产环境填 `https://hereforads.com`)——**前三个必须选 Secret**,不能带 `NEXT_PUBLIC_` 前缀
- `next.config.ts` 里把 Server Actions 的请求体上限从默认 1MB 调到了 10MB(`experimental.serverActions.bodySizeLimit`),不然发布广告位带图片会报 `Body exceeded 1 MB limit` 的 500 错误
- **`main` 才是 hereforads.com 实际部署的分支**(有 `public/logo.png` 品牌 logo 为证)。仓库另外还有一条 `claude/admiring-goldberg-8x70p7`,历史上曾各自独立合并过好几个 PR、跟 `main` 分叉了十几个提交,**没有连着线上环境**,不要在那条分支上开发——之前有 session 误在那条分支上开发、PR 也顺利合并了,但改动从未真正上线,排查了很久才发现。这条笔记之前写反过(说 admiring-goldberg 才是生产分支),已更正。

## 已知欠缺 / 下一步 TODO

- **支付抽成/退款未做**:Stripe Connect 付款流程已接入(见"支付流程"一节),但没有平台抽成,也没有退款(`refunded`)入口
- **没有强制卖家先连 Stripe 才能接单**:卖家没连 Stripe 账户也能正常发布广告位、收到预订请求,只是走到买家付款那一步会被挡住并提示"卖家还没完成收款设置"
- **`campaigns` 表未使用**:订单确认/付款后买家提交广告创意素材的流程还没做
- **图片管理简陋**:上传后不能删除单张、排序、换封面,只能整体重新提交
- **日历只显示当月**:跨月的预订档期在视觉上看不到下个月部分(不影响预订本身是否成功,纯展示局限)
- 未专门做移动端适配测试

以上是老流程的 TODO。下面是这版新搭的 MVP v2(`listings`/`listing_orders`)代码骨架的已知欠缺:

- **新旧两套流程并存,没有下线决定**:`/spaces` 和 `/listings` 现在都在跑,首页、Header 导航还没有二选一收敛,这是产品侧要拍板的事(见 README"MVP v2 数据库变更"一节开头的说明)
- **SQL 迁移还没在真实 Supabase 项目跑过**:这个开发环境连不上 `myadsspace` 项目(也连不上任何跟 HereForAds 对应的项目),README 里的 SQL 是写好等人工去 Supabase 后台执行的,没有被验证过
- **没配 Stripe webhook 端点**:`/api/stripe/webhook` 代码写了,但 Stripe 后台的 webhook 端点(或本地 `stripe listen`)还没配,`account.updated`/`checkout.session.completed` 不会真的送达 —— `/dashboard/stripe-connect` 页面加了一个兜底(打开页面时主动查一次 Stripe 账户状态),但支付确认(`checkout.session.completed`)完全依赖 webhook,不配的话订单会一直卡在 `pending_payment`
- **没配自动放款的定时触发器**:`/api/cron/auto-confirm` 端点写了,处理买家超时 3 天未确认的自动放款,但没有实际的 Vercel Cron / Supabase pg_cron 去调用它
- **没做真实的 Stripe 测试**:整条 Checkout → webhook → 托管 → 交付 → 确认 → Transfer 的链路只是照着 Stripe API 文档写的,没有用 Stripe 测试模式跑通过一次完整交易
- **退款/纠纷仍是人工**:产品方案里明确 MVP 不做,出问题需要人工去 Stripe 后台处理
- **没做自动翻译**、**没做可嵌入组件**、**没做中国卖家收款通道**:都是产品方案里明确列的"预留但 MVP 不做"
