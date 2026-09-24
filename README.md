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
| `/login`、`/register` | 邮箱密码登录/注册,密码框带显示/隐藏切换。注册成功后自动在 `profiles` 建一条记录(`role='both'`);如果 Supabase 开了邮箱验证、注册时还没有 session,会在验证后**首次登录**时补建。都支持 `?next=` 查询参数(2026-09-18 加,给 `/publishers/join` 用):登录/注册成功后跳去 `next` 指定的路径,不传就还是原来的 `/listings`;`next` 会在 register/login 两个表单互相跳转的链接之间保留,校验逻辑在 `src/lib/safeRedirect.ts`(只认站内相对路径,防止被拼成跳到外部域名的开放重定向) |
| `/sellers/[id]` | 公开主页:头像/简介/认证标记/内容领域、全部社交账号、该用户发布的全部 `listings`(卡片列表,只显示 `active`)。路由名叫 `sellers` 但代码里没有按 `role` 做区分,任何 `profiles.id`(包括纯买家)都能查看,Sales 页拿这个路由给买家做个人主页链接。页面渲染逻辑抽成了 `src/components/SellerProfileView.tsx`,跟下面 `/[username]` 共用 |
| `/[username]` | 同一个主页的"好记链接"版本(2026-09-18 加,用户原话是"发到其他账号个人主页或发给客户更方便",不想让别人分享的是 `/sellers/32537926-...` 这种 UUID)。按 `profiles.username`(小写)查,查不到 `notFound()`;`username` 是可选字段,默认没有,要在 `/dashboard/profile` 自己设置。**没有做 `/sellers/[id]` → `/[username]` 的自动跳转/canonical**——两个链接会一直并存,已经在分享/收藏旧链接的人不受影响,单纯多一个更好看的入口。顶层路由是不是会跟别的静态路由(`/login`、`/admin` 等)撞名靠 `src/lib/username.ts` 的保留字表在存的时候就挡掉,Next.js 本身"静态路由优先于同级动态路由"的规则也兜底了一层(哪怕保留字表漏了什么,真撞上了也是静态页面赢,不会意外把别的页面覆盖掉) |
| `/publishers` | 发布者网格(2026-09-18 加,原叫 "Creators"/`/creators`,同日改名成 "Publishers",理由见 WORKLOG 同日期条目):只展示至少有一条 `active` listing 的卖家,卡片显示头像/名字/认证标记/内容领域标签/各社交平台粉丝数(最多 4 个,超出显示 "+N more")/广告数/价格(单条 listing 显示单价,多条显示该卖家最便宜那个币种内的 min–max 区间),点击跳到 `/sellers/[id]`。聚合逻辑在 `src/lib/publisherCards.ts`。页面右上角 + 空状态都有一个跳到 `/publishers/join` 的按钮 |
| `/publishers/join` | 招募落地页(2026-09-18 加):冷启动期这个平台上还没有真实卖家,用户明确说了不做"空卡片放着等人 claim"(风险见 WORKLOG 同日期条目),改成一个可以直接发给潜在创作者(私信/外联用)的落地页——大白话讲清楚"免费加入、免费发布、托管放款安全、自己定价",CTA 直接跳注册(带 `next` 参数,注册/登录成功后直接落到 `/dashboard/new-listing` 而不是默认的 `/listings`,减少"注册完不知道去哪发布"这一步流失),已登录用户点 CTA 直接跳发布页。纯静态内容,没有另建"预注册/等待名单"这类需要人工再联系一遍的中间表——注册本身已经免费、不需要先接 Stripe 才能建 `draft` listing,加一层预注册反而多一道转化损耗 |
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
| `/admin`、`/admin/listings`、`/admin/users`、`/admin/orders`、`/admin/contact` | 管理员后台(2026-09-18 加,同日下午从 `/dashboard/admin/*` 挪到跟 `/dashboard` 平级的独立路由),只有 `admins` 表里有记录的账号能进,见下面"管理员系统"一节。`/admin/contact` 是 2026-09-18 晚些时候加的,只读列出 `contact_messages` 表(footer 联系表单的提交记录),没有站内回复功能,回复要管理员自己点邮箱地址发邮件。`/admin`(Overview)总览页有一张 "Contact messages" 统计卡片(2026-09-19 加,跟"总用户数"这些卡片同一排),点进去跳 `/admin/contact`——之前没有这张卡片,管理员如果不知道顶部导航栏还有一个单独的 "Contact" 标签页,很容易以为表单提交了但"系统没收到" |
| `/banned` | 账号被封禁后跳转到的静态说明页,不需要登录 |
| `/terms`、`/privacy` | 服务条款/隐私政策(2026-09-18 加),footer 里链接。内容是把已经拍板的产品规则(托管放款、佣金、线下交易不受保护等,见上面"MVP v2 产品方案"和"平台责任边界"两节)转成大白话条款,页面顶部有一条黄色提示条说明**还没有律师审过,不是最终法律文本**——先把已知信息展示出来,不是假装这是一份正式生效的法律文件 |
| `/contact` | "联系我们"表单落地页(2026-09-18 加)。表单本身(`ContactForm.tsx`)没变,只是从直接摆在 footer 里改成 footer 只放一个 "Contact us" 链接、点了才跳到这个独立页面——一堆输入框直接堆在 footer 里视觉上不像样子,是这次改的直接原因 |

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

- **profiles**(`id` uuid PK, `role` user_role, `display_name` text, `username` text 可空且唯一(2026-09-18 新加,见下面"MVP v2 数据库变更"), `created_at`, `updated_at`)——`display_name`/`username` 都能在 `/dashboard/profile` 编辑(上面这条"没有页面能编辑 display_name"是旧笔记,已经不对,`ProfileForm.tsx` 早就有这个字段了)
- **ad_spaces**、**orders**——老"实体广告位日历预订"流程的表,2026-09-17 随对应页面一起停用(见上面"页面一览"),表和数据都还在库里,只是**代码里已经没有任何地方读写它们**了(`src/app/api/stripe/webhook/route.ts` 里留了一段针对 `orders` 的死代码,见上面说明)
- **seller_profiles**(`user_id`→profiles, `bio`, `avatar_url`, `banner_url` text 可空(2026-09-18 新加), `is_verified` bool, `content_categories` `listing_category[]`(2026-09-17 新加,见下面"MVP v2 数据库变更"), `website_url` text 可空(2026-09-18 新加), `stripe_account_id` text, `stripe_charges_enabled` bool, `stripe_payouts_enabled` bool, ...)——`/dashboard/profile` 页可以编辑 `bio`/`avatar_url`/`banner_url`/`content_categories`/`website_url`,`is_verified` 仍只读(没有人工审核入口);`stripe_*` 三列是老流程接支付时加的,现在 `stripe_account_id`/`stripe_charges_enabled`/`stripe_payouts_enabled` 这三列也没代码在读写了(MVP v2 卖家收款状态存在 `profiles.stripe_connect_account_id`/`stripe_onboarded`),但 `bio`/`avatar_url`/`banner_url`/`is_verified`/`content_categories`/`website_url` 仍是当前 `/dashboard/profile`、`/sellers/[id]` 在用的字段。**`content_categories` 是创作者自己的内容领域,跟 `listings.categories`(这个具体广告位接哪些品牌类目的广告)是两个独立概念,不要混淆**。**`website_url` 只在 `/sellers/[id]` 个人主页展示,不上列表卡片/listing 详情页侧栏**(那两处空间紧,买家更关心平台粉丝数)。**`banner_url` 也只在 `/sellers/[id]` 顶部展示,全宽横幅**;头像/横幅换新图时,`updateProfileAction` 会在新图存库成功后删掉 storage 里的旧文件(`storagePathFromPublicUrl()` 从公开 URL 反解出 bucket 内路径),避免旧文件永远留在 `ad-space-photos` 这个 bucket 里占空间
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
| 收款覆盖国家 | 仅 Stripe 支持地区,不含中国大陆(中国大陆无法开通 Stripe Connect 收款账户)。2026-09-23 起英国个人账户上线,实际只能覆盖美国/英国/EEA/加拿大/瑞士,见"费用、取消与退款规则"一节 |
| 纠纷/退款 | ~~不做产品化流程,出问题人工介入~~ 2026-09-23 起改为产品化的取消/退款流程,见"费用、取消与退款规则"一节 |
| 可嵌入组件/插件 | 不做,但数据模型/URL 设计上为将来预留余地 |
| 咨询/私信 | MVP 就做,但只做最简形式——绑在某个 listing 下的一对一消息串,不做群聊 |

**已确认的关键决策**(不是待定,不要再当成开放问题问一遍):

- **托管放款确认窗口 3 天**:对齐 Fiverr——卖家标记交付后买家 3 天内不确认/不申诉就自动完成放款(2026-09-18 一度改成"从付款时间起算、不用等交付",发现这样卖家什么都不做也能靠超时拿钱,当天又改了回来,见下面"平台责任边界"一节的完整记录)
- **需要私信/咨询功能**:MVP 就做,绑在 listing 下的一对一消息串
- **卖家必须先 Stripe onboarded 才能发布**:Stripe Connect 账户没完成 KYC 前,listing 状态停留在 `draft`,买家看不到也下不了单
- **最低发布价 $0.99**:纯技术防呆(留一点余量在 Stripe 自己的最低收款额 $0.50 之上),不是商业门槛
- **平台佣金 12%**:参考 Etsy(6.5% 交易费 + 3%+$0.25 支付处理费,总负担约 10-12%,取上限);扣费顺序是卖家到手金额 = `amount − 实际 Stripe 手续费 − 12% 平台佣金`,两项都从卖家应得里扣,平台的 12% 收入不受 Stripe 手续费波动影响。**2026-09-23 起改为固定费率:Service fee 12% + Payment processing fee 4% + £0.20,见"费用、取消与退款规则"一节**

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

-- ⚠️ 2026-09-23 起下面这条 update 策略和上面的 insert 策略都已删除、权限已收回,
-- 订单只由服务端写,见"费用、取消与退款规则 → 实现进度 → 第 1 批"的 SQL。新建库时不要再建这两条。
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

-- ===== social_accounts:重建 UPDATE 策略(2026-09-18 加,修复"Save failed")=====
-- 用户编辑已有社交账号时反复报"Save failed — the database rejected the
-- request"——服务端没收到具体的 Postgres 报错,只是 UPDATE 影响了 0 行,这是
-- RLS 静默拒绝的典型信号。这条策略在最初建 social_accounts 表时理论上加过
-- (见上面"social_accounts: 个人资料页...要的策略"那段),但线上库的实际状态
-- 跟这份文档对不上(要么当时没跑成功,要么后来被手动改过)。这条 drop+create
-- 是幂等的,可以放心重复执行。
drop policy if exists "users can update own social_accounts" on public.social_accounts;
create policy "users can update own social_accounts"
on public.social_accounts for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ===== seller_profiles.banner_url(个人主页横幅图,2026-09-18 加)=====
-- 只在 /sellers/[id] 顶部展示,全宽横幅,不影响列表卡片/listing 详情页(那两
-- 处没有 banner 的展示位)。跟 avatar_url 复用同一个 ad-space-photos bucket,
-- 路径规则一致(`{user_id}/banner/{uuid}.{ext}`)。不需要新的 RLS 策略,跟
-- avatar_url/website_url 走同一条 seller_profiles UPDATE 策略(见下面那条)。
alter table public.seller_profiles add column if not exists banner_url text;

-- ===== seller_profiles.website_url(卖家个人网站,2026-09-18 加)=====
-- 跟 social_accounts 是两个概念:那张表是具体的社交平台账号(Instagram/
-- TikTok/...),这一列是没有固定平台归属的个人网站/媒体主页。只在
-- /sellers/[id] 个人主页展示一行链接,不上列表卡片/listing 详情页侧栏(那两
-- 处空间紧,买家更关心平台粉丝数)。
alter table public.seller_profiles add column if not exists website_url text;

-- ===== seller_profiles:补齐 SELECT/INSERT/UPDATE 策略(2026-09-18 加,预防性)=====
-- 发现 social_accounts 的 UPDATE 策略在线上库跟文档对不上之后(见上面那条),
-- 回头查这份文档,才发现 seller_profiles 这张表从建表到现在**从来没有在这份
-- README 里记录过任何 RLS 策略**——bio/avatar_url/content_categories 目前能
-- 存能读,大概率是线上库某个时间点手动配过,但配的是什么、跟下面这三条是否
-- 完全一致,没人能确认。这三条 drop+create 都是幂等的,执行后能确保这张表的
-- 权限跟 social_accounts/其他表用同一套标准(按 user_id 授权,公开可读),不
-- 会因为"文档缺失、实际配置成谜"这个问题在 website_url 这个新列上重演一遍
-- "Save failed"。
drop policy if exists "anyone can view seller_profiles" on public.seller_profiles;
create policy "anyone can view seller_profiles"
on public.seller_profiles for select
to anon, authenticated
using (true);

drop policy if exists "users can insert own seller_profiles" on public.seller_profiles;
create policy "users can insert own seller_profiles"
on public.seller_profiles for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own seller_profiles" on public.seller_profiles;
create policy "users can update own seller_profiles"
on public.seller_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ===== listings.social_account_id / is_website_placement(广告位放在哪个账号,2026-09-18 加)=====
-- 之前广告网格卡片/listing 详情页展示的是"卖家名下所有社交账号",买家很容易
-- 误以为一份广告会同时在卖家所有平台投放——实际上一条 listing 只对应一个具体
-- 投放位置。这两列让卖家发布 listing 时二选一(互斥,不做 check 约束,靠
-- ListingForm.tsx 的单选下拉框保证互斥):`social_account_id` 指定具体是
-- social_accounts 里哪一个账号,或者 `is_website_placement=true` 表示投放在
-- seller_profiles.website_url 那个网站。两个都是空/false 就是"其他/未指定"。
-- `on delete set null`:卖家如果删掉了对应的社交账号,不会连带把已发布的
-- listing 也炸掉,只是这条 listing 的展示会退化成"未指定平台"。
-- **这次改动之前发布的 listing,这两列会是 null/false(未指定)**——建这条
-- SQL 时项目还没有 listing 编辑页(见"MVP v2 骨架已知欠缺"),老 listing 没有
-- 入口补填这个字段,后续要做编辑页才能让卖家自己修正。
alter table public.listings
  add column if not exists social_account_id uuid references public.social_accounts(id) on delete set null;
