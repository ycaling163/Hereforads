# myadsspace

把个人实体空间（墙面、橱窗等)当广告位出租的小市场。卖家发布空间,买家在日历上选日期预订。参考风格: [thewall.ink](https://thewall.ink)——简洁、大字号、卡片式。

技术栈: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Auth / Postgres / Storage)。

> **开始干活前先看 [`WORKLOG.md`](./WORKLOG.md) 最近几条 + 本文件的决策记录**,这个仓库好几个 session 在并行改,只看代码/git log 容易漏掉背景和已经拍板的决策(教训见 WORKLOG 2026-09-17 那条)。改完之后记得回 WORKLOG 补一条。
>
> **界面语言统一成英文了(2026-09-17)**:产品面向的是英文用户,之前中英文混杂(有些页面是早期原型阶段顺手写的中文)。以后新加页面/文案**一律写英文**,不要再顺手写中文 UI 文案——代码注释仍然可以是中文,给团队自己看,不影响这条规则。

## 已解决:webhook 收不到事件导致订单卡在"待支付"(2026-09-17)

**症状**:买家在 `/listings/[id]` 点"购买"、走完 Stripe Checkout 真实付款(测试卡 `4242 4242 4242 4242`,成功跳转回 `/dashboard/purchases?checkout=success`),但订单一直显示 `待支付`(`pending_payment`),没有推进到 `paid_in_escrow`。代码逻辑(`buyListingAction`、`/api/stripe/webhook` 的 `checkout.session.completed` 分支)是对的,问题始终出在"Stripe 事件有没有真正被投递到我们的 endpoint"这一层。

**真正的根因(排查过程中一度走了弯路,记录一下避免下次重复排查)**:

1. 排查过程中先发现域名 `hereforads.com`(IONOS 购买,nameserver 指向 Cloudflare)的 A 记录一度指向 IONOS 自己的服务器、且该记录和 `www` 的 CNAME 都开着 Cloudflare 橙色代理(Proxied)——这个问题**确实存在**,已经修好:A 记录改成 Vercel 官方 IP `76.76.21.21`,`hereforads.com`/`www.hereforads.com` 两条记录云朵图标都改成了灰色(DNS only)。但这个问题**不是订单卡住的直接原因**。
2. 真正原因:Stripe 最近把测试环境重构成了 **Sandboxes**(独立隔离环境,每个 sandbox 有自己的一整套 API keys / webhook 配置 / 客户数据,跟以前"一个开关切换 Test/Live mode"不是一回事)。之前配置的 webhook destination 是在旧版 Test mode 或另一个 sandbox 下配的,当前这个"Hereforads" sandbox(买家测试购买实际使用的 sandbox)里 **Webhooks 页面完全是空的,一个 destination 都没有**——Stripe 根本没有地方可以投递 `checkout.session.completed`,Vercel 那边 `/api/stripe/webhook` 路由查日志也确认零请求记录,不是"投递了但失败"。
3. 在当前 sandbox 里重新创建 webhook destination 时还踩了一个坑:新版创建界面默认建议勾选的是 "Accounts v2"(15 个事件),但代码里 `switch (event.type)` 判断的是经典 v1 事件名 `account.updated`,两者不是一回事——第一次没手动勾选 `account.updated`(只顾着勾 `checkout.session.completed`),导致 Connect 账户状态同步(`stripe_charges_enabled`/`stripe_onboarded`)那部分还是没生效,后来在 "All events" 里手动搜出经典 `account.updated` 补勾上才对。

**最终配置**(当前 "Hereforads" sandbox 下):webhook destination → Endpoint URL `https://hereforads.com/api/stripe/webhook`,订阅事件 `checkout.session.completed` + 经典 `account.updated`(不是 Accounts v2 那组);Vercel 环境变量 `STRIPE_WEBHOOK_SECRET` 已更新成这个 destination 的 signing secret 并重新部署。验证:再次测试购买后 Purchases 页面正确显示 `托管中`(`paid_in_escrow`)。

**遗留小尾巴**:这次排查期间(webhook 还没配好时)测试产生的几条老订单永久卡在 `待支付`,因为对应的 Stripe 事件从未被投递、不会重新触发——这些是 sandbox 测试数据,不影响真实流程,不用管,也可以直接在 Supabase 里手动清掉。

**这次顺带修好但跟这个问题无关的其他事**(不用重复排查):
- Stripe 新账户默认不让用 Accounts v1 API 建连接账户,已经去 Stripe 后台 `Settings → Features → Accounts v1 support` 打开了这个开关,现在能正常建 Express 连接账户
- `src/lib/stripe/server.ts` 之前在模块顶层直接 `new Stripe(...)`,导致 `STRIPE_SECRET_KEY` 没配置好时会把整个 Vercel 构建炸掉,已经改成 Proxy 惰性初始化,commit `7c1202c`

**"等会一起改"的功能缺口,2026-09-17 当天后来都补上了**:~~卖家没有"我的广告位"列表页~~(见 `/dashboard/my-listings`)、~~Sales 页面点订单看不到买家身份/联系方式~~(现在每张订单卡片显示买家昵称 + 私信链接,仍然没有单独的订单详情页)、~~私信没有未读提示~~(见下面 `listing_messages.read_at`)。

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

**老的"实体广告位日历预订"流程(`/spaces`、`/dashboard/new-space`、`/dashboard/spaces`、`/dashboard/orders`、`/dashboard/bookings`、`/dashboard/payments` 及对应的日历预订 UI)已于 2026-09-17 整体下线**,原因和细节见 WORKLOG 同日期条目——测试阶段这套流程没有真实订单数据,团队确认往后只维护下面这一套 MVP v2(`listings`)流程,继续留着两套并存的导航/页面只会造成混淆。`ad_spaces`/`orders` 两张表本身**没有删**(不动数据库),只是代码里不再有任何页面读写它们;`src/lib/booking.ts`(日期区间/档期冲突计算)和当时的日历 UI 代码在删除前的 commit 里还能找到,以后 `listings` 要做"按天/周/月占用式预订"的日历时可以照抄这套逻辑,不用重新设计。

