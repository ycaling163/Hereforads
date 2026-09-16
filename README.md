# myadsspace

把个人实体空间（墙面、橱窗等)当广告位出租的小市场。卖家发布空间,买家在日历上选日期预订。参考风格: [thewall.ink](https://thewall.ink)——简洁、大字号、卡片式。

技术栈: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Auth / Postgres / Storage)。

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

## 预订日历怎么工作的

- 从 `orders` 表读出该广告位所有 `pending_payment` / `paid` / `in_progress` 状态的订单,算出哪些日期已被占用(`src/lib/booking.ts`)
- 日历里点任意一个空闲日期,会高亮从那天起、连续 `duration_days` 天的整个档期;跟已有预订冲突会变红并禁止提交
- 点"预订"提交后,`src/app/spaces/[id]/actions.ts` 会**用数据库里最新的订单重新校验一遍**该档期是否还空着(防止两人同时抢同一天),校验通过就插入一条 `status: pending_payment` 的订单
- **还没接真实支付**——这一步只是把日期占上,状态停在"待确认"。后面接 Stripe/微信支付/宝真正扣款时,大概率要在这个 action 里加支付环节,并且需要一个卖家/系统确认订单、把状态推进到 `paid` 的地方(目前没有)

## 数据库(Supabase 项目 `myadsspace`, ref `jnfllsllahunbfgpopfv`)

这个 Supabase 项目是团队独立建的,不在这个开发环境的 MCP 直连列表里,所以下面的表结构是靠让人截图/贴 SQL 核对出来的,**不是**从 schema 自动生成,如果后续表结构变了这份文档要记得手动更新。

### 本项目用到的表

- **profiles**(`id` uuid PK, `role` user_role, `display_name` text, `created_at`, `updated_at`)——目前**没有任何页面能编辑 `display_name`**,所以卖家信息一直显示"匿名卖家"
- **ad_spaces**(`id`, `seller_id`→profiles, `space_type` ad_space_type, `title`, `description`, `keyword` text, `photo_urls` text[] NOT NULL, `city`, `latitude`/`longitude` numeric NOT NULL(现在恒为 0,表单已不采集,纯历史遗留字段), `price_amount`, `price_currency`, `duration_days` int NOT NULL, `status` ad_space_status, `created_at`, `updated_at`)
- **seller_profiles**(`user_id`→profiles, `bio`, `avatar_url`, `is_verified` bool, ...)——`/dashboard/profile` 页可以编辑 `bio`/`avatar_url`,`is_verified` 仍只读(没有人工审核入口)
- **social_accounts**(`id`, `user_id`→profiles, `platform` social_platform, `handle`, `url` text, `follower_count` integer 可空, ...)——`/dashboard/profile` 页可以新增/编辑/删除;`url` 和 `handle` 至少填一个
- **orders**(`id`, `ad_space_id`, `buyer_id`, `seller_id`, `payment_channel`, `amount`, `currency`, `status` order_status, `start_date`/`end_date` date, ...)——预订日历在用,`start_date`/`end_date` 是这次开发中后加的列

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

## 部署(Vercel)

- Environment Variables 里配 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`(类型选 Secret 或 Config 都行,`NEXT_PUBLIC_` 前缀的值反正都会被打进浏览器端代码,选哪个纯粹是 Vercel 后台能不能再看到明文的区别,不影响功能)
- `next.config.ts` 里把 Server Actions 的请求体上限从默认 1MB 调到了 10MB(`experimental.serverActions.bodySizeLimit`),不然发布广告位带图片会报 `Body exceeded 1 MB limit` 的 500 错误
- **`main` 才是 hereforads.com 实际部署的分支**(有 `public/logo.png` 品牌 logo 为证)。仓库另外还有一条 `claude/admiring-goldberg-8x70p7`,历史上曾各自独立合并过好几个 PR、跟 `main` 分叉了十几个提交,**没有连着线上环境**,不要在那条分支上开发——之前有 session 误在那条分支上开发、PR 也顺利合并了,但改动从未真正上线,排查了很久才发现。这条笔记之前写反过(说 admiring-goldberg 才是生产分支),已更正。

## 已知欠缺 / 下一步 TODO

- **支付未接入**:预订只是把订单状态停在 `pending_payment`,没有真正扣款、也没有卖家/系统确认订单的地方
- **卖家资料无法编辑**:`profiles.display_name`、`seller_profiles`(简介/头像)、`social_accounts` 目前都只读,需要补一个"个人资料"页面
- **订单管理页缺失**:买家/卖家都看不到自己的订单列表,只能去 Supabase 后台肉眼查 `orders` 表
- **`campaigns` 表未使用**:订单确认后买家提交广告创意素材的流程还没做
- **图片管理简陋**:上传后不能删除单张、排序、换封面,只能整体重新提交
- **日历只显示当月**:跨月的预订档期在视觉上看不到下个月部分(不影响预订本身是否成功,纯展示局限)
- 未专门做移动端适配测试
