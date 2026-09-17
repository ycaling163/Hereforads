# myadsspace

把个人实体空间（墙面、橱窗等)当广告位出租的小市场。卖家发布空间,买家在日历上选日期预订。参考风格: [thewall.ink](https://thewall.ink)——简洁、大字号、卡片式。

技术栈: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Auth / Postgres / Storage)。

> **开始干活前先看 [`WORKLOG.md`](./WORKLOG.md) 最近几条 + 本文件的决策记录**,这个仓库好几个 session 在并行改,只看代码/git log 容易漏掉背景和已经拍板的决策(教训见 WORKLOG 2026-09-17 那条)。改完之后记得回 WORKLOG 补一条。

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

**老的"实体广告位日历预订"流程(`/spaces`、`/dashboard/new-space`、`/dashboard/spaces`、`/dashboard/orders`、`/dashboard/bookings`、`/dashboard/payments` 及对应的日历预订 UI)已于 2026-09-17 整体下线**,原因和细节见 WORKLOG 同日期条目——测试阶段这套流程没有真实订单数据,团队确认往后只维护下面这一套 MVP v2(`listings`)流程,继续留着两套并存的导航/页面只会造成混淆。`ad_spaces`/`orders` 两张表本身**没有删**(不动数据库),只是代码里不再有任何页面读写它们;`src/lib/booking.ts`(日期区间/档期冲突计算)和当时的日历 UI 代码在删除前的 commit 里还能找到,以后 `listings` 要做"按天/周/月占用式预订"的日历时可以照抄这套逻辑,不用重新设计。

| 路径 | 说明 |
| --- | --- |
| `/` | 首页,推荐 `listings` 里 `status='active'` 的前几个 |
| `/login`、`/register` | 邮箱密码登录/注册,密码框带显示/隐藏切换。注册成功后自动在 `profiles` 建一条记录(`role='both'`);如果 Supabase 开了邮箱验证、注册时还没有 session,会在验证后**首次登录**时补建 |
| `/sellers/[id]` | 卖家公开主页:头像/简介/认证标记、全部社交账号、该卖家发布的全部 `listings`(卡片列表,只显示 `active`) |
| `/listings` | 广告位/服务列表,读 `listings` 表(只显示 `status='active'` 的) |
| `/listings/[id]` | 详情页:分类标签、价格、`pricing_unit='daily'` 时额外显示 `DailyCountdown`(每日档期刷新倒计时)、卖家信息、购买按钮(Stripe Checkout)、联系卖家 |
| `/dashboard` | 仪表盘总览:待处理订单数(需要交付/待确认收货)、近 30 天成交额、广告位状态分布 |
| `/dashboard/new-listing` | 发布表单:英文标题/描述、类目多选、价格(最低 $0.99)、计价单位、媒体上传。卖家没开通 Stripe 也能提交,但落库状态强制是 `draft`,买家看不到 |
| `/dashboard/my-listings` | 卖家自己发布的全部 listing(含 `draft`/`active`/`paused`),之前这里是空白(见旧版 WORKLOG"已知欠缺"),现在补上了 |
| `/dashboard/stripe-connect` | Stripe Connect Express 开户入口,发布的 listing 要 `stripe_onboarded=true` 才会变成 `active` |
| `/dashboard/sales` | 卖家看到自己 listing 收到的订单,`paid_in_escrow` 状态下可以提交交付凭证链接把订单推进到 `delivered` |
| `/dashboard/purchases` | 买家看到自己下的单,`delivered` 状态下可以"确认收到"触发放款(或 3 天后自动放款,见 `/api/cron/auto-confirm`) |
| `/dashboard/messages`、`/dashboard/messages/[listingId]/[otherUserId]` | 绑在某个 listing 下的一对一消息,不是群聊 |
| `/api/stripe/webhook` | Stripe webhook:`account.updated` 刷新 `stripe_onboarded`,`checkout.session.completed` 把订单推进到 `paid_in_escrow` |
| `/api/cron/auto-confirm` | 需要外部定时器(Vercel Cron / Supabase pg_cron)调用,处理买家超时未确认的自动放款,见下面"收付款设计要点" |

## 支付流程(Stripe Connect · Charges & Transfers)

现在只有 MVP v2 这一套支付流程,细节见下面"MVP v2 产品方案"和"收付款设计要点"两节。

**Webhook 用的是 service_role key,不是 RLS**:Stripe 的 webhook 请求没有买家/卖家的登录态,没法靠 `auth.uid()` 的 RLS 策略去改别人的订单/资料,所以 `/api/stripe/webhook` 单独用 `SUPABASE_SERVICE_ROLE_KEY`(`src/lib/supabase/service.ts` → `createServiceClient`)绕过 RLS,安全性完全靠 `stripe.webhooks.constructEvent` 校验请求确实来自 Stripe、带着正确签名。这个 key 只应该出现在服务端环境变量里,不能加 `NEXT_PUBLIC_` 前缀,也不能在这个文件之外的地方 import `service.ts`。

**`src/app/api/stripe/webhook/route.ts` 里还留着一段老流程的死代码**:`checkout.session.completed` 分支一开始会先按 `metadata.order_id` 试着把老流程的 `orders` 表从 `confirmed` 推进到 `paid`——老流程的下单入口(`bookSpaceAction`)已经随上面的页面一起删了,所以这个分支理论上永远不会再匹配到任何行,纯粹是多打一次没用的 Supabase 查询。留着没删是因为这段代码是这次排查 webhook 故障时刚验证工作正常的部分,不想在同一次改动里动支付相关代码增加风险;后面确认没问题了可以连着 `orders` 表一起清掉。