| 路径 | 说明 |
| --- | --- |
| `/` | 首页,推荐 `listings` 里 `status='active'` 的前几个 |
| `/login`、`/register` | 邮箱密码登录/注册,密码框带显示/隐藏切换。注册成功后自动在 `profiles` 建一条记录(`role='both'`);如果 Supabase 开了邮箱验证、注册时还没有 session,会在验证后**首次登录**时补建 |
| `/sellers/[id]` | 公开主页:头像/简介/认证标记/内容领域、全部社交账号、该用户发布的全部 `listings`(卡片列表,只显示 `active`)。路由名叫 `sellers` 但代码里没有按 `role` 做区分,任何 `profiles.id`(包括纯买家)都能查看,Sales 页拿这个路由给买家做个人主页链接 |
| `/listings` | "Ad spaces" 广告位/服务列表,读 `listings` 表(只显示 `status='active'` 的) |
| `/listings/[id]` | 详情页:分类标签、价格、`pricing_unit='daily'` 时额外显示 `DailyCountdown`(每日档期刷新倒计时)、卖家信息、购买按钮(Stripe Checkout)、联系卖家 |
| `/dashboard` | 仪表盘总览:待处理订单数(需要交付/待确认收货)、近 30 天成交额、广告位状态分布 |
| `/dashboard/new-listing` | 发布表单:英文标题/描述、类目多选、价格(最低 $0.99)、计价单位、媒体上传。卖家没开通 Stripe 也能提交,但落库状态强制是 `draft`;开通 Stripe 之后提交进 `pending_review`(2026-09-18 起,见下面"管理员系统"),不是直接 `active`,买家在管理员审核通过之前都看不到 |
| `/dashboard/my-listings` | 卖家自己发布的全部 listing(`draft`/`pending_review`/`active`/`paused`/`rejected`/`removed` 都看得到),之前这里是空白(见旧版 WORKLOG"已知欠缺"),现在补上了 |
| `/dashboard/stripe-connect`("Payment Management") | 没连 Stripe 时是 Express 开户入口(发布的 listing 要 `stripe_onboarded=true` 才会变成 `active`);连好之后改显示"Total sales"(`listing_orders` 里排除 `pending_payment` 的金额之和)、"Available to withdraw"/"Pending"(直接调 Stripe Balance API,`stripe.balance.retrieve({}, {stripeAccount})`,不是从自己数据库估算的)、一个跳到 Stripe Express 自带 Dashboard 的按钮(`stripe.accounts.createLoginLink`,真正管理提现/打款节奏在 Stripe 那边,这个项目不自建提现流程) |
| `/dashboard/sales` | 卖家看到自己 listing 收到的订单,按状态分组:Awaiting payment(`pending_payment`)/New orders(`paid_in_escrow`,提交一个买家能核对的交付链接,推进到 `delivered`)/Delivered(`delivered`,等买家确认)/Completed(`confirmed`/`released`/`expired_auto_confirmed`);每张订单卡片显示买家昵称(点击跳买家的 `/sellers/[id]` 主页)、一个跳到跟买家私信页的链接、以及打款明细(总价 / 平台佣金 / Stripe 手续费 / 实际到手,后两项要等订单 `released` 才有值) |
| `/dashboard/purchases` | 买家看到自己下的单,`delivered` 状态下可以"确认收到"触发放款(或卖家标记交付后 `ESCROW_HOLD_DAYS` 天没反应就自动放款,见 `/api/cron/auto-confirm`) |
| `/dashboard/messages`、`/dashboard/messages/[listingId]/[otherUserId]` | 绑在某个 listing 下的一对一消息,不是群聊;打开某个会话会把对方发来的未读消息标记已读;可以只发图片不写字(比如甩效果图/参考图),没有邮件通知,得自己点进来看 |
| `/api/stripe/webhook` | Stripe webhook:`account.updated` 刷新 `stripe_onboarded`,`checkout.session.completed` 把订单推进到 `paid_in_escrow` |
| `/api/cron/auto-confirm` | 需要外部定时器(Vercel Cron / Supabase pg_cron)调用,处理卖家标记交付(`delivered`)后 `ESCROW_HOLD_DAYS` 天买家没反应的自动放款,见下面"平台责任边界"一节 |
| `/admin`、`/admin/listings`、`/admin/users`、`/admin/orders` | 管理员后台(2026-09-18 加,同日下午从 `/dashboard/admin/*` 挪到跟 `/dashboard` 平级的独立路由),只有 `admins` 表里有记录的账号能进,见下面"管理员系统"一节 |
| `/banned` | 账号被封禁后跳转到的静态说明页,不需要登录 |

## 支付流程(Stripe Connect · Charges & Transfers)

现在只有 MVP v2 这一套支付流程,细节见下面"MVP v2 产品方案"和"收付款设计要点"两节。

**Webhook 用的是 service_role key,不是 RLS**:Stripe 的 webhook 请求没有买家/卖家的登录态,没法靠 `auth.uid()` 的 RLS 策略去改别人的订单/资料,所以 `/api/stripe/webhook` 单独用 `SUPABASE_SERVICE_ROLE_KEY`(`src/lib/supabase/service.ts` → `createServiceClient`)绕过 RLS,安全性完全靠 `stripe.webhooks.constructEvent` 校验请求确实来自 Stripe、带着正确签名。这个 key 只应该出现在服务端环境变量里,不能加 `NEXT_PUBLIC_` 前缀,也不能在这个文件之外的地方 import `service.ts`。