alter table public.listings
  add column if not exists is_website_placement boolean not null default false;

-- ===== listings:重建全部四条策略(2026-09-18 加,修复编辑 active listing 时的 "Save failed")=====
-- 用户测试新加的 /dashboard/my-listings/[id]/edit 编辑功能,编辑一条已经 active
-- 的 listing、保存时报错——服务端没收到具体的 Postgres 报错,只是 UPDATE 影响了
-- 0 行,这是 RLS 静默拒绝的典型信号,跟 social_accounts/seller_profiles 之前那
-- 两次是同一类问题:这份文档里记录的策略,不代表线上库实际配的就是这个。这四条
-- drop+create 都是幂等的,可以放心重复执行,执行后能确保 listings 表的权限确实
-- 跟本节顶部 create table 之后那四条策略的定义一致。
drop policy if exists "anyone can view active listings, sellers can view their own" on public.listings;
create policy "anyone can view active listings, sellers can view their own"
on public.listings for select
to anon, authenticated
using (status = 'active' or seller_id = auth.uid());

drop policy if exists "sellers can insert own listings" on public.listings;
create policy "sellers can insert own listings"
on public.listings for insert
to authenticated
with check (auth.uid() = seller_id);

drop policy if exists "sellers can update own listings" on public.listings;
create policy "sellers can update own listings"
on public.listings for update
to authenticated
using (auth.uid() = seller_id)
with check (auth.uid() = seller_id);

drop policy if exists "sellers can delete own listings" on public.listings;
create policy "sellers can delete own listings"
on public.listings for delete
to authenticated
using (auth.uid() = seller_id);

-- ===== contact_messages(footer"联系我们"表单,2026-09-18 加)=====
-- 跟 listing_messages(绑在某条 listing 下的买卖双方私信)是两个独立概念:
-- 这张表是全站通用的"联系我们",不登录也能提交,不挂靠任何 listing/user_id,
-- 提交人是谁完全靠他自己填的 name/email(不校验真实性)。故意只开 insert 策略,
-- 不开 select——提交的人自己也读不回来,只有 /admin/contact(service_role,
-- 绕过 RLS)能看,避免任何登录用户能拿别人的联系表单内容。
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

create policy "anyone can submit a contact message"
on public.contact_messages for insert
to anon, authenticated
with check (true);

-- ===== profiles.username(好记的公开链接,2026-09-18 加)=====
-- 用户要求:分享出去的链接不该是 /sellers/32537926-0d6d-... 这种 UUID,
-- 应该能设成 hereforads.com/7smile-linda 这种。可选字段,默认 null(老账号/
-- 没设置的人继续只有 /sellers/[id] 这一个入口)。格式校验(小写字母/数字/连字符,
-- 3-30 位)和保留字表(不能跟 /login、/admin 这些已有顶层路由撞名)都在
-- src/lib/username.ts 里,这条 check 约束是数据库层面的兜底,防止校验被绕过
-- (比如有人拿自己的 session 直接调 REST API,不经过这次新加的表单)。
-- unique 约束允许多行都是 null(Postgres 的 unique 语义本来就不管 null 之间
-- 是否相等),不用额外写 partial unique index。
alter table public.profiles add column if not exists username text;

alter table public.profiles add constraint profiles_username_unique unique (username);

alter table public.profiles add constraint profiles_username_format check (
  username is null or username ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
);
```

Listing 图片复用已有的 `ad-space-photos` public bucket,不用新建。

## Guest 结账(买家不强制先注册,2026-09-19 加)

**产品决策**:买家点"Buy now"不再被强制跳去 `/login`/`/register`——没登录的访客只需要在按钮上方填一个邮箱就能直接走 Stripe Checkout 付款。付款/托管放款流程本身完全不变(还是 `pending_payment` → `paid_in_escrow` → `delivered` → 买家确认/超时自动确认 → `released`),因为这套流程需要买家事后能回来"确认收货",纯匿名、完全不落任何账号是做不到这一步的。

**2026-09-24 调整入口文案(产品负责人决定)**:广告页上不再写"No account needed to buy"——主动宣传"不用注册"会让更多人不注册,流失客户。现在未登录访客点 Buy now 之后,才出现三个选项:**Log in to buy**、**Create an account**(都带 `next` 参数,登录/注册完回到这条广告)、**Continue as guest**(填邮箱,走原来的 guest 结账)。跟常见网店的结账页一致,优先引导注册/登录,guest 作为兜底。"Ask the seller" 私信继续要求登录(防垃圾消息),未登录时显示"Log in or create an account"。代码在 `src/components/BuyListingButton.tsx`。

**登录/注册后接回购买(2026-09-24,代替购物车)**:每一单都是独立托管,MVP 不做购物车。未登录买家从 Buy now 去登录/注册,`next` 是 `/listings/<id>?resume=buy`;回到广告页时顶部提示 "You're signed in — complete your purchase below",购买框加边框高亮,一键付款。覆盖三条路径:密码登录/注册(不开邮箱验证时直接跳回)、Google/Facebook 登录(`/auth/callback?next=`)、**开了邮箱验证的注册**:`signUp` 带 `emailRedirectTo = {站点}/auth/callback?next=...`,点验证邮件后换 session 再跳回。前提:① Supabase 的 **Confirm signup** 邮件模板用的是默认的 `{{ .ConfirmationURL }}`(如果以后改成 token_hash 格式,要在链接里带上 `{{ .RedirectTo }}`,否则回不到广告页);② Redirect URLs 白名单里有 `{站点}/auth/callback`(OAuth 登录已经在用,应该已经有了)。验证邮件在另一个浏览器打开时换不出 session,会落到登录页并保留 `next`,登录后照样回到广告页。"Ask the seller" 的登录/注册链接回到同一条广告的私信框(`#ask`)。

**实现方式**:选的是"静默建号 + 邮件魔法链接",不是完全匿名订单(那种做法需要新建一套脱离账号体系的 token 订单页,买家没法用站内私信联系卖家,改动量大很多,这次没有做)。具体流程:

1. `src/app/listings/[id]/actions.ts` 的 `buyListingAction` 发现没有登录用户时,读表单里的 `guest_email`;
2. `src/lib/supabase/guest-checkout.ts` 的 `resolveGuestBuyerId()` 用匿名 key 的 client 调 `supabase.auth.signInWithOtp({ email })`——这个邮箱之前没注册过就静默建一个新账号(不设密码),已经注册过就直接给现有账号发一封登录邮件;
3. `signInWithOtp` 本身不会把新建用户的 `id` 返回给调用方,所以紧接着用 `service_role` client 调下面新加的 `get_user_id_by_email()` 函数把邮箱查回 `id`,再 upsert 一条 `profiles` 记录(跟 `ensureProfile()` 一样用 `ignoreDuplicates`,不会覆盖已有账号);
4. 后续插入 `listing_orders`/发起 Stripe Checkout 复用这个 `id` 当 `buyer_id`,跟登录买家走的是同一张表、同一套状态机;
5. 付款成功的 `success_url` 对 guest 单独指向一个不需要登录的 `/checkout/guest-success` 页面(登录买家的 `success_url` 不变,还是 `/dashboard/purchases`)——guest 这个浏览器里没有 session,直接跳 `/dashboard/purchases` 只会被弹回 `/login`；
6. guest 收到的邮件里点登录链接,落地到新加的 `src/app/auth/confirm/route.ts`,用 `token_hash` 换一个真正的 session(写 cookie),之后就能像普通登录买家一样在 `/dashboard/purchases` 看订单、确认收货,也能用站内私信联系卖家。

**邮件链接怎么换出登录态**:走的是 Supabase 官方 Next.js SSR 教程推荐的 `token_hash` 方案——Magic Link 邮件模板里的链接直接带 `token_hash` + `type` 两个参数指向 `/auth/confirm`,这个 Route Handler 在服务端用 `supabase.auth.verifyOtp({ type, token_hash })` 换 session、写 cookie,再重定向到 `next`。**这个方案要求 Magic Link 邮件模板是可编辑的,而 Supabase 自带的邮件服务不让编辑模板(后台模板编辑页会提示"Set up custom SMTP to edit templates")**——2026-09-19 接入 Resend 当 custom SMTP(域名 `hereforads.com` 已在 Resend 验证、Supabase 后台的 SMTP 设置已指向 Resend)之后才具备这个前提,同时也顺带解决了 Supabase 自带邮件服务发信限额很低(只给开发测试用)的问题。(中间短暂试过一版不需要改邮件模板的客户端方案——用浏览器端 client 解析 GoTrue 默认链接落地页 URL fragment 里的 token——SMTP 配好之后已经换回这个更标准的版本,不需要再维护两套。)

**这次没有改的地方**(明确排除在这次改动范围外,免得以后被误以为也支持了):"Ask the seller" 私信联系卖家仍然要求先登录/走完 guest 的邮件登录环节——没有做匿名留言这块。

**数据库变更**——只加了一个函数,没改任何表结构(`listing_orders.buyer_id`/`profiles.id` 还是引用真实账号,guest 也是一个真实账号,只是建号过程对买家不可见):

```sql
-- get_user_id_by_email(): service_role 专用,按邮箱查回 auth.users.id。
-- security definer + 只 grant 给 service_role,不给 anon/authenticated 执行
-- 权限——不然会变成一个能被任何人拿去探测"这个邮箱是否已注册"的接口。
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, pg_temp
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public;
grant execute on function public.get_user_id_by_email(text) to service_role;
```

**必须手动做的 Supabase 后台配置(代码/SQL 之外,漏掉任何一步 guest 都收不到能用的登录链接)**:

1. **Authentication → Emails → SMTP Settings(即 custom SMTP)**:接 Resend——Sender email address 填已验证域名下的地址(比如 `hello@hereforads.com`),Host 填 `smtp.resend.com`,Port `465`,Username 固定是 `resend`,Password 是 Resend 后台生成的 API Key。前提是这个域名已经在 Resend 加过、DNS 记录(SPF/DKIM)也在 Cloudflare 加好并验证通过。
2. **Authentication → Emails → Magic link or OTP**(custom SMTP 开了之后这个模板才能编辑):把默认的 `{{ .ConfirmationURL }}` 链接换成:
   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard/purchases">Log in</a>
   ```
   `type=email` 是故意的——新版 GoTrue 把 magic link/邮箱确认统一成 `email` 这个 OTP 类型,不是历史上的 `magiclink`,`src/app/auth/confirm/route.ts` 按这个约定去 `verifyOtp`。
3. **Authentication → URL Configuration → Redirect URLs**:加一条 `{站点域名}/auth/confirm`(本地开发再加一条 `http://localhost:3000/auth/confirm`)。不在白名单里 `signInWithOtp` 会报 redirect 不合法。
4. **确认 `NEXT_PUBLIC_SITE_URL` 在生产环境配的是真实域名**(部署环境变量,不是 `localhost`)——`resolveGuestBuyerId()` 拼 `emailRedirectTo` 用的就是这个值,同时也是模板里 `{{ .SiteURL }}` 的来源。

### Guest 联系方式留底(姓名/地址/电话,2026-09-19 加)

**产品要求**:guest 不走注册表单,除了邮箱不会再留下别的联系方式——万一后续有纠纷/退款需要联系,平台这边应该有个记录。没有新增我们自己的表单字段(不想在结账按钮上方再堆更多输入框),借的是买家反正要填卡号的 Stripe Checkout 页面本身:

- `buyListingAction` 对 guest 单独在 Stripe Checkout session 上开了 `billing_address_collection: "required"` 和 `phone_number_collection: { enabled: true }`(登录买家不开,不给已有用户的一键购买加步骤);
- `/api/stripe/webhook` 收到 `checkout.session.completed` 时,从 `session.customer_details` 里把 `name`/`phone`/`address` 抄一份写进 `listing_orders`(新增的三列,见下面 SQL)——存在订单本身而不是只存 `profiles`,因为同一个账号以后可能换地址/换电话下单,按订单留底更准确;
- 同时如果这个买家 `profiles.display_name` 还是空的(guest 静默建号时没填过,见上面 `resolveGuestBuyerId()`),顺手拿 Checkout 收集到的姓名回填一下,这样卖家在 `/dashboard/sales`/`/dashboard/messages` 看到的就不再是"Anonymous buyer"——只在原本是空的时候才回填,不会覆盖用户自己在 `/dashboard/profile` 设置过的名字;
- 这几列现在**没有**展示给卖家看(只存库,不上 `/dashboard/sales` 的卡片)——是不是要给卖家看到买家电话/地址是另一个隐私层面的产品决策,这次没做,只是先把数据留底。

**这行以前建过的 `listing_orders` 要补三列**(nullable,登录买家走的老流程不填这三列,读出来是 null):

```sql
alter table public.listing_orders add column if not exists buyer_name text;
alter table public.listing_orders add column if not exists buyer_phone text;
alter table public.listing_orders add column if not exists buyer_address text;
```

不需要新的 RLS 策略——这三列只由 `/api/stripe/webhook` 用 `service_role` 写,普通登录用户的 `listing_orders` UPDATE 策略管的是别的字段,不受影响。

### 收付款设计要点(实现前必读)