**本地测试 webhook**:装 [Stripe CLI](https://docs.stripe.com/stripe-cli),跑 `stripe listen --forward-to localhost:3000/api/stripe/webhook`,它会打印一个 `whsec_...`,填到 `.env.local` 的 `STRIPE_WEBHOOK_SECRET`。线上部署时去 Stripe 后台(注意现在 Stripe 用的是 **Sandboxes**,要在实际用来测试的那个 sandbox 里配,不是随便一个 Test mode)Developers → Webhooks 加一个指向 `https://hereforads.com/api/stripe/webhook` 的 endpoint,订阅 `checkout.session.completed` 和经典 `account.updated`(不是 Accounts v2 那组事件)这两个事件,把后台生成的 signing secret 填到部署环境的 `STRIPE_WEBHOOK_SECRET`。

## 数据库(Supabase 项目 `myadsspace`, ref `jnfllsllahunbfgpopfv`)

这个 Supabase 项目是团队独立建的,不在这个开发环境的 MCP 直连列表里,所以下面的表结构是靠让人截图/贴 SQL 核对出来的,**不是**从 schema 自动生成,如果后续表结构变了这份文档要记得手动更新。

### 本项目用到的表

- **profiles**(`id` uuid PK, `role` user_role, `display_name` text, `created_at`, `updated_at`)——目前**没有任何页面能编辑 `display_name`**,所以卖家信息一直显示"匿名卖家"
- **ad_spaces**、**orders**——老"实体广告位日历预订"流程的表,2026-09-17 随对应页面一起停用(见上面"页面一览"),表和数据都还在库里,只是**代码里已经没有任何地方读写它们**了(`src/app/api/stripe/webhook/route.ts` 里留了一段针对 `orders` 的死代码,见上面说明)
- **seller_profiles**(`user_id`→profiles, `bio`, `avatar_url`, `is_verified` bool, `stripe_account_id` text, `stripe_charges_enabled` bool, `stripe_payouts_enabled` bool, ...)——`/dashboard/profile` 页可以编辑 `bio`/`avatar_url`,`is_verified` 仍只读(没有人工审核入口);`stripe_*` 三列是老流程接支付时加的,现在 `stripe_account_id`/`stripe_charges_enabled`/`stripe_payouts_enabled` 这三列也没代码在读写了(MVP v2 卖家收款状态存在 `profiles.stripe_connect_account_id`/`stripe_onboarded`),但 `bio`/`avatar_url`/`is_verified` 仍是当前 `/dashboard/profile`、`/sellers/[id]` 在用的字段
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

- **托管放款超时 3 天**:对齐 Fiverr——卖家交付后买家 3 天内不确认/不申诉就自动完成放款
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

**老流程(`ad_spaces`/`orders` 日历预订)已经整体下线,不再是活跃的 TODO**——2026-09-17 已经把对应的页面、组件、`enums.ts`/`types.ts` 里的类型都删了,详见上面"页面一览"和 WORKLOG 同日期条目。老流程原来遗留的几条 TODO(支付抽成/退款、卖家收款前置校验、`campaigns` 表、图片管理、跨月日历展示)如果以后要在 MVP v2 上重新做,当参考,不再是要修的 bug。

下面是当前唯一在跑的 MVP v2(`listings`/`listing_orders`)已知欠缺:

- **SQL 迁移还没在真实 Supabase 项目跑过**:这个开发环境连不上 `myadsspace` 项目(也连不上任何跟 HereForAds 对应的项目),README 里的 SQL 是写好等人工去 Supabase 后台执行的,没有被验证过
- **没配自动放款的定时触发器**:`/api/cron/auto-confirm` 端点写了,处理买家超时 3 天未确认的自动放款,但没有实际的 Vercel Cron / Supabase pg_cron 去调用它
- **退款/纠纷仍是人工**:产品方案里明确 MVP 不做,出问题需要人工去 Stripe 后台处理
- **没做自动翻译**、**没做可嵌入组件**、**没做中国卖家收款通道**:都是产品方案里明确列的"预留但 MVP 不做"
- **占用式(daily/weekly/monthly)listing 还没有真正的档期日历**:`pricing_unit` 已经支持这几个值,`listings/[id]` 页对 `daily` 会显示"距离今日档期刷新"倒计时(`DailyCountdown` 组件),但还没有像老流程那样"选日期、按档期占用、冲突检测"的日历 UI——`getBlockingRanges`/`isRangeFree` 这套逻辑在删除前的 commit 里可以直接抄
- **`/dashboard/my-listings` 目前只是列表**,没有编辑/下架/重新提交入口,卖家要改 listing 内容还得联系人工
- **`/dashboard` 总览页统计比较粗糙**:"近 30 天成交额"是按 `paid_at` 落在 30 天内的订单金额原样相加(没扣手续费/佣金,多币种是分开显示不是换算合计),没有做历史趋势图

以下是已经解决、不用再查的老问题(留个记录):
- ~~Stripe webhook 没配~~——见本文件顶部"已解决"一节
- ~~没做真实的 Stripe 测试~~——已用 Stripe 测试卡跑通完整 Checkout → webhook → `paid_in_escrow` 链路
- ~~新旧两套流程并存,没有下线决定~~——已下线老流程