**`src/app/api/stripe/webhook/route.ts` 里还留着一段老流程的死代码**:`checkout.session.completed` 分支一开始会先按 `metadata.order_id` 试着把老流程的 `orders` 表从 `confirmed` 推进到 `paid`——老流程的下单入口(`bookSpaceAction`)已经随上面的页面一起删了,所以这个分支理论上永远不会再匹配到任何行,纯粹是多打一次没用的 Supabase 查询。留着没删是因为这段代码是这次排查 webhook 故障时刚验证工作正常的部分,不想在同一次改动里动支付相关代码增加风险;后面确认没问题了可以连着 `orders` 表一起清掉。

**本地测试 webhook**:装 [Stripe CLI](https://docs.stripe.com/stripe-cli),跑 `stripe listen --forward-to localhost:3000/api/stripe/webhook`,它会打印一个 `whsec_...`,填到 `.env.local` 的 `STRIPE_WEBHOOK_SECRET`。线上部署时去 Stripe 后台(注意现在 Stripe 用的是 **Sandboxes**,要在实际用来测试的那个 sandbox 里配,不是随便一个 Test mode)Developers → Webhooks 加一个指向 `https://hereforads.com/api/stripe/webhook` 的 endpoint,订阅 `checkout.session.completed` 和经典 `account.updated`(不是 Accounts v2 那组事件)这两个事件,把后台生成的 signing secret 填到部署环境的 `STRIPE_WEBHOOK_SECRET`。

**`charges_enabled` 能收款,不代表 `payouts_enabled` 能提现——这是 Stripe 两个独立的能力位**:卖家开户时 Stripe 有可能先让账户能收款(能发布 listing、能被买),但银行账户还没填/还没审核完,这时候 `payouts_enabled` 是 `false`,卖家能卖但提不出钱。`/dashboard/stripe-connect`(Payment Management)页现在会分别查这两个字段,`payouts_enabled` 为 `false` 时会在页面顶部显示一条提示 + "Finish payout setup" 按钮,不会假装一切正常。**注意 `profiles.stripe_onboarded` 这个数据库字段目前只跟踪 `charges_enabled && details_submitted`,不包含 `payouts_enabled`**——这个是有意的(它原本的作用是"能不能把 listing 发布成 active",不是"能不能提现"),`payouts_enabled` 是每次进这个页面时实时从 Stripe 查的,没有存库。

**打款币种是卖家自己银行账户决定的,不是这个项目里选的**:卖家在 Stripe 托管的开户表单里填的是银行账户(英国填 sort code,美国填 routing number),账户自带的默认结算币种(`account.default_currency`)就是打款币种。如果卖家的 listing 用了别的币种(比如英国卖家发布了一个标 USD 的 listing),钱会先以 USD 形式进 Stripe 账户余额,真正打款时 Stripe 自动换算成账户的默认币种,扣一笔小额换汇手续费——这个项目不用、也不该去手动处理换汇,Payment Management 页在检测到"卖了非默认币种"时会显示一行提示文字说明这件事。

## 数据库(Supabase 项目 `myadsspace`, ref `jnfllsllahunbfgpopfv`)

这个 Supabase 项目是团队独立建的,不在这个开发环境的 MCP 直连列表里,所以下面的表结构是靠让人截图/贴 SQL 核对出来的,**不是**从 schema 自动生成,如果后续表结构变了这份文档要记得手动更新。

### 本项目用到的表

- **profiles**(`id` uuid PK, `role` user_role, `display_name` text, `created_at`, `updated_at`)——目前**没有任何页面能编辑 `display_name`**,所以卖家信息一直显示"匿名卖家"
- **ad_spaces**、**orders**——老"实体广告位日历预订"流程的表,2026-09-17 随对应页面一起停用(见上面"页面一览"),表和数据都还在库里,只是**代码里已经没有任何地方读写它们**了(`src/app/api/stripe/webhook/route.ts` 里留了一段针对 `orders` 的死代码,见上面说明)
- **seller_profiles**(`user_id`→profiles, `bio`, `avatar_url`, `is_verified` bool, `content_categories` `listing_category[]`(2026-09-17 新加,见下面"MVP v2 数据库变更"), `stripe_account_id` text, `stripe_charges_enabled` bool, `stripe_payouts_enabled` bool, ...)——`/dashboard/profile` 页可以编辑 `bio`/`avatar_url`/`content_categories`,`is_verified` 仍只读(没有人工审核入口);`stripe_*` 三列是老流程接支付时加的,现在 `stripe_account_id`/`stripe_charges_enabled`/`stripe_payouts_enabled` 这三列也没代码在读写了(MVP v2 卖家收款状态存在 `profiles.stripe_connect_account_id`/`stripe_onboarded`),但 `bio`/`avatar_url`/`is_verified`/`content_categories` 仍是当前 `/dashboard/profile`、`/sellers/[id]` 在用的字段。**`content_categories` 是创作者自己的内容领域,跟 `listings.categories`(这个具体广告位接哪些品牌类目的广告)是两个独立概念,不要混淆**
- **social_accounts**(`id`, `user_id`→profiles, `platform` social_platform, `handle`, `url` text, `follower_count` integer 可空, ...)——`/dashboard/profile` 页可以新增/编辑/删除;`url` 和 `handle` 至少填一个

### 已知但本项目暂未使用的表

`campaigns`(`order_id`, `creative_url`, `caption`)、`payouts`、`proof_uploads`——大概率是订单确认后"买家提交广告创意"、"卖家提现"、"上架凭证"用的,目前代码完全没碰。

### 枚举取值(Database → Enumerated Types 核对过)

- `user_role`: `seller` / `buyer` / `both`(注册默认 `both`)
- `social_platform`: `douyin` / `xiaohongshu` / `weibo` / `wechat_channel` / `youtube` / `instagram` / `tiktok` / `bilibili` / `other`
- `payout_status`: `pending` / `paid` / `failed`
- `ad_space_type`/`ad_space_status`/`order_status`/`payment_channel` 这几个是老流程的枚举,库里还在(没删表),但 `src/lib/supabase/enums.ts` 里对应的 TS 定义已经随老流程页面一起删了,不用再管

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

- **托管放款确认窗口 3 天**:对齐 Fiverr——卖家标记交付后买家 3 天内不确认/不申诉就自动完成放款(2026-09-18 一度改成"从付款时间起算、不用等交付",发现这样卖家什么都不做也能靠超时拿钱,当天又改了回来,见下面"平台责任边界"一节的完整记录)
- **需要私信/咨询功能**:MVP 就做,绑在 listing 下的一对一消息串
- **卖家必须先 Stripe onboarded 才能发布**:Stripe Connect 账户没完成 KYC 前,listing 状态停留在 `draft`,买家看不到也下不了单
- **最低发布价 $0.99**:纯技术防呆(留一点余量在 Stripe 自己的最低收款额 $0.50 之上),不是商业门槛
- **平台佣金 12%**:参考 Etsy(6.5% 交易费 + 3%+$0.25 支付处理费,总负担约 10-12%,取上限);扣费顺序是卖家到手金额 = `amount − 实际 Stripe 手续费 − 12% 平台佣金`,两项都从卖家应得里扣,平台的 12% 收入不受 Stripe 手续费波动影响

**预留但 MVP 不写进代码的扩展点**(设计数据模型/页面结构时留了余地,不代表马上要做):可嵌入卡片/插件(需要每个 listing 有稳定可引用的公开 ID/URL)、自动翻译(卖家中文发布自动转英文给买家看,反之亦然)、中国卖家收款通道(候选方案 Airwallex,需要跟中文版一起上)、正式的纠纷/申诉系统、订阅收费模式(除交易抽成外的月费营收)。

## MVP v2 数据库变更(HereForAds MVP 产品方案)

这一节是"HereForAds MVP 产品方案"确认稿(定位:发布+交易工具,不是实体广告位日历预订)对应的新表结构,和上面 `ad_spaces`/`orders` 是两套**完全独立**的实体,新表都用了不会跟老表撞名的名字(`listings`/`listing_orders`/`listing_messages`),没有互相依赖,可以单独执行、单独回滚。

下线老流程的**代码**(页面/组件/类型定义)已经在 2026-09-17 做完(见上面"页面一览");`ad_spaces`/`orders` 这两张**表**要不要一起删,还是先留着当历史数据存档,是团队后面要拍板的事——这份 SQL 只新增,不删除任何东西。

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

-- ===== seller_profiles.content_categories(创作者自己的内容领域,2026-09-17 加)=====
-- 跟 listings.categories 是两个独立概念,不要混:content_categories 描述"这个创作者
-- 平时做什么内容"(卖家资料页填,买家在 /sellers/[id] 能看到);listings.categories
-- 描述"这个具体广告位愿意接哪些品牌类目的广告"(发布 listing 时填,可以跟卖家自己的
-- 内容领域完全不一样,比如手工博主也可以接时装/餐饮品牌的广告)。复用已有的
-- public.listing_category 枚举,不用新建类型。
alter table public.seller_profiles
  add column if not exists content_categories public.listing_category[] not null default '{}';

-- ===== payments.stripe_fee_amount / net_amount(打款明细,2026-09-17 加)=====
-- 之前 release.ts 算完 Stripe 手续费和卖家净到手金额就直接拿去发 Transfer,没有存库,
-- 卖家在 Sales 页看不到"100 英镑是怎么分的"。这两列在 released 之前读出来是 null
-- (Stripe 手续费只有真正发起 Transfer 那一刻才知道),释放后才会填上。
alter table public.payments add column if not exists stripe_fee_amount numeric;
alter table public.payments add column if not exists net_amount numeric;

-- ===== listing_messages.read_at(未读消息提示,2026-09-17 加)=====
-- 之前这张表连"已读"字段都没有,账号头像/侧边栏没法显示未读消息数。收件人打开
-- 会话页时会把 read_at 补上当前时间,null 就代表还没读。之前只建过 select/insert
-- 策略,没开 update 口子,收件人标记已读会被 RLS 拒绝(静默 0 行,不会报错但也不生效),
-- 这次补一条。
alter table public.listing_messages add column if not exists read_at timestamptz;

create policy "receiver can mark their messages read"
on public.listing_messages for update
to authenticated
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

-- ===== listing_messages.image_url(私信发图片,2026-09-17 加)=====
-- 沟通交付细节经常需要甩参考图/效果图,body 允许是空字符串(纯发图不写字)。
alter table public.listing_messages add column if not exists image_url text;
```

Listing 图片复用已有的 `ad-space-photos` public bucket,不用新建。

### 收付款设计要点(实现前必读)

- **卖家必须 `stripe_onboarded = true` 才能把 listing 从 `draft` 推进到 `pending_review`**(2026-09-18 起,`pending_review` 之后还要管理员审核通过才是 `active`,见下面"管理员系统"),发布表单/action 里两头都要校验(RLS 只挡"是不是自己的 listing",挡不住状态值本身)
- **Charges & Transfers 模式**:买家在 Stripe Checkout 付款,钱先进平台自己的 Stripe 账户(不是 destination charge、不直接进卖家账户);卖家标记交付、买家确认收货,或标记交付后 `ESCROW_HOLD_DAYS` 天买家没反应自动确认,服务端才对卖家的 Connect 账户发起一笔 Transfer(详见下面"平台责任边界"一节)
- **佣金 12%**,参考 Etsy(6.5% 交易费 + 3%+$0.25 支付处理费,总负担约 10-12%,取上限)。扣费顺序:卖家到手金额 = `amount − 实际 Stripe 手续费 − 12% 平台佣金`,两项都从卖家应得里扣,平台的 12% 收入不受 Stripe 手续费波动影响
- **最低发布价 $0.99**,纯技术防呆(留一点余量在 Stripe 自己的最低收款额 $0.50 之上),不是商业门槛——具体到手净额薄不薄,是卖家自己的选择
- webhook 需要 `SUPABASE_SERVICE_ROLE_KEY`(在 Supabase 后台 Settings → API 里拿),**千万不能**带 `NEXT_PUBLIC_` 前缀、不能出现在任何浏览器端代码里,只在 `src/app/api/stripe/webhook/route.ts` 这种服务端专用文件里用

## 平台责任边界与托管放款模型(2026-09-18 决策记录)

这是一次产品定位讨论的结论,不是随手改的实现细节,记下来防止以后又被当成"待定问题"重新问一遍。

**背景**:讨论"HereForAds 要不要做成一个更轻量的工具型产品"时,提出过要不要把 Stripe 变成可选(愿意的走 Stripe 托管、不愿意的走线下私下对接)。**这个方案被否决了**——理由是骗子会永远挑"线下"这条路(先在平台建立信任,再以"省手续费"为由劝人私下转账,这正是最常见的诈骗话术),而且交易是从平台开始的,出了事用户还是会怪到平台头上,开放线下通道不是分担风险,是主动放弃了唯一能管住风险的机制,责任却一点没甩掉。

**接着确认了一个无法绕开的事实**:只要走 Stripe Connect(现在用的 Charges & Transfers 模式),charge 是打在平台自己的 Stripe 账户上,买家发起的 dispute/chargeback 冲的也是平台账户,不是卖家——**这跟商业模式怎么包装无关,是架构层面的事实,平台没法通过"不对交易结果负责"的 ToS 措辞把这部分责任撇干净**。Stripe 还会盯着平台整体的 dispute rate,纠纷率太高的话平台账户本身有被冻结/关停的风险。

**最终确认的责任划分**(不是"平台完全不担责",是划清哪部分能免、哪部分不能免):

- **可以免责的**:广告位实际效果好不好、卖家有没有按时上线广告——这些是履约内容问题,平台不做交付/纠纷的裁定
- **免不掉的**:钱本身有没有安全到账、Stripe 层面的拒付/欺诈风险——这部分从接入 Stripe Connect 那天起就是平台的,只能想办法把概率和敞口压小,不能假装不存在

**落地到产品/代码上的调整**(这次讨论最终定下来的做法):

1. **托管放款仍然要求卖家先标记交付,不是纯粹的付款后计时器**——这是当天讨论中间走过一段弯路又改回来的地方:一度试过"资金冻结期直接从付款时间起算,不管卖家有没有交付都自动放款",理由是"平台不裁定履约结果"。但反馈很直接:**没有交付信号,买家不会愿意提前确认放款;如果卖家收了钱什么都不做,躺过冻结期照样能自动拿到钱,这比原来的模型对买家更不利,不是更轻量**。修正后的设计:卖家必须先在 `/dashboard/sales` 提交一个交付链接、把订单标记成 `delivered`(`markDeliveredAction`,写 `listing_orders.proof_url`/`delivered_at`),订单才会进入买家确认窗口;`ESCROW_HOLD_DAYS`(`src/lib/supabase/enums.ts`,目前 3 天)从卖家标记交付的时间(`delivered_at`)起算,不是从付款时间起算。买家可以随时在 `/dashboard/purchases` 点"Confirm receipt"提前确认放款,也可以什么都不做等窗口到期后 `/api/cron/auto-confirm` 自动放款。**卖家不标记交付,订单会一直停在 `paid_in_escrow`,永远不会被这个定时任务碰到**——不存在"零操作靠超时拿钱"的路径。
2. **这不等于平台在裁定履约质量**——平台不验证卖家提交的交付链接是否属实、广告内容好不好,只是要求卖家做一次自证式的操作再开始计时,这个区别很重要:平台仍然不介入"广告效果好不好"这类主观判断,只是不允许卖家绕过任何交付信号就拿到钱。
3. **卖家侧的 Stripe Connect 开户(KYC)仍然是发布前置条件,保留不变**——这是防欺诈的主要防线,一个愿意做完整身份验证、绑定真实银行账户的卖家,跑路/诈骗的概率远低于随便填资料就能发帖的人,比逐条审核内容更有效、成本也更低。
4. **管理员的举报/封禁机制(见下面"管理员系统"一节)定位保持不变**——是控制"同一个账号反复作案拉高平台 dispute rate"的风险,不是对每笔交易纠纷做裁定,两者不冲突。
5. **只要走 Stripe Connect,平台对 chargeback/dispute 的财务敞口就甩不掉**——这部分风险不会因为"卖家标记交付"这道流程而消失,只是通过要求交付信号 + 卖家 KYC 门槛,把"完全零成本诈骗"的路径堵掉,敞口本身仍然存在,需要持续关注 Stripe 的 dispute rate。
6. **收入模式的进一步调整(挂牌费/排名费/联盟营销,取代或补充交易抽成)在这轮只做了讨论,没有落地成代码**——这是明确的未来事项,不要误以为已经实现。

**这次代码改动的范围**:`src/lib/supabase/enums.ts` 里 `AUTO_CONFIRM_DAYS` 改名成了 `ESCROW_HOLD_DAYS`(名字更通用,但语义还是"卖家标记交付后的确认窗口天数",不是"付款后");`src/app/dashboard/purchases/actions.ts` 里 `confirmReceiptAction` 改名 `releaseNowAction`(逻辑不变,仍然要求订单先到 `delivered` 状态才能提前放款)。其余文件(`/api/cron/auto-confirm`、`/dashboard/sales`、`/dashboard/sales/actions.ts` 的 `markDeliveredAction`、`/dashboard/purchases`、`/dashboard` 总览统计、`/dashboard/stripe-connect`、`src/components/DeliverOrderForm.tsx`)最终跟改动前的逻辑一致——当天讨论中间有一版把这些都改成了"付款后计时、不要求交付"的模型,发现有前面第 1 条说的漏洞后又改了回来,这里的说明就是改回来之后的最终状态。`listing_orders.status` 用的 Postgres 枚举类型全程没有改动,没有需要执行的新 SQL。

### 线下交易技术上防不住,但这不改变平台的立场(供以后写 Terms / 隐私政策时用)

紧接着上面的讨论,又确认了一层:**只要买卖双方能在平台上互相发消息,他们随时可以交换微信/WhatsApp/邮箱,然后在平台看不到的地方私下谈价格、收款、交付——这一点技术上无法 100% 防住**。这不是 HereForAds 独有的问题,Upwork/Fiverr/Airbnb/Etsy 这些做了十几年的平台一样堵不住,只要允许双方沟通就必然存在这个缺口。

**但这个事实不改变责任边界,反而是"不要主动开放线下选项"这条决策的另一层理由**。关键不是"能不能完全防住线下交易"(做不到,谁都做不到),是"这条路是不是平台自己设计、提供、鼓励的":

- 平台主动做一个"走 Stripe 还是走线下"的开关——这是平台自己设计、给了入口的机制,出事没法说"这跟我们没关系",因为路是平台修的。**这条已经被否决,见上面的决策记录。**
- 两个用户在私信里自己商量绕开平台——这是用户违反平台条款自行做的事,只要条款写清楚,平台的立场站得住:这是用户自己违规操作,不是平台设计或纵容的。

**接下来要做的三件事**(这轮讨论只记录结论,还没有写成正式的 Terms of Service / Privacy Policy,也没有落地成代码,是明确的后续事项):

1. **服务条款(Terms of Service)里要写清楚**:平台的保护(托管放款、纠纷协助、封号机制)只覆盖通过 Stripe 完成的交易,私下达成的交易平台一概不负责、不介入、不提供纠纷协助——这是法律和舆论立场的基础,决定了出事之后平台是否需要担责。
2. **消息系统(`listing_messages`)里做轻量检测提醒**:识别消息内容里的电话号码/邮箱/"加微信"这类模式,提示买家"为了资金安全,建议通过平台完成付款",不做硬性拦截(技术上也拦不住,口头交换联系方式、加密沟通都绕得开),但至少留一个"平台提醒过"的记录,对将来处理纠纷/证明平台已尽到提示义务有帮助——这里会产生新的隐私考量(平台要不要、能不能扫描私信内容找联系方式),写隐私政策时需要专门说明这一条,并明确扫描的目的仅限于风险提示,不用于其他用途。
3. **让走 Stripe 这条路本身足够顺、有吸引力**:低摩擦 checkout + 明确的"资金保护到交付确认"卖点,让大多数正常用户没有动机去费劲绕开平台;真正想绕开的多半是想诈骗的那批人,这批人无论怎么设计产品都会想办法绕,这部分只能靠举报 + 封号(已有的管理员机制,见上面"管理员系统"一节)去清理,不是产品设计能根治的问题。

**跟 Terms / Privacy Policy 相关的备注**:第 1 点直接决定 Terms of Service 里"平台责任范围"那一条怎么写;第 2 点一旦实现,会涉及"平台是否读取/扫描用户私信内容"这件事,必须在 Privacy Policy 里向用户披露,并且要讲清楚扫描的唯一目的和数据不会被另作他用,这个如果做的话不能只在 README 里记一句就算了。

## 管理员系统(2026-09-18 加)

用户反馈"广告位现在直接公开,需要有管理员后台"。拍板的方案:**新 listing 需要管理员事前审核才能公开**(不是先上线、管理员事后抽查下架),管理员这一版能做:审核/拒绝/下架/推荐 listing,封禁/解封用户账号,只读查看全站订单。

### 页面结构:`/admin/*` 是跟 `/dashboard/*` 平级的独立路由,不是嵌套子页面

第一版把管理员页面放在 `/dashboard/admin/*` 下面,复用个人 dashboard 的 `DashboardSidebar`,只是给 Admin 那组导航项加了个琥珀色边框做视觉区分。反馈是"个人和 admin 的内容一起了"——同一个侧栏、同一个 `dashboard/layout.tsx` 外壳,靠颜色区分不够,管理员和个人视角必须**不在同一个页面**。Next.js 的嵌套 layout 机制决定了只要 URL 还挂在 `/dashboard/` 前缀下,就一定会经过 `dashboard/layout.tsx` 这层壳(子 layout 没法"跳过"父 layout 的外框),所以唯一的解法是把整棵 admin 路由树挪到跟 `/dashboard` 平级的顶层路径:`src/app/dashboard/admin` → `src/app/admin`(`git mv` 保留文件历史),`admin/layout.tsx` 换成自己独立的深色导航条(Overview/Listings/Users/Orders + "← Back to my dashboard"),不再引用 `DashboardSidebar`。`DashboardSidebar`/`dashboard/layout.tsx` 也都回退成不知道 admin 状态的纯个人导航版本。入口从侧栏挪到了账号头像下拉菜单(`UserMenu.tsx`)里一条单独的"🛡 Admin"链接,只有 `isAdmin` 为真时才渲染,点进去就是完全独立的 `/admin` 页面,跟个人 dashboard 视觉和路由上都彻底分开。

### 权限模型:谁是管理员、为什么这么设计

**管理员身份存在一张独立的 `admins` 表里,不是 `profiles` 上的一个 `is_admin` 字段。** 原因:如果做成 `profiles.is_admin` 列,哪怕给它配了"只有 service_role 能改"的列权限,这张表本身的复杂度和其他业务字段混在一起,审计"到底谁是管理员"要在一堆别的列里翻;单独一张表,`select * from public.admins` 就是完整名单,而且这张表**除了"能查自己那一行"的 select 策略,没有给 `authenticated` 开任何 insert/update/delete 策略**——代码里不存在任何一条路径能让用户自己把自己加进这张表,加管理员只能人工去 Supabase 后台执行 SQL insert。第一个管理员必须这样手动加:

```sql
insert into public.admins (user_id) values ('<你自己账号的 uuid,去 profiles 表里查>');
```

### `listings.status` 状态机(更新)

```
draft --(卖家连好 Stripe 提交)--> pending_review --(管理员 approve)--> active --(管理员 remove)--> removed
                                       |
                                       +--(管理员 reject)--> rejected
active --(管理员 remove)--> removed
```

`draft`/`pending_review`/`rejected`/`removed` 这几个状态买家和首页都看不到(`isVisible = status==='active' || isOwnListing` 这条判断没变,新状态自然被挡住),卖家自己在 `/dashboard/my-listings` 能看到全部状态、包括是被拒绝还是被下架。**这版没有做"卖家收到拒绝理由后可以修改重新提交"的界面**——`rejected` 之后卖家没有编辑入口(`/dashboard/my-listings` 本来就还没做编辑功能,是已知欠缺),需要联系人工重新发布。

`is_featured`(管理员推荐/置顶)跟 `status` 是两个独立的布尔量,只在 `status='active'` 时才有意义,首页"Featured listings"和 `/listings` 列表都是 `order(is_featured desc, created_at desc)`,标了 `is_featured` 的排在最前面,卡片和列表页角标一个 "⭐ Featured"。

### 顺手补的一个安全洞:`listings.status`/`profiles.stripe_onboarded` 之前谁都能自己改

做审核流程时发现:`listings` 表"卖家能改自己的 listing"这条 RLS 策略(`sellers can update own listings`)**没有限制列**,只挡"是不是自己的 listing",没挡"能不能直接把 status 改成 active"——也就是说在这次改之前,**任何登录用户理论上都可以绕过前端,直接拿自己的 session 调 Supabase REST API 把自己的 listing 从 draft 改成 active,完全跳过审核**(甚至不需要真的连 Stripe)。同理 `profiles.stripe_onboarded`/`stripe_connect_account_id` 也是能被登录用户自己直接 PATCH 的(这两个字段决定"能不能发布"和"打款转给谁",伪造后果分别是绕过审核、把打款转到自己控制的另一个 Stripe 账户)。

这几个字段本来就应该只由服务端在验证过真实条件后写(Stripe webhook / 这次新加的管理员 action),不该开给 `authenticated` 角色。这次统一收回:

```sql
-- ===== 收回几个只应该由服务端写的敏感列的 UPDATE 权限 =====
-- RLS 的 using/with check 只挡"哪些行能碰",挡不住"这一行的哪些列能改"——
-- 下面这几列一旦被 RLS 允许更新自己那一行的策略覆盖到,登录用户就能直接拿自己的
-- session 调 REST API 改,不用经过任何服务端校验。REVOKE 是列级权限,跟 RLS 是
-- 两道独立的关卡,两道都要过才能真正写进去。
revoke update (is_banned, stripe_onboarded, stripe_connect_account_id)
  on public.profiles from authenticated;

revoke update (status, is_featured)
  on public.listings from authenticated;
```

**这条 REVOKE 上线前必须确认代码里所有对应字段的写入都已经切到 service_role client**,不然那几个功能会开始报权限错误。已经切好的:`src/app/dashboard/stripe-connect/page.tsx`(`stripe_onboarded` 兜底刷新)、`src/app/dashboard/stripe-connect/actions.ts`(`stripe_connect_account_id`)、`src/app/api/stripe/webhook/route.ts`(webhook 本来就是 service_role,没受影响)、`src/app/admin/**/actions.ts`(新加的管理员 action,原本在 `src/app/dashboard/admin/**/actions.ts`,后来挪到了跟 `/dashboard` 平级的 `/admin`,见上面"页面结构"一节)。`listings.status` 的初始值(`draft`/`pending_review`)是走 INSERT 设置的,REVOKE 只挡 UPDATE,INSERT 不受影响,发布表单不用改。

### 完整 SQL(管理员系统这部分)

```sql
-- ===== admins(管理员名单,没有给 authenticated 开任何写权限)=====
create table public.admins (
  user_id uuid primary key references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create policy "users can check their own admin status"
on public.admins for select
to authenticated
using (auth.uid() = user_id);

-- 故意不建 insert/update/delete 策略。加管理员只能人工执行:
-- insert into public.admins (user_id) values ('<uuid>');

-- ===== listings 状态机扩展 + 管理员推荐 =====
alter type public.listing_status add value if not exists 'pending_review';
alter type public.listing_status add value if not exists 'rejected';
alter type public.listing_status add value if not exists 'removed';

alter table public.listings add column if not exists is_featured boolean not null default false;

-- ===== profiles 封禁标记 =====
alter table public.profiles add column if not exists is_banned boolean not null default false;

-- ===== 收回敏感列的 UPDATE 权限(见上面"顺手补的一个安全洞"一节的说明)=====
revoke update (is_banned, stripe_onboarded, stripe_connect_account_id)
  on public.profiles from authenticated;

revoke update (status, is_featured)
  on public.listings from authenticated;
```

**`alter type ... add value` 这几条不能跟其他用到新枚举值的语句放在同一个事务/同一次执行里**(Postgres 的限制,新加的枚举值要等当前事务提交后才能用)——在 Supabase SQL Editor 里正常按顺序一条条执行没问题,只是如果以后要写自动化迁移脚本,这几条 `alter type` 得单独一批先跑、确认提交后再跑用到新值的部分。

### 封禁怎么生效的

封禁一个用户,`banUserAction`(`src/app/admin/users/actions.ts`)做了两件事:①把 `profiles.is_banned` 设成 `true`;②调 Supabase Auth 的管理员 API `supabase.auth.admin.updateUserById(userId, { ban_duration: "876000h" })` 真正在 GoTrue 层面封掉这个账号的登录能力(约 100 年,相当于永久,直到管理员解封)。只改数据库字段不够——用户手上现有的 access token 在过期刷新之前(通常一小时内)本来就还有效,`src/proxy.ts` 里加了一道每次请求都查 `is_banned` 的检查,发现被封立刻 `signOut()` 并跳到 `/banned` 页,不用等 token 自然过期。**这部分(尤其是 `auth.admin.updateUserById` 这个调用)没有在真实 Supabase 项目上跑通过**,这个开发环境连不上 `myadsspace` 项目,只做到了本地 `next build` 类型检查通过、API 签名跟官方文档核对一致,上线后第一次封禁需要人工验证一下效果。

### 已知欠缺(这版管理员系统的)

- 没有"卖家收到拒绝理由、修改后重新提交"的界面,`rejected` 是终态,只能联系人工
- 管理员看不到 listing 被拒绝/下架的历史原因(没有存 reason 字段,只有状态本身)
- 用户提到"管理员能定期发邮件或消息给用户"——这版没做,邮件通知本来就等 Resend 接入之后再说(见"已知欠缺"里的邮件通知那条);站内消息(`listing_messages`)是绑在某个 listing 下的一对一会话,不支持管理员群发/单独给某个用户发一条不挂靠 listing 的消息,这个需要额外设计(比如 `listing_id` 允许为 null),这版先没做
- 用户提到"审核先人工、后期机器人审核"——这版只做了人工审核界面,自动化审核(比如接一个内容审核 API 自动初筛)完全没做,是未来的事
- `/admin/orders` 只显示最近 200 条,没做分页/搜索/按状态筛选

## 部署(Vercel)

- Environment Variables 里配 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`(类型选 Secret 或 Config 都行,`NEXT_PUBLIC_` 前缀的值反正都会被打进浏览器端代码,选哪个纯粹是 Vercel 后台能不能再看到明文的区别,不影响功能),再加支付相关的 `SUPABASE_SERVICE_ROLE_KEY`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`NEXT_PUBLIC_SITE_URL`(生产环境填 `https://hereforads.com`)——**前三个必须选 Secret**,不能带 `NEXT_PUBLIC_` 前缀
- `next.config.ts` 里把 Server Actions 的请求体上限从默认 1MB 调到了 10MB(`experimental.serverActions.bodySizeLimit`),不然发布广告位带图片会报 `Body exceeded 1 MB limit` 的 500 错误
- **`main` 才是 hereforads.com 实际部署的分支**(有 `public/logo.png` 品牌 logo 为证)。仓库另外还有一条 `claude/admiring-goldberg-8x70p7`,历史上曾各自独立合并过好几个 PR、跟 `main` 分叉了十几个提交,**没有连着线上环境**,不要在那条分支上开发——之前有 session 误在那条分支上开发、PR 也顺利合并了,但改动从未真正上线,排查了很久才发现。这条笔记之前写反过(说 admiring-goldberg 才是生产分支),已更正。

## 已知欠缺 / 下一步 TODO

**老流程(`ad_spaces`/`orders` 日历预订)已经整体下线,不再是活跃的 TODO**——2026-09-17 已经把对应的页面、组件、`enums.ts`/`types.ts` 里的类型都删了,详见上面"页面一览"和 WORKLOG 同日期条目。老流程原来遗留的几条 TODO(支付抽成/退款、卖家收款前置校验、`campaigns` 表、图片管理、跨月日历展示)如果以后要在 MVP v2 上重新做,当参考,不再是要修的 bug。

下面是当前唯一在跑的 MVP v2(`listings`/`listing_orders`)已知欠缺:

- **SQL 迁移还没在真实 Supabase 项目跑过**:这个开发环境连不上 `myadsspace` 项目(也连不上任何跟 HereForAds 对应的项目),README 里的 SQL 是写好等人工去 Supabase 后台执行的,没有被验证过
- **没配自动放款的定时触发器**:`/api/cron/auto-confirm` 端点写了,处理资金冻结期(`ESCROW_HOLD_DAYS`,3 天)到期后的自动放款,但没有实际的 Vercel Cron / Supabase pg_cron 去调用它
- **退款/纠纷仍是人工**:产品方案里明确 MVP 不做,出问题需要人工去 Stripe 后台处理
- **没做自动翻译**、**没做可嵌入组件**、**没做中国卖家收款通道**:都是产品方案里明确列的"预留但 MVP 不做"
- **占用式(daily/weekly/monthly)listing 还没有真正的档期日历**:`pricing_unit` 已经支持这几个值,`listings/[id]` 页对 `daily` 会显示"距离今日档期刷新"倒计时(`DailyCountdown` 组件),但还没有像老流程那样"选日期、按档期占用、冲突检测"的日历 UI——`getBlockingRanges`/`isRangeFree` 这套逻辑在删除前的 commit 里可以直接抄
- **`/dashboard/my-listings` 目前只是列表**,没有编辑/下架/重新提交入口,卖家要改 listing 内容还得联系人工
- **`/dashboard` 总览页统计比较粗糙**:"近 30 天成交额"是按 `paid_at` 落在 30 天内的订单金额原样相加(没扣手续费/佣金,多币种是分开显示不是换算合计),没有做历史趋势图
- **没有邮件通知**:新私信、新订单只能靠登录后看账号头像/侧边栏的红点提示,没有发邮件提醒——用户已经明确说这个先不做,等要做的时候需要去注册 [Resend](https://resend.com)(或类似邮件服务)拿 API key
- **OG 分享图直接用的是 `logo.png`**:那张图是 968×157 的窄长 wordmark,不是标准 OG 图推荐的 1200×630 比例,分享到社交媒体/群聊时缩略图会比较小或者留白——以后如果要做得更好看,可以像 `src/app/icon.tsx` 那样用 `next/og` 的 `ImageResponse` 单独生成一张标准比例的分享卡片(`src/app/opengraph-image.tsx`),这次先用现成的 logo 顶上,没有另外做设计

以下是已经解决、不用再查的老问题(留个记录):
- ~~Stripe webhook 没配~~——见本文件顶部"已解决"一节
- ~~没做真实的 Stripe 测试~~——已用 Stripe 测试卡跑通完整 Checkout → webhook → `paid_in_escrow` 链路
- ~~新旧两套流程并存,没有下线决定~~——已下线老流程