- **卖家必须 `stripe_onboarded = true` 才能把 listing 从 `draft` 推进到 `pending_review`**(2026-09-18 起,`pending_review` 之后还要管理员审核通过才是 `active`,见下面"管理员系统"),发布表单/action 里两头都要校验(RLS 只挡"是不是自己的 listing",挡不住状态值本身)
- **Charges & Transfers 模式**:买家在 Stripe Checkout 付款,钱先进平台自己的 Stripe 账户(不是 destination charge、不直接进卖家账户);卖家标记交付、买家确认收货,或标记交付后 `ESCROW_HOLD_DAYS` 天买家没反应自动确认,服务端才对卖家的 Connect 账户发起一笔 Transfer(详见下面"平台责任边界"一节)
- **佣金 12%**,参考 Etsy(6.5% 交易费 + 3%+$0.25 支付处理费,总负担约 10-12%,取上限)。扣费顺序:卖家到手金额 = `amount − 实际 Stripe 手续费 − 12% 平台佣金`,两项都从卖家应得里扣,平台的 12% 收入不受 Stripe 手续费波动影响。**2026-09-23 起改为固定费率,见"费用、取消与退款规则"一节**
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

## 费用、取消与退款规则(2026-09-23 决策记录,**分批实现中,进度见本节"实现进度"**)

这一节是 2026-09-23 跟产品负责人逐条确认过的规则,**目前只是决策记录,还没有写成代码**——现有代码仍然是"实报 Stripe 手续费 + 12%"、没有取消/退款流程的旧版本。实现时以这一节为准;标了"待确认"的条目还没拍板,不要当成已决定的规则去实现。本节跟上文"MVP v2 产品方案""收付款设计要点"里的旧表述冲突的地方,以本节为准(那几处已经加了指向这里的备注)。

### 1. 主体与收款地区

- **先用英国个人(sole trader)Stripe 账户上线,以后再注册公司。** 已知风险:以后改成公司主体时,如果 Stripe 不允许在原账户上直接改、要求新开平台账户,所有卖家都得重新开户/重新 KYC——卖家越少的时候切换代价越小。
- **英国平台在 Charges & Transfers 模式下只能转账给美国、英国、欧洲经济区(EEA)、加拿大、瑞士的 Connect 账户**([Stripe 跨境打款文档](https://docs.stripe.com/connect/cross-border-payouts))。`src/lib/stripe/countries.ts` 现在列的日本/新加坡/香港/澳洲/巴西/墨西哥/阿联酋等国家,在英国平台下开得了户但收不到转账,**要缩减到这 5 个地区**。
- **5 个地区之外的卖家**(典型是中国大陆网红):收款设置页显示 "Payments for your country are coming soon — join the waiting list",收集国家 + 邮箱做 waiting list。哪些国家报名的人多,就优先接入这些国家的收款通道(候选:Stripe Global Payouts、Airwallex、Payoneer,都还没验证)。
- **没开通 Stripe 也可以写个人主页、发布广告**(沿用 2026-09-19"发布免审核 + KYC 后置"的决定)。有人浏览卖家的广告页或给卖家发私信时,发邮件提醒卖家"开通 Stripe 才能收款"。这需要接入邮件服务(比如 [Resend](https://resend.com)),同一个卖家 3 天最多一封。
- **没有通过平台收款的交易不享受平台担保**(私下交易风险自负,Terms 第 4 条已经有对应表述)。这类卖家的广告页怎么显示,见第 9 条。

### 2. 费用:固定费率,卖家挂单时就能看到到手金额

选了"公布固定费率"(对应 Etsy 的做法),**不再实报实扣 Stripe 手续费**:卖家看到 £100 的广告,当场就知道到手多少。有的订单平台多收一点、有的亏一点(国际卡 + 换汇的订单会亏),接受这个波动。卖家收入明细显示为:

| 名称(界面英文) | 费率 | 说明 |
|---|---|---|
| **Service fee** | 12% | 平台佣金,原来叫 "Platform fee" |
| **Payment processing fee** | 4% + £0.20 | 对齐 Etsy 英国的费率,原来叫 "Stripe processing fee"(实报金额);其他币种的固定部分按等值收($0.25 / €0.25) |

例:£100 订单,卖家到手 = 100 − 12 − 4.20 = **£83.80**。Stripe 实际扣的手续费、Connect 平台费、退款时拿不回来的原手续费、拒付费(英国约 £20/笔),都由平台自己承担,从上面两项收入里消化。

**记账口径**(提醒,不是代码逻辑):平台收入只有 Service fee + Payment processing fee 超出 Stripe 实际成本的差额,**卖家的货款不是平台收入**;收入在订单放款那一刻确认,不是提现到银行卡时才算(Stripe 余额本身就是平台资产,托管中的卖家货款是欠卖家的钱)。VAT 门槛 £90,000 按平台收入算,不按成交总额算,前提是 Terms 里写明平台是卖家的代收代付代理——这几条上线前要找会计师确认,另外还要确认 HMRC 的数字平台申报义务(每年 1 月 31 日前报送卖家信息)是否适用。

### 3. 下单时卖家要写明的约定

卖家发布广告时填写,买家下单前能看到,这就是双方的约定:

- **交付天数**:默认 14 天,从买家付款时开始算。
- **内容保留天数**:比如 30 天、90 天或永久。保留期内删除内容或去掉广告,算卖家违约。
- **售后政策**(三选一,在广告页上显示成标签):
  - **Revisions only**(默认):包含 N 次修改或重拍(0–3 次),交付后不因"不满意"退款
  - **Revisions + refund negotiable**:可以修改,交付后也可以协商退款
  - **Final as delivered**:不修改,也不退款(适合静态展示位这类交付即完成的广告)
- **播放量**:第一版不支持"保底播放量",卖家只能写"预估曝光",页面上注明不是承诺。

**售后政策只管"满意不满意"。** 下面这几种情况,不管卖家选了哪个政策,买家都可以申请,卖家不能用政策排除:交付与描述不符(没放产品、发错平台、交付链接是假的)、保留期内提前删除、拒付,以及英国消费者法规定的法定权利。

### 3a. 发布前审稿(买家审稿通过后卖家才正式发布)

对齐网红合作的行业惯例:先审稿,再发布。每条广告有一个开关 "Buyer approves draft before publishing",视频类广告(`video_product_placement` / `product_intro_video` / `product_test_video`)和 `sponsored_feature`、`custom` 默认打开,`static_image_ad` 默认关闭,卖家可以自己改。售后政策选了 "Final as delivered" 的广告不走审稿。

打开审稿的订单流程:

```
付款 → 卖家提交初稿 → 买家审稿 ──通过──→ 卖家正式发布、提交上线链接 → 3 天确认期 → 放款
                         │
                         └─ 申请修改(扣 1 次修改次数)→ 卖家改好重新提交初稿
```

- **初稿怎么交**:第一版只收链接(YouTube 不公开视频、Google Drive、Dropbox、TikTok 私密分享等)和图片(复用现有的图片 bucket),不做视频上传——视频文件大,存储和带宽成本高。初稿只有买卖双方能看到。
- **买家审稿时限**:3 天。3 天不回应视为通过,卖家可以直接发布,不会被买家拖住。
- **交付期限**:卖家要在交付天数内提交**初稿**;买家审稿的时间不算进卖家的交付期限。
- **修改次数**:主要用在审稿阶段。审稿通过后,修改只针对"上线的内容跟通过的初稿不一致"。
- **审稿通过后,买家不能再对内容本身提"交付与描述不符"**,只能针对两件事:上线的内容跟通过的初稿不一致,以及保留期内提前删除。这能大幅减少事后纠纷。
- **修改次数用完、买家仍然不通过**:买家可以取消订单,卖家保留 **50% 作为 kill fee**(创意行业常见的"中止费",补偿卖家已经投入的拍摄/制作时间),另外 50% 退给买家。手续费按退款比例处理(同第 4 条)。
- **审稿提示**:不管开关开没开,卖家在发布广告表单和订单页上都会看到一句提示:"Tip: Ask the advertiser to review your image or video before you publish — it helps avoid mistakes and disputes."

### 4. 取消与退款:必须选退款理由,理由决定手续费谁承担

| 情况 | 发起方 | 退给买家 | 卖家承担的费用 | 算进"90 天 3 单"吗 |
|---|---|---|---|---|
| **付款后 24 小时内取消**(卖家还没交付) | 买家或卖家,**不需要对方同意** | 全额 | 无,Stripe 实际手续费由平台承担 | 不算 |
| 卖家在交付期限内拒单(不想接,比如内容低俗或跟自己的内容不匹配) | 卖家 | 全额 | 无,Stripe 实际手续费由平台承担 | **不算**(拒单不属于违约) |
| 超期没交付(包括生病等特殊原因,双方协商后取消) | 买家发起,卖家同意 | 全额 | **Cancellation fee = 退款金额对应的 Payment processing fee**,从卖家下一笔放款里扣 | 算 |
| 交付后,售后政策允许协商退款 | 买家发起,填退款金额 | 全额或部分 | 按比例:Service fee 和 Payment processing fee 按退款比例退还给卖家 | 不算 |
| 交付与描述不符 | 买家发起 | 协商,谈不拢由管理员裁决 | 按比例(同上) | 管理员判定卖家有过错才算 |

**部分退款按比例退手续费**:£100 订单退 £40 → 卖家少拿 40 − 4.80(Service fee 按比例退)− 1.68(Payment processing fee 按比例退)= £33.52,最终到手 £50.28,正好等于一笔 £60 订单的到手金额。

**取消次数约束**:90 天内因卖家违约取消 3 单(超期没交付、判定卖家有过错、保留期内提前删除),暂停卖家所有广告,管理员审核后恢复。卖家拒单和 24 小时内取消不算;管理员后台单独显示每个卖家的拒单率,方便发现反复接单再拒的情况。

### 4a. 超期与时限(2026-09-23 补充,产品负责人确认)

交付天数由卖家发布广告时自己填(比如静态图 7 天、访谈 1 个月,上限 60 天),期限内怎么准备平台不管;卖家一交付就进入第 5 条的 3 天确认期。补充下面几条,解决"订单一直挂着"的问题:

1. **超期后买家申请取消,卖家 3 天不回应 → 自动全额退款**,按卖家违约处理:收 Cancellation fee,算进"90 天 3 单"。
2. **超期满 7 天,卖家没交付、买家也没操作 → 不自动退款**,订单继续等买家申请取消;买家申请后同样按卖家违约处理。
3. **修改后重新提交限 3 天**,超时按"超期没交付"处理。
4. **管理员裁决内部 7 天内完成**,只是内部目标,不对用户承诺。

### 5. 交付后的 3 天确认期

| 买家操作 | 结果 |
|---|---|
| 确认 | 立刻放款 |
| 申请修改(在修改次数内) | 确认期暂停;卖家改好重新提交后,确认期重新计 3 天 |
| 交付与描述不符 | 自动放款暂停,双方协商;**卖家 3 天不回应,或者谈不拢,由管理员人工裁决** |
| 什么都不做 | 3 天后自动放款 |

"不满意"或"效果不好"不能作为"交付与描述不符"的理由(售后政策允许协商退款的除外)。**这一条改了 2026-09-18"平台不裁定履约质量"的立场**——平台现在会在双方谈不拢时做最终裁决,Terms 第 5 条("We don't arbitrate…")要跟着改。

### 6. 放款之后

放款后**没有"不满意可以退款"的时限**,只有两种情况会退钱:

- **卖家违约(保留期内删除内容或去掉广告)**:买家提交证据(截图、已经失效的链接)→ 卖家有 3 天时间恢复,恢复了就结案 → 恢复不了,**按没展示的天数比例退款**(例:约定保留 30 天,第 10 天被删,退 2/3),同时收 Cancellation fee,并算进"90 天 3 单"。这是行业里"先补救(makegood)、补不了再按比例退"的做法。
- **卖家自愿退款**:任何时候都可以。

**卖家违约时管理员可以强制扣回**:只在违约这种情况下,管理员可以不经卖家同意发起撤回;同时暂停账号。卖家 Stripe 余额不够时,**门槛是 £10(其他币种按等值)**——广告订单不是天天有,不能指望从他以后的收入里慢慢扣:
  - **≥ £10**:立刻撤回,卖家 Stripe 余额变成负数,由 Stripe 自动从卖家绑定的银行账户扣回(Connect 账户要开 `debit_negative_balances`)
  - **< £10**:先记一笔欠款,从他下一笔放款里扣;**30 天内没有新的放款,照样撤回、走银行账户扣款**,不会一直挂着

两种情况的执行顺序都一样:**先从卖家的 Connect 账户撤回转账(transfer reversal),撤回成功后才退给买家**,平台不垫钱。卖家 Stripe 余额不够(已经提现)的情况,打开 Stripe 的"负余额自动从卖家银行账户扣回"——这一点**必须先在测试模式下实际验证**各国是否可用。卖家点"同意退款"时需要二次验证(重新输入密码或邮箱验证码),防止被盗号的人恶意退款。

### 7. 拒付与手动退款(任何阶段)

- 收到 `charge.dispute.created`:订单立刻冻结、停止放款;已经放款的,尝试从卖家账户撤回。
- 在 Stripe 后台手动退了款(`charge.refunded`):同步订单状态,保证这笔钱不会再转给卖家。

### 8. 跟这套规则一起修的资金安全问题

1. 平台 Stripe 账户的 payout 改成手动或每周一次,转账时带 `source_transaction` 绑定原始付款——否则 Stripe 默认每天自动提现,会把托管中的钱一起提到平台银行账户,之后给卖家转账时余额不足。
2. `/api/cron/auto-confirm` 现在只接受 POST,而 Vercel Cron 发的是 GET,直接接上不会生效;要改成接受 GET,再加 `vercel.json` 配置定时任务。超期提醒等新的定时任务也走这里。
3. 所有退款、撤回操作都要做幂等处理(Stripe idempotency key + 订单状态条件更新),防止同一笔钱退两次。

### 9. 5 个地区之外的卖家

- 卖家发布广告时要选"收款国家";选了 5 个地区之外的国家,收款设置页显示 coming soon + waiting list(见第 1 条)。
- 这类卖家的广告页:**买家不能付款**,购买按钮换成 "This seller can't accept payments yet",旁边保留私信按钮。买家点了这个按钮,就给卖家发一封提醒邮件(同一个卖家 **3 天最多一封**)。
- 5 个地区之内、只是还没开通 Stripe 的卖家不受影响:买家照常可以付款(沿用 2026-09-19 的"KYC 后置"),卖家标记交付前必须开通 Stripe。
- 跟 2026-09-18"平台责任边界"一节的关系:那一节否决的是"平台提供一个线下付款通道"。这里平台不提供任何线下付款方式,只是暂时不能在线付款;私信本来对所有广告都开放,私下交易的风险跟以前一样,平台立场不变(私下交易不受保护)。

### 10. 个人买家的 14 天法定取消权(英国 Consumer Contracts Regulations 2013)

只适用于**个人消费者**(以个人身份、不是为了做生意买的);企业买家没有这个法定权利。规则是:

- 服务类合同,消费者从下单起有 14 天无理由取消权。
- 消费者**明确要求**在 14 天内就开始服务,并且**确认知道服务完成后就失去取消权**:服务完成后就不能再取消;服务做了一半取消,要按已完成的部分付钱。
- **如果没有拿到这个明确要求和确认**:消费者在 14 天内可以取消,而且**一分钱都不用付,哪怕广告已经发布了**。这是卖家最大的风险。

所以做法是:结账页加一个必勾选框(英文),大意是"我要求卖家立即开始服务;我知道服务完成后就失去 14 天取消权,中途取消需要按已完成的部分付费"。勾选时间存进订单留痕,Terms 里写对应条款。这跟平台的规则是对得上的:广告发布了(服务完成)不能取消;做了初稿后取消收 50% kill fee(已完成部分的对价);还没开始的 24 小时内免费取消。

注意:如果卖家本身是个人、不是以做生意的身份卖广告,这条法规可能不适用;欧盟消费者有类似的 14 天规则;其他国家的法律各不相同。**上面是对法规的一般理解,不是法律意见,勾选框和 Terms 的措辞要找律师确认。**

### 11. MVP 保留托管;考虑过"不托管、钱直接进卖家账户",被否决(2026-09-23)

讨论过两个更轻的方案:纯工具(卖家填自己的收款链接,平台收订阅费),以及 Stripe direct charges(钱直接进卖家账户,平台只抽佣,不托管)。**结论:MVP 阶段还是要做平台内收款 + 托管**——小网红跨国沟通、收款太麻烦,平台内一键付款 + 交付后才放款是核心卖点。

**Terms 里要明示平台身份**,产品负责人给的原意是:"本平台仅作为信息撮合媒介,支付服务由第三方持牌支付机构 Stripe 独立提供。平台在买家确认服务前代为发出延迟结算指令。"

写成正式英文条款时要注意**措辞跟实际做法一致**,否则条款站不住:

- 平台会在双方谈不拢时裁决(第 5 条)、会设定费用规则,所以不宜写成"仅仅是信息媒介、不参与交易";更准确的说法是"平台是卖家收款的有限代理(limited payment collection agent),支付处理和资金保管由 Stripe(FCA 授权的电子货币机构)提供"。
- 现在的代码用 separate charges & transfers,买家付款时**商户是 HereForAds**(买家的银行账单上显示 HereForAds),托管中的钱在平台的 Stripe 余额里——"支付由 Stripe 独立提供"只说对了一半。
- **托管的实现方式待确认**(见文末):如果改成"钱进卖家的 Stripe 余额、平台暂停卖家提现,确认后才放行",条款里"延迟结算指令"的说法就完全符合实际,平台余额里也只有佣金。
- 条款措辞上线前要找律师确认;另外要书面问 Stripe 客服:这个架构下,英国个人平台需不需要自己的 FCA 授权。

### 11a. 托管实现方式:优先做法 B,验证不通过才用做法 A(2026-09-23 决定)

- **做法 B(优先)**:Stripe **destination charges**(`transfer_data.destination` + `application_fee_amount`),钱付款时就进卖家的 Express 账户余额,平台余额里只有佣金;平台把卖家账户的提现设成**手动**(`settings.payouts.schedule.interval = "manual"`),订单放款时由平台对这个卖家账户发起一笔金额 = 该订单卖家应得的 payout。退款:`refunds.create` 带 `reverse_transfer: true` 和 `refund_application_fee: true`(部分退款时按比例)。
- **做法 A(备选)**:现在代码里的 separate charges & transfers,加上第 8 条的修复(平台提现改手动、`source_transaction`)。

**写代码前必须先在 Stripe 测试模式里验证做法 B 的这几点,任何一条不成立就用做法 A,并把验证结果写回这里:**

1. 平台能把 Express 账户(英国、EEA、美国、加拿大、瑞士)的提现设成手动,而且**卖家自己在 Express 后台不能绕过去提现**。
2. 钱在卖家账户余额里**最长能压多久**(各国上限)。必须覆盖一笔订单的最长周期:交付天数上限 60 天 + 审稿 3 天 + 确认期 3 天 + 纠纷处理;压不了这么久,要么缩短交付天数上限,要么用做法 A。
3. 平台能按单笔订单金额对卖家账户发起 payout,不会把其他还在托管中的订单的钱一起打出去(代码里要按订单记账,payout 金额只算已放款订单)。
4. 英国平台对这 5 个地区的卖家做 destination charges 可行;另外评估要不要加 `on_behalf_of`(让卖家成为商户,更符合第 11 条"平台只是代理"的表述,但会影响跨境和手续费)。
5. 部分退款时 `reverse_transfer` + 按比例 `refund_application_fee` 的金额跟第 4 条的规则算得对得上。

做法 B 下,第 6 条"先撤回转账,再退给买家"对应的就是带 `reverse_transfer` 的退款(放款前钱还在卖家余额里,一定够);放款后(已经 payout)的退款才会让卖家余额变负数,走第 6 条的 £10 门槛规则。

#### 11a 验证结果(2026-09-23 第 0 步)

**决定(2026-09-23):用做法 A。** 做法 B 下钱在卖家账户里最多只能压约 90 天,拍摄/访谈类订单周期长,压不住;另外 B 跟第 9 条"KYC 后置"冲突。下面的验证记录保留作为依据。


**验证方式及局限**:开发环境的网络策略挡住了 `api.stripe.com` 和 `docs.stripe.com`,也没有 Stripe 测试 key,所以**没能在测试模式里实际跑**,下面的结论只来自 Stripe 官方文档(通过搜索引擎读到的摘录)。标了"需实测"的点,要等拿到测试 key、放开 `api.stripe.com` 之后补测。

| # | 验证点 | 结论 | 依据 |
|---|---|---|---|
| 1 | 平台把 Express 账户提现设成手动,卖家不能绕过 | **文档上成立,有前提,需实测**。平台可以用 Accounts API 设 `settings.payouts.schedule.interval = "manual"`;Express 卖家能不能自己改提现计划,由平台在 Connect 设置的 payout schedules 页决定。**有一个绕过口子**:文档写明"账户设成手动也能用 Instant Payouts",所以平台必须在 Connect 设置里**关掉 Express 账户的 Instant Payouts 和"卖家自己改提现计划"**。没关的话,卖家可以在 Express 后台把托管中的钱即时提走 | [Using manual payouts](https://docs.stripe.com/connect/manual-payouts)、[Manage payout schedule](https://docs.stripe.com/connect/manage-payout-schedule)、[Instant Payouts for Connect](https://docs.stripe.com/connect/instant-payouts)、[Express 用户帮助:How do I manage my payouts](https://support.stripe.com/express/questions/how-do-i-manage-my-payouts) |
| 2 | 钱最长能压多久 | **最多约 90 天**(按卖家国家,英国/EEA/加拿大/瑞士都按 90 天算;美国账户的上限更长)。超过上限 Stripe 会**自动把钱打给卖家**,也就是任务还没做完卖家就拿到了钱。搜索摘录只确认了"最多 90 天"这句话,各国上限表没能完整读到,**需实测/人工看一眼文档表格**。订单正常周期是 60 + 3 + 3 = 66 天,但**修改后重新提交没有时限、纠纷裁决也没有时限**,极端情况会超过 90 天 | [Using manual payouts](https://docs.stripe.com/connect/manual-payouts)、[Payouts to connected accounts](https://docs.stripe.com/connect/payouts-connected-accounts) |
| 3 | 能按单笔订单金额发 payout | **成立**。手动模式下平台用 Payouts API(以卖家账户身份)指定金额发起 payout,不会把其他托管中的钱一起打出去。要注意:payout 只能动**已结算(available)**的余额,刚付款几天内的钱还是 pending,订单很快完成时 payout 会失败,代码要能稍后重试 | [Using manual payouts](https://docs.stripe.com/connect/manual-payouts) |
| 4 | 英国平台对 5 个地区做 destination charges;要不要加 `on_behalf_of` | **不加 `on_behalf_of` 时成立**:美国/英国/EEA/加拿大/瑞士的平台可以给这几个地区的 Connect 账户转账,destination charges 支持这些地区之间的跨境资金流。**建议 MVP 不加 `on_behalf_of`**:加了之后卖家变成结算商户,卖家账户要额外开 `card_payments` 能力(KYC 更重),手续费和结算按卖家国家算,跟第 2 条"平台承担 Stripe 实际手续费"的口径也对不上 | [Create destination charges](https://docs.stripe.com/connect/destination-charges)、[Cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts) |
| 5 | 部分退款时 `reverse_transfer` + `refund_application_fee` 跟第 4 条算得对得上 | **成立**。文档:部分退款时按比例撤回转账,`refund_application_fee` 也按比例退。验算 £100 订单:`application_fee_amount` = 12 + 4.20 = £16.20,转给卖家 £83.80;退 £40 → 按比例撤回转账 83.80 × 40% = £33.52,平台按比例退 16.20 × 40% = £6.48,33.52 + 6.48 = 40;卖家最终 £50.28,**跟第 4 条的例子完全一致**。只有 1 便士的舍入差,由 Stripe 决定,代码按 Stripe 返回的实际金额记账 | [Create destination charges](https://docs.stripe.com/connect/destination-charges)、[Handle refunds and disputes](https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes) |

**5 个点之外发现的冲突(要产品负责人决定)**:destination charges 在**买家付款那一刻**就要写 `transfer_data.destination`,也就是说卖家那时候必须已经有开通了 `transfers` 能力的 Connect 账户。这跟第 9 条"5 个地区之内、还没开通 Stripe 的卖家,买家照常可以付款(KYC 后置)"**直接冲突**——做法 B 下这类卖家的订单根本没法创建。做法 A(separate charges & transfers)没有这个问题,因为它到放款时才需要卖家账户。

### 实现进度

#### 第 1 批(2026-09-23 已写代码,**SQL 要手动执行**):资金安全(第 8 条)+ 固定费率(第 2 条)+ 24 小时免费取消(第 4 条第一行)

**代码改了什么**

- **固定费率**:`src/lib/fees.ts`(服务端和发布表单共用,按最小货币单位整数计算)。Service fee 12%,Payment processing fee 4% + 固定部分。
  - 固定部分按币种(`PROCESSING_FIXED_FEE_MINOR`):GBP 0.20、USD 0.25、EUR 0.25、CAD 0.35、AUD 0.40、SGD 0.35、HKD 2.00、JPY 40。USD/EUR 是第 2 条写明的,**其余 5 种是按 2026-09 汇率取的等值整数,待产品负责人确认**。
  - 最低发布价改成约 USD 1 的等值(`MIN_LISTING_PRICE_MINOR`,2026-09-24 定):USD 1.00、GBP 0.80、EUR 0.90、CAD 1.40、AUD 1.50、SGD 1.30、HKD 8.00、JPY 150,原来是所有币种都 0.99。
  - JPY 是零小数位货币,之前下单金额一律 ×100 是错的,现在统一走 `toMinorUnits`。
  - 发布/编辑广告表单实时显示 "You'll receive"(卖家挂单时就能看到到手金额);Sales 页明细改名 Service fee / Payment processing fee,付款后就显示(不用等放款)。
  - `payments` 三列的含义变了(列名沿用):`platform_fee_amount` = Service fee,`stripe_fee_amount` = 向卖家收的 Payment processing fee(**不是** Stripe 实际扣的手续费),`net_amount` = 卖家到手,都是订单币种,webhook 收到付款时就写好。
- **放款**(`src/lib/stripe/release.ts`):Transfer 带 `source_transaction`(绑定原始付款)、`idempotency key`,创建前先按 `transfer_group` 查有没有转过账,同一笔订单最多转一次。付款币种跟平台结算币种不同时(比如 USD 付款按 GBP 入账),按 Stripe 这笔付款实际的汇率换算卖家到手金额,换汇差平台承担。
- **Cron**(`/api/cron/auto-confirm`):改成同时接受 GET(Vercel Cron)和 POST;新增根目录 `vercel.json`,每小时跑一次;顺带重试停在 `confirmed`(上次放款失败)的订单。没配 `CRON_SECRET` 时一律 401。
- **订单写入全部改走服务端**(service_role):下单(`buyListingAction`)、标记交付、买家确认、取消、webhook、cron。配合下面的 SQL 收回 `authenticated` 对 `listing_orders` 的 insert/update 权限——之前 RLS 允许买卖双方直接改自己订单的 `status`/`delivered_at`/`amount`,甚至直接插入一条金额随便填、状态直接是 `paid_in_escrow` 的订单。
- **Webhook 核对实付金额**:`checkout.session.completed` 时核对 `payment_status = paid`、币种、`amount_total` 跟订单一致。对不上:订单停在 `pending_payment`(不进托管,卖家看不到待交付,不会放款),`payments` 记一行 `status = 'amount_mismatch'`,打错误日志,**不自动退款**,由管理员去 Stripe 后台人工处理(MVP 先不做复杂退款流程)。
- **24 小时免费取消**(`src/lib/orders/actions.ts` 的 `cancelWithin24hAction`,Sales/Purchases 页的 "Cancel order" 按钮):付款后 24 小时内、订单还在 `paid_in_escrow`(卖家还没交付)时,买家或卖家都能直接取消,不需要对方同意。先用条件更新把订单锁成 `cancelled`,再调 Stripe 全额退款(idempotency key `order-<id>-cancel-refund`),退款失败就还原成 `paid_in_escrow`。卖家不承担费用,`cancel_reason = 'free_24h'`,不算违约。
- 第 4 条其他几行、第 4a/5/6/7 条(超期、协商退款、拒付、强制扣回等)**这一批没做**,后面分批再做。

**要手动执行的 SQL**(Supabase SQL Editor,按顺序执行;`alter type ... add value` 不能跟用到新值的语句放在同一个事务里,所以第 2 段单独执行):

```sql
-- 1. 收回 authenticated/anon 对 listing_orders 的写权限:订单只能由服务端(service_role)写。
drop policy if exists "buyers and sellers can update their own orders" on public.listing_orders;
drop policy if exists "buyers can create their own orders" on public.listing_orders;
revoke insert, update, delete on public.listing_orders from authenticated, anon;
-- Supabase 默认还给了 TRUNCATE/REFERENCES/TRIGGER,API 用不到,一并收回(TRUNCATE 不受 RLS 约束)。
revoke truncate, references, trigger on public.listing_orders, public.payments from authenticated, anon;
-- select 策略("buyers and sellers can view their own orders")保留不动。
```

```sql
-- 2. 订单新增"已取消"状态(单独执行这一句)
alter type public.listing_order_status add value if not exists 'cancelled';
```

```sql
-- 3. 取消相关的列
alter table public.listing_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancel_reason text;

alter table public.payments add column if not exists stripe_refund_id text;
```

执行完可以用这句核对 `authenticated`/`anon` 只剩 `SELECT`:

```sql
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'listing_orders' and grantee in ('authenticated', 'anon');
```

**要手动在后台配的**

1. **Stripe 后台(平台账户,测试和正式各做一次)**:Settings → Payouts(或 Balance → Payout schedule)把平台自己的提现改成**手动**(第 8 条第 1 点)。不改的话 Stripe 每天自动提现,会把托管中的钱提走;代码里的 `source_transaction` 能保证转账不因余额不足失败,但托管中的钱留在平台余额里才是这套模型的前提。
2. **Vercel**(Pro):环境变量加 `CRON_SECRET`(随机长字符串),Vercel Cron 会自动带 `Authorization: Bearer $CRON_SECRET`。部署后在 Vercel 项目的 Settings → Cron Jobs 能看到 `/api/cron/auto-confirm` 每小时一次。
3. Stripe webhook 订阅的事件不变(`checkout.session.completed`、`account.updated`)。

**用测试卡手动走一遍(执行完 SQL、部署到预览环境之后)**

1. 发布一条 GBP 100 的广告,表单上应该显示 Service fee −12.00、Payment processing fee −4.20、You'll receive 83.80。改成 JPY,最低价提示应该是 150 JPY,不能填小数。
2. 另一个账号(或 guest)用 `4242 4242 4242 4242` 付款 → 订单进 "In escrow",Sales 页明细显示 83.80。
3. 买家在 Purchases 页点 "Cancel order" → 订单变 "Cancelled — refunded",Stripe 后台这笔付款显示全额退款;再点一次(或刷新重复提交)不会退第二次。卖家那边也能取消(再下一单试)。
4. 再下一单 → 卖家标记交付 → 买家 "Confirm receipt" → Stripe 后台 Connect → Transfers 出现一笔 83.80、`source_transaction` 指向原付款的转账,订单变 "Paid out"。
5. 用浏览器控制台拿登录态直接调 Supabase REST 改自己订单的 `status`,应该被拒(permission denied)。

### 12. 以后视取消率再加的规则(MVP 不写进 Terms、不写代码)

- **买家原因退款扣 2% 通道费**:"若因买家自身原因(如填错广告素材、单方面取消等)在卖家接单前申请退款,平台将扣除 2% 的第三方支付通道处理费,退还剩余金额。"——等上线后看实际取消率再决定要不要加。
- 加之前要注意两点:① 跟第 4 条"付款后 24 小时内免费取消"冲突,要定清楚先后;② 个人消费者在 14 天法定取消权内取消的(第 10 条),按英国法规一般要退全款、不能扣手续费,这条规则可能只对企业买家有效,要跟律师确认。

### 还没拍板的问题(实现前要确认)

- 消费者 14 天取消权的具体条款措辞要找律师确认(做法已定,见上面第 10 条)
- 第 11 条 Terms 英文措辞要找律师确认,并书面问 Stripe 客服是否需要 FCA 授权

## 管理员系统(2026-09-18 加)

用户反馈"广告位现在直接公开,需要有管理员后台"。拍板的方案:**新 listing 需要管理员事前审核才能公开**(不是先上线、管理员事后抽查下架),管理员这一版能做:审核/拒绝/下架/推荐 listing,封禁/解封用户账号,只读查看全站订单。

### 页面结构:`/admin/*` 是跟 `/dashboard/*` 平级的独立路由,不是嵌套子页面

第一版把管理员页面放在 `/dashboard/admin/*` 下面,复用个人 dashboard 的 `DashboardSidebar`,只是给 Admin 那组导航项加了个琥珀色边框做视觉区分。反馈是"个人和 admin 的内容一起了"——同一个侧栏、同一个 `dashboard/layout.tsx` 外壳,靠颜色区分不够,管理员和个人视角必须**不在同一个页面**。Next.js 的嵌套 layout 机制决定了只要 URL 还挂在 `/dashboard/` 前缀下,就一定会经过 `dashboard/layout.tsx` 这层壳(子 layout 没法"跳过"父 layout 的外框),所以唯一的解法是把整棵 admin 路由树挪到跟 `/dashboard` 平级的顶层路径:`src/app/dashboard/admin` → `src/app/admin`(`git mv` 保留文件历史),`admin/layout.tsx` 换成自己独立的深色导航条(Overview/Listings/Users/Orders + "← Back to my dashboard"),不再引用 `DashboardSidebar`。`DashboardSidebar`/`dashboard/layout.tsx` 也都回退成不知道 admin 状态的纯个人导航版本。入口从侧栏挪到了账号头像下拉菜单(`UserMenu.tsx`)里一条单独的"🛡 Admin"链接,只有 `isAdmin` 为真时才渲染,点进去就是完全独立的 `/admin` 页面,跟个人 dashboard 视觉和路由上都彻底分开。

### 权限模型:谁是管理员、为什么这么设计

**管理员身份存在一张独立的 `admins` 表里,不是 `profiles` 上的一个 `is_admin` 字段。** 原因:如果做成 `profiles.is_admin` 列,哪怕给它配了"只有 service_role 能改"的列权限,这张表本身的复杂度和其他业务字段混在一起,审计"到底谁是管理员"要在一堆别的列里翻;单独一张表,`select * from public.admins` 就是完整名单,而且这张表**除了"能查自己那一行"的 select 策略,没有给 `authenticated` 开任何 insert/update/delete 策略**——代码里不存在任何一条路径能让用户自己把自己加进这张表,加管理员只能人工去 Supabase 后台执行 SQL insert。第一个管理员必须这样手动加:

```sql
insert into public.admins (user_id) values ('<你自己账号的 uuid,去 profiles 表里查>');
```

### `listings.status` 状态机(2026-09-19 起已改,见下面"发布免审核 + KYC 后置"一节)

```
(发布)--> active --(管理员 remove)--> removed
```

这是 2026-09-19 之后的状态机,新发布的 listing 直接落在 `active`,不再经过 `pending_review`/`draft`/`rejected`——这几个值还留在 `listing_status` 这个 Postgres 枚举里(没有删类型定义,是为了不影响改动之前发布的老数据),`draft`/`pending_review`/`rejected` 只会出现在 2026-09-19 之前发布的老 listing 上,新的发布/编辑流程都不会再产生这三个值。老状态机(`draft --(卖家连好 Stripe 提交)--> pending_review --(管理员 approve)--> active`,`pending_review --(管理员 reject)--> rejected`)的历史记录见 git blame,这里不重复贴一遍。

`removed` 这个状态买家和首页都看不到(`isVisible = status==='active' || isOwnListing` 这条判断没变),卖家自己在 `/dashboard/my-listings` 能看到全部状态。编辑 listing(`/dashboard/my-listings/[id]/edit`)**不会**改变 `status`——2026-09-18 那版"编辑 active listing 会退回 pending_review 重新审核"的规则在 2026-09-19 随着"发布免审核"一起去掉了,理由很直接:发布本身都不需要人工批准,编辑也没道理需要卡审核。

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

- **2026-09-18 后期加了 listing 编辑入口**(见下面"卖家编辑/删除 listing"一节),卖家现在能改被拒绝的 listing 内容,但改完**不会自动把 `rejected` 改回 `pending_review` 重新进审核队列**——状态原样不变,卖家要重新提交审核目前还是得联系人工,不是完全没有编辑能力,是"编辑了也不会自动重新排队"
- 管理员看不到 listing 被拒绝/下架的历史原因(没有存 reason 字段,只有状态本身)
- 用户提到"管理员能定期发邮件或消息给用户"——这版没做,邮件通知本来就等 Resend 接入之后再说(见"已知欠缺"里的邮件通知那条);站内消息(`listing_messages`)是绑在某个 listing 下的一对一会话,不支持管理员群发/单独给某个用户发一条不挂靠 listing 的消息,这个需要额外设计(比如 `listing_id` 允许为 null),这版先没做
- 用户提到"审核先人工、后期机器人审核"——这版只做了人工审核界面,自动化审核(比如接一个内容审核 API 自动初筛)完全没做,是未来的事
- `/admin/orders` 只显示最近 200 条,没做分页/搜索/按状态筛选

## 卖家编辑/删除自己的 listing(2026-09-18 加)

之前 `/dashboard/my-listings` 只是列表,唯一的"改内容"手段是"Duplicate"(复制成一条全新的 listing,见"MVP v2 数据库变更"里 `social_account_id` 那条的说明)。这次补上了真正的编辑和删除:

- **`/dashboard/my-listings/[id]/edit`**(`page.tsx` + `actions.ts` 的 `updateListingAction`):复用 `ListingForm.tsx`(跟发布新 listing 是同一个表单组件,`initialListing` 预填,不传 `duplicatedFromTitle` 所以不会出现复制那条的提示条),校验逻辑也复用了同一份(`src/lib/listingFormValidation.ts` 的 `parseListingFormFields`,从 `new-listing/actions.ts` 里抽出来的,创建和编辑共用,避免同一套校验写两遍)。进页面时会先查一次这条 listing 的 `seller_id` 是不是当前登录用户自己的,不是的话 `notFound()`,不依赖前端隐藏链接。
- **图片能单张删除/追加**:`ListingForm.tsx` 里"已上传的媒体"从纯预览改成每张图右上角有个悬浮 ✕ 删除按钮(`useState` 管理,删了就不提交对应的隐藏 `existing_media` input),配合原有的"追加新文件"上传框,能做到"删掉旧封面、传一张新的"这种操作,不用做拖拽排序。保存时,提交上来的 `existing_media` 只认真的是这个用户自己在 `ad-space-photos` bucket 下的文件路径(校验路径里包含 `/object/public/ad-space-photos/{user_id}/`),没有无条件相信前端传来的 URL 字符串;新 `media_urls` 落库成功之后,才把这次被删掉的旧图从 storage 里真的删掉(先存库后删文件,顺序跟头像/banner 那次修复一样,避免存库失败但文件已经没了的情况)。
- ~~编辑已经 `active` 的 listing 会自动退回 `pending_review`~~——**这条规则 2026-09-19 已经随"发布免审核 + KYC 后置"一起去掉了**(见下面同名一节),`updateListingAction` 现在不会改动 `status`。保留这条历史记录是因为下面这段解释了当初为什么要用 `createServiceClient()` 而不是普通 client 去改 `status`——这个技术背景(`listings.status` 被 `revoke update ... from authenticated` 收回,只能靠 service_role 写)对以后任何需要碰 `status` 列的新功能仍然成立,不是过时信息:`listings.status` 这一列已经被 `revoke update ... from authenticated` 收回了(见上面"顺手补的一个安全洞"一节),不管是审核回退还是别的什么改 `status` 的需求,都得走 `createServiceClient()`(服务端 service_role key),不能走普通登录态 client。
- **删除**:`/dashboard/my-listings` 每条 listing 旁边加了 "Delete"(复用现成的 `ConfirmSubmitForm` 弹确认框组件,列表页/社交账号删除按钮当年就是这个组件),`deleteListingAction` 先校验 `seller_id` 是自己的,删除数据库行走的是普通登录态 client(RLS 里 `sellers can delete own listings` 这条策略本来就有,不需要 service_role)。**`listing_orders.listing_id` 引用 `listings(id)` 时没有声明 `on delete cascade`**(默认是 `no action`/外键约束),所以一条有过任何订单(哪怕是很久以前已经完成的)的 listing 删不掉,Postgres 会直接拒绝、报外键约束错误——这是故意保留的行为,不是 bug:不然删掉 listing 会让买家的历史订单突然指向一条不存在的记录。代码里把这种情况识别出来(`error.message` 里包含 "foreign key"),转成友好提示"有订单历史,删不掉,需要联系管理员",而不是把 Postgres 原始报错糊到用户脸上。删除成功后,这条 listing 的 `media_urls` 也会跟着从 storage 里清掉(同样是"先确认数据库那边真的删了,再删文件"的顺序)。
- **已知限制**:管理员的下架(`removed`)/推荐(`is_featured`)那两列还是只有 `/admin/listings` 能碰,这次没有给卖家开放"暂停/paused"这个自助操作(`listings.status` 整列都被 REVOKE 了,卖家自助暂停需要另外一个专门的 service_role action,这次没做,只做了用户明确要的"编辑"和"删除")。
- 验证方式:`npm run build` + `npx eslint src` 全绿。这个开发环境连不上真实 Supabase 项目,没有用真实账号跑过"编辑一条 active listing → 确认状态真的退回 pending_review"、"删除一条有订单的 listing → 确认真的报错而不是误删"这两条关键路径,上线后建议人工各测一次。

## 广告类型 ad_type(2026-09-19 加)

**产品背景**:之前发布 listing 只有自由文本的 title/description,买家没法跨卖家比较"这到底是哪种广告"。加了一个固定模板的 `ad_type` 单选,跟 `categories`(接哪些品牌类目)是两个独立维度——一条 listing 一个 `ad_type` + 一组 `categories`。

**这次讨论过、但没做的**(明确排在这次范围外,免得以后被误以为已经支持):

- **Platform 没有改回多选**——9 月 18 号才把 listing 从"展示卖家所有社交账号"改成"一个 listing 绑定一个具体投放位",这次讨论确认继续保持这个决定不变(卖家想在多个平台卖,继续用现成的 Duplicate 功能各发一条)。多平台打包价("套餐价")是明确的未来事项,等验证过单平台这版之后再看要不要做。
- **没有做 Ad Type × Platform 的价格矩阵**——`ad_type` 是这条 listing 唯一的一个值,不是"这条 listing 支持哪几种类型、各自多少钱"的列表;卖家想卖多种 Ad Type,一样是多发几条 listing,而不是一条 listing 里挑类型。
- **投放时长(Duration)、版权归属(Usage rights)这两个属性没有落地**——只在 `AD_TYPES`/`ListingForm` 里加了 Ad Type 这一项,时长和版权是明确的后续事项。

**`custom` 是干什么的**:不是"没选/留空"这个语义,是卖家主动声明"这个投放位不是标准套餐"——listing 详情页会在 Buy now 按钮上方提示买家"先私信卖家谈清楚范围/价格",但不会拦掉购买按钮本身(卖家标了 custom 也可能已经想好了固定价,不强制走私信这一步)。

**代码改动**:`src/lib/supabase/enums.ts` 新增 `AD_TYPES`/`AD_TYPE_LABELS`;`ListingForm.tsx` 加了必填的 Ad type 下拉(`src/lib/listingFormValidation.ts` 的 `parseListingFormFields` 校验、创建和编辑共用);`ListingCard.tsx`/listing 详情页展示成一个小标签。**这个字段上线前发布的老 listing 是 `null`**(没有强制回填的入口),前端不特殊处理只是不显示这个标签,不算"未指定/Other"的强提示(跟 `social_account_id`/`is_website_placement` 那次不一样,这次没有专门的"Other"文案)。

**数据库变更**:

```sql
create type public.ad_type as enum (
  'static_image_ad',
  'video_product_placement',
  'product_intro_video',
  'sponsored_feature',
  'product_test_video',
  'custom'
);

alter table public.listings add column if not exists ad_type public.ad_type;
```

不需要新的 RLS 策略——这一列走的是 `listings` 表原有的 insert/update 策略(`auth.uid() = seller_id`),没有单独授权的必要。

### 类目加一个 "Any category" 选项,详情页布局微调(2026-09-19 加,自测反馈)

上线 `ad_type` 之后自测发现三个问题,这次一起修:

1. **类目必选,但有些卖家什么类目都能接**——之前"Ad categories you accept"是纯多选,必须至少选一个,没有"我全都接"这个快捷方式,逼着接受任意类目的卖家把 19 个类目全勾一遍,详情页也会因此堆出一整排类目标签。加了一个 `any` 值(`LISTING_CATEGORIES`/`listing_category` 枚举新增),跟具体类目互斥:`ListingForm.tsx` 勾选"Any category"之后隐藏具体类目的勾选格,提交时只带 `categories=any` 一个值;`parseListingFormFields` 也做了服务端归一化(万一前端状态出岔子,只要提交里出现 `any` 就强制只存 `['any']`),这样详情页"Accepts ads from"那一行天然只会渲染一个"Any category"标签,不会变成"any + 19 个具体类目"堆一起。**`seller_profiles.content_categories`(创作者自己的内容领域,复用同一个枚举类型)故意没加这个选项**——"我的内容领域是任意"这个语义不成立,`ProfileForm.tsx` 那边的勾选列表过滤掉了 `any`。
2. **详情页布局:类目标签跟标题挤在一起,新加的 Ad type 标签也在那一排,顶部太挤**——把"Accepts ads from"那一块从标题上方挪到了 Details/描述区块下面,标题上方现在只留 Ad type + 非 active 状态这两个信息量大的标签。
3. **投放位置只显示平台图标,没有文字**——`SocialStatChip` 组件本身是故意做成"图标 + 粉丝数,不重复文字"的(2026-09-17 的一次改动,图标已经能识别平台、卡片这种寸土寸金的地方不需要再堆文字),但自测发现在 listing 详情页(空间明显更宽松、买家又特别需要确认"这条广告到底投在哪个平台")这样不够清楚。**只在 listing 详情页**的卖家信息区块单独加了平台文字(`SOCIAL_PLATFORM_LABELS[placementAccount.platform]`),没有改 `SocialStatChip` 这个共享组件本身——`ListingCard.tsx`/`PublisherCard.tsx` 那些空间紧张的地方保持不变。

**数据库变更**:

```sql
alter type public.listing_category add value if not exists 'any';
```

不需要新的 RLS/权限调整。

## 发布免审核 + KYC 后置(2026-09-19 决策记录)

**这次讨论的产品定位**:团队想把 HereForAds 定位成一个轻量工具型平台,不是每一条 listing 都要人工把关的重内容平台。2026-09-18 才加上的"必须先做 Stripe KYC + 管理员批准才能上线"这套流程,被认为对新用户太重——刚注册的卖家发一条广告要等审核通过才能被买家看到,容易在这个等待期就流失掉。这次改成"发布即上线,问题事后处理"。

**改了什么**:

1. **发布不再要求 `stripe_onboarded`**——`createListingAction` 不再检查这个字段,新 listing 一律直接 `status: "active"`,买家立刻能看到、能下单。之前"没连 Stripe 就只能停在 draft"的逻辑整个删掉了。
2. **发布不再进管理员审核队列**——不再有 `pending_review` 这一步,`/admin/listings` 从"发布前必经的审核关卡"变成"事后监督工具":管理员可以在任意状态下用 `removeListingAction` 把一条 listing 立刻下架(这个 action 本来就支持任意状态,一直没变过),配合 `/admin/users` 的封号、footer 联系表单收到的举报,构成"先上线、有问题再处理"的事后机制。默认 tab 从"Pending review"改成了"Active"(反正以后基本不会再有新的 pending_review 了)。
3. **编辑 listing 不再退回审核**——见上面"`listings.status` 状态机"一节,`updateListingAction` 不再改 `status`。
4. **KYC 往后挪,挪到真正需要它的那一刻**——技术上站得住脚:这个平台用的是 Charges & Transfers 模式,买家付款时钱先进平台自己的 Stripe 账户(`src/app/listings/[id]/actions.ts` 创建 Checkout session 时没有 `transfer_data`/`application_fee_amount`),真正需要卖家的 Stripe Connect 账户存在,是订单走到"确认收货→放款"那一步(`src/lib/stripe/release.ts` 的 `releaseOrderPayout`)才发起 Transfer。中间隔着"买家付款→卖家标记交付→买家确认/超时"这几步,少说也有几天缓冲。所以卖家理论上可以先发布、等真的有人要买了再去连 Stripe,不用一上来就走 KYC 吓退还在观望的新用户。
   - **发布时**(`/dashboard/new-listing`):没连 Stripe 会看到一条提示,告诉他们能正常发布/被买到,只是收不到钱要先连 Stripe——不阻塞发布。
   - **`/dashboard/my-listings`**:如果有 `active` 的 listing 但还没连 Stripe,顶部会有一条提醒("你的广告已经在线,买家随时可能下单,记得去连 Stripe")。
   - **标记交付时**(`/dashboard/sales` 的 `markDeliveredAction`):**这一步硬性要求 `stripe_onboarded`**,没连 Stripe 直接拒绝、报错提示去连——这是真正的把关点,卡在"钱马上要动"之前,而不是等 `releaseOrderPayout` 真的因为没有 Connect 账户而失败(那样订单会卡在一个需要人工介入的 `payout_failed` 状态,比在标记交付这一步就拦下来更麻烦)。
5. **发布时新增两个必勾选框**(`ListingForm.tsx`,只在创建新 listing 时出现,编辑不会重新问):
   - "我拥有这个账号(或有明确授权在上面接广告),内容是原创的、不涉及版权纠纷,虚假或侵权内容导致的法律责任由我自己承担"
   - "我同意平台的 Terms of Service"
   两个都是 `required`,`createListingAction` 服务端也会再校验一遍(防止绕过表单直接提交)。勾选时间戳存进 `listings.rights_attested_at`/`terms_accepted_at` 这两个新列,作为"卖家当时确认过"的留痕。
6. **Terms 页更新**——`src/app/terms/page.tsx` 第 3 条去掉了"我们审核后才上线"的措辞,改成"发布即上线,不代表我们核实过卖家的任何声明",并加了一段对应上面第一个勾选框的内容,明确写"虚假/未授权/侵权内容导致的法律责任由发布者自己承担"。**这仍然是草稿页面,没有律师审过**,上线前建议找律师过一遍这段免责措辞是否真的站得住(尤其是"平台责任边界"一节已经讨论过的:Stripe 层面的拒付/欺诈风险没法通过 ToS 完全甩给发布者,这条免责主要覆盖的是第三方版权/欺诈这类法律责任,不是 Stripe dispute rate 那部分风险)。

**这次没有做的**(明确排除在范围外):没有做任何自动化内容检测(关键词过滤、图片识别之类),事后监督完全靠人工举报 + 管理员手动 Remove/Ban,这是刻意的范围控制——先看实际滥用情况有多严重,再决定要不要投入自动化审核。

**数据库变更**:

```sql
alter table public.listings add column if not exists rights_attested_at timestamptz;
alter table public.listings add column if not exists terms_accepted_at timestamptz;
```

不需要新的 RLS 策略(走 listings 表原有的 insert 策略),也不需要改 `listing_status` 枚举类型(`draft`/`pending_review`/`rejected` 这几个值继续留着,只是新流程不会再产生)。

## Price Card(个人主页价目表,2026-09-19 加)

**产品需求**:买家点进卖家的个人主页(`/sellers/[id]`/`/[username]`)想快速知道大概价位,不想一条一条点开 listing 才能看到价格。加一个"价目表"卡片,展示在个人主页 "Social reach" 旁边(桌面宽度下两栏并排,复制截图里红框的位置)。

**做成了结构化列表,不是一张图,能选的字段都是选的、不用自己想文案**(2026-09-19 中途改过两版:第一版每行是"标题+价格"两个自由文本框,发现卖家不知道标题该怎么写,改成了 Ad type + Platform 两个下拉;第二版发现 Platform 强制必选导致填表太长、价格没有币种、也没地方写"最终价格取决于需求"这种备注,又调整了一次,也就是下面这版):

- **Ad type**(必选):下拉选,复用 `listings` 那个固定的 `ad_type` 枚举(`AD_TYPES`/`AD_TYPE_LABELS`),跟发布 listing 时选的是同一份选项
- **Platform**(**可选**,2026-09-19 second pass 改成非必填):下拉选一份常见平台列表(`PRICE_CARD_PLATFORM_OPTIONS`,新加在 `enums.ts` 里——**故意不复用** `SOCIAL_PLATFORMS` 那个绑定真实社交账号/粉丝数的枚举,这里只是一份文案建议清单,列了 TikTok/Instagram/YouTube/X/Facebook/Douyin/小红书/微博/视频号/B 站/Blog-Website),默认 "Not specified",选不到就选 "Other" 弹出一个文本框自己打字。落库的 `seller_price_card_items.platform` 是可空的 `text` 列
- **Starting price**(必选):拆成金额(`price_amount numeric`)+ 币种(`price_currency text`,下拉选常见几个,复用发布 listing 表单那份 `CURRENCIES` 列表——这份列表 2026-09-19 从 `ListingForm.tsx` 挪到了 `enums.ts` 共享)两列,展示时统一拼成 "From {币种} {金额}",明确这是起价不是固定报价
- **Note**(可选):自由文本,给"最终价格取决于需求,具体细节请私信"这类说明用,输入框自带占位提示词引导怎么写,展示在这一行价格下方的小字

这些行**不是真的可下单的 listing**——纯展示、给买家一个大致预期,真正下单还是要点进具体的 listing 走 Buy now(卖家管理页和公开页都有文案说明这一点,避免被误认为是能直接结算的报价)。

**背景图这个想法试过、又去掉了(2026-09-19 同一天)**:最早还做过一版让卖家上传自定义背景图,铺在价目表底下。上线自测发现两个问题:一是自由上传的图片很容易跟站内其他卡片(比如旁边的 "Social reach")的极简 zinc/white 风格不搭,观感不统一;二是就算调淡遮罩透明度让图片看得见,深色文字压在花哨图片上也常常不好读。**当天就整个去掉了这个子功能**,只保留干净的列表样式。`seller_profiles.price_card_image_url` 这一列还留在数据库里(历史遗留,允许为空,没有代码再读写),`updatePriceCardImageAction`/`removePriceCardImageAction` 这两个 action 和管理页那个上传框都已经删掉。

**代码结构**(照抄 `social_accounts` 那一套"列表 + 加一行表单 + 逐行编辑/删除"的既有模式,没有发明新的交互范式):

- 新表 `seller_price_card_items`(id/seller_id/ad_type/platform/price_amount/price_currency/note/sort_order),RLS 跟 `social_accounts` 一样(公开可读,只有本人能增删改)
- 管理界面:`src/app/dashboard/profile/PriceCardManager.tsx` + `PriceCardItemRow.tsx`,server actions 加在现有的 `src/app/dashboard/profile/actions.ts` 里(`addPriceCardItemAction`/`updatePriceCardItemAction`/`deletePriceCardItemAction`)
- 展示组件:`src/components/PriceCard.tsx`(纯列表,白/浅灰斑马纹分行,没有背景图),挂在 `SellerProfileView.tsx` 里,跟 "Social reach" 那块一起包进一个 `sm:grid-cols-2` 的两栏布局(桌面宽度下并排,手机上各自占一整行堆叠)——`/sellers/[id]` 和 `/[username]` 两条路由共用这一个 view 组件,两边都要传 `priceCardItems` 这个新 prop
- 没有做拖拽排序——`sort_order` 就是加入的顺序(insert 时取当前最大值 + 1),想调整顺序目前得删了重加,这是刻意的范围控制,不是漏做

**数据库变更**(依赖上面"广告类型 ad_type"一节先建好的 `public.ad_type` 枚举类型;不需要 `seller_profiles.price_card_image_url` 这一列了,加过的直接跳过,没加也不用补):

```sql
create table public.seller_price_card_items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  ad_type public.ad_type not null,
  platform text,
  price_amount numeric not null,
  price_currency text not null,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.seller_price_card_items enable row level security;

create policy "anyone can view price card items"
on public.seller_price_card_items for select
to anon, authenticated
using (true);

create policy "sellers can insert own price card items"
on public.seller_price_card_items for insert
to authenticated
with check (auth.uid() = seller_id);

create policy "sellers can update own price card items"
on public.seller_price_card_items for update
to authenticated
using (auth.uid() = seller_id)
with check (auth.uid() = seller_id);

create policy "sellers can delete own price card items"
on public.seller_price_card_items for delete
to authenticated
using (auth.uid() = seller_id);
```

## 站内页面内容管理(Terms/Privacy 后台可编辑,2026-09-20 加)

**背景**:`/terms`、`/privacy` 原来是写死在 `page.tsx` 里的静态 JSX,改一个字都要改代码、重新部署。这次改成从数据库读,加了个 `/admin/pages` 后台,管理员可以直接用富文本编辑器改标题和正文,保存后前台立刻生效,不用发版。顺带把这两个页面的外层容器宽度从 `max-w-3xl` 改成了跟首页/listings 一致的 `max-w-7xl`(`src/lib/legalPageDefaults.ts` 里的 `LEGAL_CONTENT_CLASSNAME`)。

**怎么存的**:`site_pages` 表,`slug` 是 `terms`/`privacy` 两个固定值的主键,`content_html` 存管理员编辑器(`src/components/RichTextEditor.tsx`,基于 Tiptap)导出的 HTML,提交时先经过 `updateSitePageAction`(`src/app/admin/pages/[slug]/actions.ts`)里的 `sanitize-html` 清洗一遍,只放行 `p`/`h2`/`h3`/`ul`/`ol`/`li`/`strong`/`em`/`a` 这类语义标签、`class`/`style`/`script` 之类一律剥掉,前台 `dangerouslySetInnerHTML` 渲染前不需要再处理。写权限跟 `admins` 表一个思路:只开了公开 select 策略,insert/update/delete 全靠 `/admin/pages/[slug]/actions.ts` 用 `createServiceClient()` 绕过 RLS,`authenticated` 没有任何直接写权限。

**兜底**:`src/app/terms/page.tsx`、`src/app/privacy/page.tsx` 查不到这张表(还没跑下面的 SQL)或者某一行还没填过内容时,会退回 `src/lib/legalPageDefaults.ts` 里硬编码的默认文案(就是这次改动之前那两个页面原来的文字)——先把这份代码部署上线也不会导致页面变空白,SQL 什么时候找空跑都行。

### 完整 SQL(站内页面内容管理这部分)

```sql
-- ===== site_pages(Terms/Privacy 正文,只有 service_role 能写)=====
create table public.site_pages (
  slug text primary key check (slug in ('terms', 'privacy')),
  title text not null,
  content_html text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.site_pages enable row level security;

create policy "anyone can read site pages"
on public.site_pages for select
using (true);

-- 故意不建 insert/update/delete 策略,写入只能走 service_role(见上面说明)。

insert into public.site_pages (slug, title, content_html) values
('terms', 'Terms of Service', $terms_html$<p><em>Draft — this page summarizes the platform rules we’ve settled on so far. It hasn’t been reviewed by a lawyer yet and shouldn’t be treated as final legal terms until it has.</em></p>
<h2>1. What HereForAds is</h2>
<p>HereForAds is a marketplace where publishers list ad placements (a spot on a social account, website, or other digital space) and buyers pay to advertise there. We provide the listing, payment, and messaging tools — we don’t create, sell, or manage ad inventory ourselves, and we don’t guarantee the performance or results of any ad placement.</p>
<h2>2. Payments and escrow</h2>
<p>Payments are processed through Stripe. When you buy a listing, your payment is held in escrow until the publisher marks the order as delivered and you confirm receipt — or a fixed number of days pass after delivery with no response, at which point funds are released automatically. Publishers must complete Stripe’s identity verification (KYC) before they can publish a live listing.</p>
<p>HereForAds charges a platform commission on completed transactions, deducted from the publisher’s payout alongside Stripe’s own processing fees.</p>
<h2>3. What we don’t review or guarantee</h2>
<p>Listings go live as soon as a publisher submits them — we don’t pre-review or vet listings for ad performance, business outcomes, or the accuracy of what a publisher claims about their own account or content. We can remove listings or suspend accounts after the fact (including in response to reports), but publishing a listing doesn’t mean we’ve certified anything about it.</p>
<p>When publishing a listing, a publisher confirms that they own the account or have explicit authorization to run ads on it, and that the content is original and not subject to any copyright or other dispute. <strong>The publisher is solely responsible for any legal claims — including copyright, trademark, or fraud claims — arising from false, unauthorized, or infringing content in their listing.</strong> We don’t independently verify these confirmations before a listing goes live.</p>
<h2>4. Staying on-platform</h2>
<p>Escrow protection, payment security, and any dispute assistance we offer only cover transactions completed through HereForAds checkout. If you and another user agree to pay or deliver outside the platform, that transaction isn’t protected by us in any way — we strongly recommend keeping the full transaction on HereForAds.</p>
<h2>5. Disputes and refunds</h2>
<p>We don’t arbitrate disagreements about ad content or quality. If a payment itself is disputed (for example, a Stripe chargeback or fraud claim), that’s handled through Stripe’s dispute process. Contact us using the form below if you run into a problem and we’ll help where we can.</p>
<h2>6. Account suspension</h2>
<p>We can suspend or ban accounts that violate these terms, commit fraud, or otherwise abuse the platform. Banned accounts lose access immediately.</p>
<h2>7. Availability</h2>
<p>HereForAds is only available where our payment processor (Stripe) supports payouts — this currently excludes mainland China.</p>
<h2>8. Contact</h2>
<p>Questions about these terms? Use the contact form in the footer of any page.</p>$terms_html$),
('privacy', 'Privacy Policy', $privacy_html$<p><em>Draft — this page describes what we actually collect and how it’s actually used today. It hasn’t been reviewed by a lawyer yet and shouldn’t be treated as final legal terms until it has.</em></p>
<h2>1. What we collect</h2>
<ul>
<li>Account info: email address and password (via Supabase Auth)</li>
<li>Profile info you add: display name, bio, avatar/banner images, website link, content categories</li>
<li>Social account info you add: platform, handle, profile URL, follower counts</li>
<li>Listing content: titles, descriptions, prices, photos</li>
<li>Messages you send other users through the platform, including any images attached</li>
<li>Payment and payout info handled directly by Stripe — we don’t see or store your card number or bank details ourselves</li>
<li>Anything you submit through the contact form (name, email, message)</li>
</ul>
<h2>2. How we use it</h2>
<p>To run the marketplace: showing listings, processing payments and payouts, connecting buyers and publishers, moderating content, and responding to support requests. We don’t sell your personal data.</p>
<h2>3. Who we share it with</h2>
<p>We use Supabase for our database, authentication, and file storage, and Stripe for payments and identity verification. Both process data on our behalf under their own privacy policies. We may also disclose information if legally required to.</p>
<h2>4. Cookies and tracking</h2>
<p>We use a session cookie to keep you signed in (via Supabase Auth). We don’t currently use third-party analytics or advertising trackers on the site.</p>
<h2>5. Your choices</h2>
<p>You can edit or remove most of your profile, listing, and social account info directly from your dashboard. To request a copy or deletion of your account data, use the contact form in the footer.</p>
<h2>6. Contact</h2>
<p>Questions about this policy? Use the contact form in the footer of any page.</p>$privacy_html$);
```

**这次同样没有在真实 Supabase 项目上跑过**(这个开发环境连不上 HereForAds 对应的项目)——上面这段 SQL 需要人工去 Supabase 后台的 SQL Editor 跑一遍,跑完之后 `/admin/pages` 才会列出这两条,`/terms`、`/privacy` 会从写死的默认文案切换成读数据库的内容(内容是一样的,只是变得可编辑了)。`npm run build` + `npx eslint src` 全绿,但没有用真实账号点开过 `/admin/pages/terms` 走一遍"改标题 → 用富文本工具栏加粗/加链接 → 保存 → 刷新 /terms 确认生效"这条关键路径,上线后建议人工测一次。

## 测试反馈修复(2026-09-24):订单邮件、买家邮箱、结账勾选、英文文件按钮

**1. 订单邮件通知**(之前完全没有,付款/取消/交付都不发邮件):`src/lib/email/`,走 Resend HTTP API(跟 Supabase 发验证/登录邮件是同一个 Resend 账号和已验证的 `hereforads.com` 域名)。

| 时机 | 收件人 | 在哪触发 |
|---|---|---|
| 付款成功 | 买家("Order confirmed")+ 卖家("New order",含到手金额) | webhook `checkout.session.completed` |
| 卖家标记交付 | 买家("Delivered",提醒 3 天内确认) | `markDeliveredAction` |
| 24 小时内取消 | 买家(退款说明)+ 卖家 | `cancelWithin24hAction` |

发信失败只记日志,不影响付款/取消流程。**Vercel 环境变量(Production + Preview)要加**:
- `RESEND_API_KEY`:Resend 后台 → API Keys 新建一个(权限 Sending access 即可)。没配的话不发邮件,日志里打 "RESEND_API_KEY not set"。
- `EMAIL_FROM`(可选):默认 `HereForAds <hello@hereforads.com>`,必须是已验证域名下的地址。

**2. 订单存买家邮箱**:`listing_orders.buyer_email`,下单时写入(guest 填的邮箱 / 登录买家的账号邮箱),webhook 再用 Stripe Checkout 的邮箱兜底。`/admin/orders` 的 Buyer contact 列显示邮箱。卖家的 Sales 页仍然看不到买家联系方式。

**3. 结账前两个必勾项**(第 10 条):"I agree to the Terms of Service" 和"要求卖家立即开始、知道交付后失去 14 天取消权、开始后取消按已完成部分付费"。前端 required + 服务端校验,勾选时间写进 `terms_accepted_at` / `immediate_start_consent_at`。**措辞待律师确认**。

**4. 文件上传按钮改成英文**:浏览器原生文件框的文字跟着系统语言走(中文系统显示"选择文件"),换成自己的 `src/components/FileInput.tsx`("Choose file" / "Attach photo")。私信、回复、发布广告、个人资料里的上传都换了。

**5. 结账出错不再整页崩溃**:`buyListingAction` 兜住 Stripe/Supabase 异常,页面提示重试,日志里记具体原因(2026-09-24 线上 `STRIPE_SECRET_KEY` 被误填成 Supabase key,就是靠日志查出来的)。

**要手动执行的 SQL**:

```sql
alter table public.listing_orders
  add column if not exists buyer_email text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists immediate_start_consent_at timestamptz;

-- 补老订单的买家邮箱(从账号邮箱抄)
update public.listing_orders o
set buyer_email = u.email
from auth.users u
where u.id = o.buyer_id and o.buyer_email is null;
```

**邮件进垃圾箱怎么办**(配置,不是代码):
1. Cloudflare DNS 加 DMARC 记录(Resend 只要求 SPF/DKIM,没有 DMARC 时 Gmail/Outlook 更容易判垃圾):类型 TXT,名称 `_dmarc`,值 `v=DMARC1; p=none; rua=mailto:<你的邮箱>`。
2. Resend 后台 → Domains → hereforads.com,确认所有记录(SPF、DKIM、MX/Return-Path)都是 Verified。
3. Supabase → Authentication → Emails 的模板(Confirm signup、Magic link)改成正常的品牌文案,别只有一个链接;Sender name 填 "HereForAds"。
4. 新域名刚开始发信信誉低,前几周进垃圾箱比较常见;测试时把邮件标记"不是垃圾邮件",会逐渐改善。

## 在 Stripe 里区分卖家(2026-09-24)

**为什么 Stripe 后台看不出钱是哪个卖家的**:用的是 separate charges & transfers(第 11a 条做法 A),买家付款时钱全部进平台自己的 Stripe 余额,商户是 HereForAds,付款记录上本来没有卖家信息。钱只有在放款(Transfer)时才会进卖家的 Connect 账户。所以"这笔钱属于谁"的账本在我们自己的数据库(`listing_orders` + `payments`),Stripe 那边靠下面这些标记对上。

**2026-09-24 起每笔新付款在 Stripe 里带上**:
- **Description**:`Seller: <卖家名> · <广告标题> · order <订单号前 8 位>`,Payments 列表里直接能看到。
- **Metadata**(付款详情页右侧):`order_id`、`listing_id`、`listing_title`、`seller_id`、`seller_name`、`seller_stripe_account`、`buyer_email`。Stripe 后台搜索框可以按 metadata 搜,比如 `metadata['seller_id']:"<卖家 id>"` 列出某个卖家的全部付款。
- **transfer_group = 订单 id**:付款和之后给卖家的转账共用一个 group,在付款详情页能看到关联的 Transfer。
- 放款的 Transfer 带 `order_id`/`seller_id` metadata 和 "Payout for order …" 描述;24 小时取消的退款带 `order_id`/`seller_id`。

**2026-09-24 之前的付款**没有这些标记,用 `/admin/orders` 对:每行有 **Payment**(和放款后的 **Payout**)链接直达 Stripe 后台。点卖家名只看这个卖家的订单,顶部汇总"托管中 / 已转给卖家 / 已退给买家"的金额(按订单金额、分币种,最近 200 单)。

## 平台记账:`/admin/finance`(2026-09-24)

Stripe 里平台只有一个余额,卖家的钱和平台的钱混在一起。"每单卖家实收多少、平台 12% 是多少、Stripe 实际扣了多少、平台净赚多少"在 `/admin/finance`(管理后台导航 **Finance**)算清楚:

| 列 | 口径 |
|---|---|
| Buyer paid | 订单金额(订单币种);外币订单下面小字是 Stripe 换成结算币种(GBP)后的实际入账 |
| Service fee | 12%,平台收入 |
| Processing fee | 4% + 固定部分,平台收入(向卖家收的固定费率,不是 Stripe 实际成本) |
| Seller receives | 卖家实收 = 订单金额 − 两项费用;外币订单下面小字是转给卖家的 GBP(已放款是实际转账金额,未放款按付款汇率估算) |
| Stripe fee (actual) | Stripe 对这笔付款实际扣的手续费(结算币种,从 balance transaction 读) |
| Platform net | 平台这单净赚 = 实际入账 − 给卖家的 − Stripe 实际手续费;**取消退款的订单 = −Stripe 手续费**(退款时 Stripe 不退原手续费) |

顶部汇总(结算币种):买家付款总额、欠卖家的(托管中)、已转给卖家、已退给买家、平台费用收入、Stripe 手续费、平台净收入。点卖家名只看这个卖家。

例:£30 订单 → Service fee £3.60、Processing fee £1.40、卖家实收 £25.00、Stripe 实扣 £1.15、平台净赚 £3.85。$100 订单(Stripe 换成 £75.64 入账、实扣 £4.09)→ 卖家实收 $83.80(≈ £63.39)、平台净赚约 £8.16。

**数据来源**:付款成功时 webhook 从 Stripe 读这笔付款的 balance transaction,存进 `payments.settlement_currency / settlement_amount / stripe_actual_fee`;放款时存实际转账 `transfer_amount / transfer_currency`。老订单打开财务页时自动从 Stripe 补(每次最多 25 笔,多的刷新再补)。

**要手动执行的 SQL(必须在合并部署前执行,否则放款时写 payments 会失败)**:

```sql
alter table public.payments
  add column if not exists settlement_currency text,
  add column if not exists settlement_amount numeric,
  add column if not exists stripe_actual_fee numeric,
  add column if not exists transfer_amount numeric,
  add column if not exists transfer_currency text;
```
## 给卖家打款:每周一次(2026-09-24)

Stripe Connect 给卖家打款到银行的成本(英国价目,以 Stripe 官网 Connect 定价页为准):**每次打款 0.25% + £0.10**,外加**当月有打款的卖家账户 £2/月**。Etsy 能一个月打 £0.80 是因为它用自己的支付系统、成本自担,我们用 Stripe 做不到。

**决定**:新开户的卖家 Stripe 账户打款计划设成**每周一次(周一)**,一周内放款的钱合并成一笔打到卖家银行(`src/app/dashboard/stripe-connect/actions.ts` 建号时写 `settings.payouts.schedule`)。**已经开户的卖家**不会自动改,要在 Stripe 后台 → Connect → 选中账户 → Payouts 手动改成 Weekly(目前都是测试账户,可以不管)。另外建议在 Stripe 后台 → Connect → Settings 里**关掉 Express 账户自己改打款计划 / Instant Payouts**,不然卖家可以自己改回每天打款。

以后小额订单多了再考虑"满 £20 才打款"(要改成平台手动控制打款,工作量大),最低价暂定约 USD 1。

## 日历按天预订(2026-09-24 决策记录,**待实现**,下一个对话做)

**为什么要做**:发布广告时已经能选 Per day / Per week / Per month 计价,但买家下单时既不能选天数也不能选日期,付的永远只是一个单位的价格(`listing_orders.start_date` / `end_date` 两列一直没用上)。按时间展示的广告(网站横幅、置顶帖、主页 bio 链接、头图)同一时段只能卖给一个买家,需要日历。

**规则(产品负责人确认)**:

1. **卖家可选开启**:只有计价单位是按天/周/月的广告,发布时才出现开关 "Let buyers pick dates",并设**最少预订天数**。一次性交付的广告(拍视频、发测评)不开日历,照现在按次卖。
2. **买家选开始日期 + 天数**,价格 = 单价 × 天数(例:$2/天 × 10 天 = $20,30 天 = $60);已被预订的日期不可选,不允许两个订单的日期重叠。费用照第 2 条按订单总额算。
3. **放款分两次**:预订期**过半时放卖家应得金额的 40%**,**预订期结束 3 天后放剩余 60%**。
4. **中途被撤下**:由**买家发起退款**,按**没展示的天数**比例退款(沿用第 6 条"按没展示的天数比例退"的做法;已经放出的 40% 不够扣时,按第 6 条的强制扣回规则处理)。
5. **24 小时免费取消的例外**:如果预订的**开始日期在 24 小时之内**,**不支持免费取消**(第 4 条的 24 小时免费取消只适用于开始日期在 24 小时以后的预订)。

**实现时再确认的细节**(写代码前问产品负责人):
- 40% 那次放款前,是否要求卖家先提交"已上线"的链接/截图(建议要求,跟第 3a/5 条"先交付再放款"一致)。
- 最少预订天数的默认值和上限(建议默认 7 天,上限 90 天,跟第 4a 条交付天数上限 60 天的考虑一致)。
- 买家能不能在期中提前确认、让剩余 60% 提前放款。

## 部署(Vercel)

- Environment Variables 里配 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`(类型选 Secret 或 Config 都行,`NEXT_PUBLIC_` 前缀的值反正都会被打进浏览器端代码,选哪个纯粹是 Vercel 后台能不能再看到明文的区别,不影响功能),再加支付相关的 `SUPABASE_SERVICE_ROLE_KEY`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`NEXT_PUBLIC_SITE_URL`(生产环境填 `https://hereforads.com`)——**前三个必须选 Secret**,不能带 `NEXT_PUBLIC_` 前缀
- `next.config.ts` 里把 Server Actions 的请求体上限从默认 1MB 调到了 10MB(`experimental.serverActions.bodySizeLimit`),不然发布广告位带图片会报 `Body exceeded 1 MB limit` 的 500 错误
- **`main` 才是 hereforads.com 实际部署的分支**(有 `public/logo.png` 品牌 logo 为证)。仓库另外还有一条 `claude/admiring-goldberg-8x70p7`,历史上曾各自独立合并过好几个 PR、跟 `main` 分叉了十几个提交,**没有连着线上环境**,不要在那条分支上开发——之前有 session 误在那条分支上开发、PR 也顺利合并了,但改动从未真正上线,排查了很久才发现。这条笔记之前写反过(说 admiring-goldberg 才是生产分支),已更正。

## 已知欠缺 / 下一步 TODO

**老流程(`ad_spaces`/`orders` 日历预订)已经整体下线,不再是活跃的 TODO**——2026-09-17 已经把对应的页面、组件、`enums.ts`/`types.ts` 里的类型都删了,详见上面"页面一览"和 WORKLOG 同日期条目。老流程原来遗留的几条 TODO(支付抽成/退款、卖家收款前置校验、`campaigns` 表、图片管理、跨月日历展示)如果以后要在 MVP v2 上重新做,当参考,不再是要修的 bug。

下面是当前唯一在跑的 MVP v2(`listings`/`listing_orders`)已知欠缺:

- **SQL 迁移还没在真实 Supabase 项目跑过**:这个开发环境连不上 `myadsspace` 项目(也连不上任何跟 HereForAds 对应的项目),README 里的 SQL 是写好等人工去 Supabase 后台执行的,没有被验证过
- **没配自动放款的定时触发器**:`/api/cron/auto-confirm` 端点写了,处理资金冻结期(`ESCROW_HOLD_DAYS`,3 天)到期后的自动放款,但没有实际的 Vercel Cron / Supabase pg_cron 去调用它
- **退款/纠纷仍是人工**:规则已在 2026-09-23 定下(见"费用、取消与退款规则"一节),代码还没实现,在实现之前出问题仍需要人工去 Stripe 后台处理
- **没做自动翻译**、**没做可嵌入组件**、**没做中国卖家收款通道**:都是产品方案里明确列的"预留但 MVP 不做"
- **占用式(daily/weekly/monthly)listing 还没有真正的档期日历**:`pricing_unit` 已经支持这几个值,`listings/[id]` 页对 `daily` 会显示"距离今日档期刷新"倒计时(`DailyCountdown` 组件),但还没有像老流程那样"选日期、按档期占用、冲突检测"的日历 UI——`getBlockingRanges`/`isRangeFree` 这套逻辑在删除前的 commit 里可以直接抄
- **`/dashboard/my-listings` 仍然没有真正的"编辑"入口**,2026-09-18 后期加了一个 "Duplicate" 链接(跳到 `/dashboard/new-listing?from={listingId}`,用另一条 listing 的内容预填发布表单、提交后插入全新一行,不改动原来那条),能部分绕开这个缺口——包括帮老 listing(`social_account_id`/`is_website_placement` 还是空的那些)补上投放平台:复制一遍、在预填表单里选好平台再发布。**但复制出来的是并列的新 listing,不是"修好"了原来那条**,原来那条(卡片仍会显示"未指定平台")没有下架/删除入口,只能联系管理员在 `/admin/listings` 处理,不是卖家自己能操作的;卖家要改 listing 已有字段(标题、价格、封面图等)也仍然没有就地编辑的入口,只能用 Duplicate 曲线救国(发一条新的、把旧的晾着)
- **`/dashboard` 总览页统计比较粗糙**:"近 30 天成交额"是按 `paid_at` 落在 30 天内的订单金额原样相加(没扣手续费/佣金,多币种是分开显示不是换算合计),没有做历史趋势图
- **没有邮件通知**:新私信、新订单只能靠登录后看账号头像/侧边栏的红点提示,没有发邮件提醒——用户已经明确说这个先不做,等要做的时候需要去注册 [Resend](https://resend.com)(或类似邮件服务)拿 API key
- **OG 分享图直接用的是 `logo.png`**:那张图是 968×157 的窄长 wordmark,不是标准 OG 图推荐的 1200×630 比例,分享到社交媒体/群聊时缩略图会比较小或者留白——以后如果要做得更好看,可以像 `src/app/icon.tsx` 那样用 `next/og` 的 `ImageResponse` 单独生成一张标准比例的分享卡片(`src/app/opengraph-image.tsx`),这次先用现成的 logo 顶上,没有另外做设计

下面这几条是 2026-09-18/19 这批(Publishers 改名、footer/Terms/Privacy/Contact、`/publishers/join`、`profiles.username` 好记链接、admin Contact 统计卡片,详见 WORKLOG 同期条目和文末"今天的工作小结")留下的、还没处理的事:

- **`/publishers` 现在还是空的,没有真实卖家**——这是接下来最要紧的事,不是代码问题:需要拿着 `/publishers/join` 这个链接去外联真实创作者一个个邀请,不做"空卡片等人 claim"(见 2026-09-18 WORKLOG 的讨论和结论)
- **`/terms`、`/privacy` 还没给律师看过**,两个页面顶部有黄色提示条——正式对外宣传/大规模获客之前应该找人审一遍,尤其是托管放款/佣金那几条涉及钱的表述
- **设置用户名(`/dashboard/profile` 的 "Public profile link" 字段)这条路径只验证过直接在 Supabase 后台改 SQL,没有真人从头点过表单**——建议找一个真实账号走一遍,包括故意跟别人重名一次,确认唯一性冲突的报错提示正常
- **联系表单没有已读/回复状态**:`/admin/contact` 是纯列表,看过的消息没有"已读"标记,回复也只能手动点邮箱地址发邮件,量一大容易漏,以后可以考虑加 `status`/`read_at` 字段
- **没有机制提醒老用户"你还没设置好记链接"**:`username` 是新加的可选字段,已经注册的卖家默认都是空的,除非自己想起来去设置。以后可以在 `/dashboard/profile` 或 dashboard 首页给没设置的卖家一句提示

以下是更早之前已经解决、不用再查的老问题(留个记录):
- ~~Stripe webhook 没配~~——见本文件顶部"已解决"一节
- ~~没做真实的 Stripe 测试~~——已用 Stripe 测试卡跑通完整 Checkout → webhook → `paid_in_escrow` 链路
- ~~新旧两套流程并存,没有下线决定~~——已下线老流程
