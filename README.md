# myadsspace

把个人实体空间（墙面、橱窗等)当广告位出租的小市场。卖家发布空间,买家在日历上选日期预订。参考风格: [thewall.ink](https://thewall.ink)——简洁、大字号、卡片式。

技术栈: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Auth / Postgres / Storage)。

> **复制成新站点**:品牌和业务参数在 `src/config/site.ts`,数据库结构在 `supabase/migrations/`,上线步骤见 [`docs/NEW_SITE_CHECKLIST.md`](./docs/NEW_SITE_CHECKLIST.md)(背景见下文"模板化整理"一节)。

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

## 日历按天预订(2026-09-24 决策记录,**分批实现中**,进度见本节"实现进度")

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

**上面 3 个细节 + 实现中发现的漏洞,2026-09-24 产品负责人确认的答案**(实现以这里为准):

1. **40% 放款前必须先交"已上线"链接/截图**:卖家从开始日期当天(英国时间)起可以提交;不提交就一直不放。提交后照旧有 3 天买家确认期,所以 40% 在"预订期过半"和"提交满 3 天"两者**较晚**的那个时间点放。
2. **最少预订天数**:按天计价的广告默认 7 天,卖家可设 1–90 天;**单次预订最多 90 天**(按周最多 12 周,按月最多 3 个月)。
3. **买家不能提前确认放款**(MVP 先做最简单的):剩余 60% 固定在预订期结束 3 天后自动放。
4. **按周/按月计价**:卖家填的周价/月价就是套餐价(不要求等于日价 × 7/30)。按周的广告买家按整周订,价格 = 周价 × 周数;按月的按 30 天一段订,价格 = 月价 × 段数。按周/按月没有"最少预订天数"设置,最少 1 周/1 个月。
5. **时区统一用英国时间(Europe/London)**,页面注明 "Dates are in UK time"。(按卖家当地时区要处理一国多时区、买卖双方日期对不上,MVP 不做。)
6. **开始日期最远在今天之后 60 天**(Stripe 只能在付款后 180 天内退款,60 + 90 天留出纠纷余量)。
7. **24 小时免费取消的例外在取消那一刻判断**:必须同时满足"付款后不到 24 小时"和"此刻离开始日期(英国时间 00:00)还有 24 小时以上"。例:付款后 10 小时、离开始只剩 20 小时 → 不能免费取消。
8. **中途被撤下的按比例退款(第 4 条)放到"费用、取消与退款"第 6 条那一批一起做**(依赖 3 天恢复期、Cancellation fee 那套流程)。验算过:撤下发生在过半之前,40% 还没放;发生在过半之后,要退的比例不到 50%,还压着的 60% 够扣,所以日历订单实际用不到"强制扣回"。

### 实现进度

#### 第 1 批(2026-09-24 已写代码,**SQL 要先手动执行,再合并部署**):发布开关 + 选日期下单 + 防重叠 + 24 小时例外

**代码改了什么**

- `src/lib/booking.ts`:日历相关的常量和纯函数(英国时间的"今天"、日期加减、结束日期、重叠判断、某天英国时间 00:00 对应的时刻),服务端和日历组件共用。
- **发布/编辑表单**(`ListingForm`):计价单位选了按天/周/月才出现 "Let buyers pick dates" 开关;按天计价再出现"最少预订天数"(默认 7,1–90)。一次性交付的广告就算提交了开关,服务端也不存。
- **详情页日历**(`BookingPicker`,放在购买按钮上方):选开始日期 + 时长(天数/周数/月数下拉),显示结束日期和总价;已被预订的日期划掉,会跟已有预订重叠的开始日期点不了;没选日期不能付款。未登录买家去登录/注册时,选好的日期带在回跳地址里。开了日历的按天广告不再显示"每日档期刷新"倒计时。
- **下单**(`buyListingAction`):服务端按 listing 设置重新校验开始日期(不早于今天、不晚于 60 天后)和时长,总价 = 单价 × 数量(按最小货币单位整数算);Stripe Checkout 用 `quantity` 表示数量,商品描述写上日期。日历订单通过数据库函数 `create_booking_order` 插入:先锁住这条 listing,再检查日期有没有跟**已付款没取消**或**还在付款占用期内**的订单重叠,重叠就不插入(两个买家同时抢同一段日期,只有一个能下单)。
- **未付款的占用**:日历订单的 Stripe 付款链接 31 分钟后失效(`expires_at`,Stripe 最少 30 分钟),日期占用 36 分钟(`hold_expires_at`),比链接多几分钟,保证链接失效前日期不会被别人订走;过期后没付款的订单不再占用日期。
- **24 小时免费取消**:`freeCancelDeadline` 对日历订单取"付款后 24 小时"和"开始前 24 小时"里较早的那个;`cancelWithin24hAction` 服务端再判断一次,开始日期在 24 小时内返回 "Bookings starting within 24 hours can't be cancelled for free."。
- **Sales/Purchases 页、订单邮件**显示预订日期;卖家在开始日期之前看到的是"开始当天再提交上线链接"的提示,当天起才出现提交表单(服务端也挡)。
- **放款的过渡处理(第 2 批会改)**:分两次放款(40% / 60%)还没写。这一批里日历订单**整笔压到预订期结束 3 天后**才由 cron 放款,买家的 "Confirm receipt" 对日历订单不显示、服务端也拒绝——不会出现提前放款。

**要手动执行的 SQL**(Supabase SQL Editor,**先执行再部署代码**,否则发布/编辑广告会因为缺列报错):

```sql
-- 1. listings:日历开关和最少预订天数
alter table public.listings
  add column if not exists booking_enabled boolean not null default false,
  add column if not exists min_booking_days integer;

alter table public.listings
  drop constraint if exists listings_booking_check,
  add constraint listings_booking_check check (
    (not booking_enabled or pricing_unit <> 'one_time')
    and (min_booking_days is null or min_booking_days between 1 and 90)
  );

-- 2. listing_orders:预订数量、未付款占用到期时间(start_date/end_date 两列早就有,一直没用)
alter table public.listing_orders
  add column if not exists booking_units integer,
  add column if not exists hold_expires_at timestamptz;

alter table public.listing_orders
  drop constraint if exists listing_orders_booking_dates_check,
  add constraint listing_orders_booking_dates_check check (
    (start_date is null) = (end_date is null)
    and (end_date is null or end_date >= start_date)
    and (booking_units is null or booking_units > 0)
  );

create index if not exists listing_orders_listing_dates_idx
  on public.listing_orders (listing_id, end_date)
  where start_date is not null;

-- 3. 下单防重叠:锁住 listing 行,检查日期没被占用,再插入订单;被占用返回 null。
--    只给 service_role 用(下单的 server action),买家/卖家不能直接调用。
create or replace function public.create_booking_order(p_order jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_listing_id uuid := (p_order->>'listing_id')::uuid;
  v_start date := (p_order->>'start_date')::date;
  v_end date := (p_order->>'end_date')::date;
  v_id uuid;
begin
  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'create_booking_order: invalid dates';
  end if;

  -- 同一条 listing 的下单排队执行,直到这个事务结束。
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
    start_date, end_date, booking_units, hold_expires_at
  ) values (
    v_listing_id,
    (p_order->>'buyer_id')::uuid,
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
    (p_order->>'hold_expires_at')::timestamptz
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_booking_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_booking_order(jsonb) to service_role;
```

执行完可以核对一下,`authenticated`/`anon` 不应该有执行权限(下面这句应该返回 `false, false, true`):

```sql
select has_function_privilege('anon', 'public.create_booking_order(jsonb)', 'execute'),
       has_function_privilege('authenticated', 'public.create_booking_order(jsonb)', 'execute'),
       has_function_privilege('service_role', 'public.create_booking_order(jsonb)', 'execute');
```

**用测试卡手动走一遍**(执行完 SQL、部署到预览环境之后)

1. 发布一条 GBP 2 / Per day 的广告,打开 "Let buyers pick dates",最少 3 天。改成 One-time 时开关应该消失。
2. 另一个账号打开这条广告:日历上今天之前、60 天以后的日期点不了;选 10 天 → 总价 20.00 GBP;付款页显示 2.00 × 10 和日期。
3. 付款后再打开这条广告:这 10 天被划掉;选一个会跟它重叠的开始日期点不了。
4. 两个浏览器同时选同一段日期点付款:只有一个能进 Stripe 付款页,另一个提示 "Some of those dates were just booked"。
5. 进了付款页但不付款:36 分钟后这段日期重新可选。
6. 订一段**明天**开始的日期付款 → Purchases 页没有 "Cancel order" 按钮;订一段 3 天后开始的 → 有。
7. 卖家 Sales 页:开始日期之前看到 "Put the ad live on … and submit the live link here from that day",当天起才能提交链接;提交后买家那边没有 "Confirm receipt"。
8. 按周计价的广告:时长下拉是 1–12 weeks,价格 = 周价 × 周数。

#### 第 2 批(待做):分两次放款(过半 40%、结束 3 天后 60%)

#### 以后(跟"费用、取消与退款"第 6 条一起做):中途被撤下,按没展示的天数比例退款

## 链接自动补 https://(2026-09-24)

卖家交付时填 `youtube.com/shorts/…` 或 `www.youtube.com/…` 会被浏览器自带的网址校验拒绝,必须写完整的 `https://…` 才行。现在交付链接、社交账号链接、个人网站三处都改成普通文本框,由服务端 `src/lib/url.ts` 的 `normalizeWebUrl` 自动补 `https://` 再校验:只接受 http/https 链接,域名里必须有点。这也补上了一个漏洞:之前交付链接服务端只检查"非空",绕过前端可以存进 `javascript:` 之类的链接。

目前交付方式只有链接一种;第 3a 条的初稿图片、日历订单的"上线截图"以后再加上传。

## 卖家修改交付链接(2026-09-24)

卖家标记交付后可能填错链接,或者需要先改好再正式发布,所以交付后可以改链接。产品负责人确认的规则:

1. **放款之前都能改**:订单还在 `delivered`(已交付、等买家确认)时,Sales 页交付链接下面有 "Change link";钱放给卖家之后锁定,不能再改。
2. **每次修改,买家的 3 天确认期从修改那一刻重新计**(跟第 5 条"改好重新提交后确认期重新计 3 天"一致,防止卖家在确认期快结束时换链接),并邮件通知买家新链接。日历订单按预订期放款,改链接不影响放款时间。
3. **保留修改记录**:旧链接和修改时间记进 `listing_order_proof_changes`,买卖双方的订单页都能展开看到 "Link changed N times";管理员在 Supabase 里查这张表。

实现:`updateProofUrlAction`(`src/app/dashboard/sales/actions.ts`)校验后调用数据库函数 `update_order_proof_url`,改链接、重置 `delivered_at`、写修改记录在一个事务里完成(会锁住订单行,跟买家确认、cron 自动放款不会撞车)。cron 自动放款时也会再核对一次 `delivered_at`,查询之后刚好被改过链接的订单不会被提前放款。

**要手动执行的 SQL**(Supabase SQL Editor,**先执行再合并部署**):

```sql
-- 1. 交付链接修改记录
create table if not exists public.listing_order_proof_changes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.listing_orders(id) on delete cascade,
  old_proof_url text,
  new_proof_url text not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists listing_order_proof_changes_order_idx
  on public.listing_order_proof_changes (order_id, changed_at);

alter table public.listing_order_proof_changes enable row level security;

drop policy if exists "buyers and sellers can view proof changes of their orders"
  on public.listing_order_proof_changes;
create policy "buyers and sellers can view proof changes of their orders"
on public.listing_order_proof_changes for select
to authenticated
using (
  exists (
    select 1 from public.listing_orders o
    where o.id = order_id
      and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  )
);

-- 只能由下面的函数(service_role)写入。
revoke insert, update, delete, truncate, references, trigger
  on public.listing_order_proof_changes from authenticated, anon;

-- 2. 改链接 + 重置确认期 + 写记录,一个事务完成;订单不是这个卖家的、或者已经不在
--    delivered(已放款/已取消)时返回 false。
create or replace function public.update_order_proof_url(
  p_order_id uuid,
  p_seller_id uuid,
  p_new_url text
)
returns boolean
language plpgsql
set search_path = public
as $$
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
$$;

revoke all on function public.update_order_proof_url(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.update_order_proof_url(uuid, uuid, text) to service_role;
```

**手动测一遍**:下单 → 卖家标记交付 → Sales 页点 "Change link" 填新链接(不带 https:// 也行)→ 页面提示已更新、买家收到邮件;买卖双方订单页都能展开看到旧链接;买家 "Confirm receipt" 放款后,卖家那边不再出现 "Change link"。

## 订单号与订单查询(2026-09-24)

**为什么要做**:guest 买家测试时发现,确认邮件只写了收到多少钱,没有订单号、卖家和订单详情;邮件里的 "View your order" 打开的是登录页,而 guest 的账号没有密码,下单时那封登录链接大约 1 小时就过期——过期后 guest 就再也进不了自己的订单。

**产品负责人确认的做法**:

1. **订单号连续编号,从 `HFA-000118` 开始**(`listing_orders.order_number`,数据库序列自增,展示时加 `HFA-` 前缀补到 6 位)。已有的测试订单按下单时间补上 118、119……,新订单接着往后编。
2. **查订单要订单号 + 下单邮箱两个都对上**(`/orders/find`)。订单号是连续的,只凭订单号或只凭邮箱都能被人猜/试出来;对不上时统一报同一句,不提示是哪个错。
3. **不单独发 invoice**,确认邮件就是订单凭证。

**代码改了什么**

- **订单只读页 `/orders/<view_token>`**:每张订单一个随机、猜不到的 `view_token`,买家邮件的 "View my order" 按钮指向这里,不用登录就能看:订单号、广告、广告类型、投放平台、卖家、预订日期、金额、付款时间、状态、交付链接(和改过的旧链接)、下一步会怎样。页面不被搜索引擎收录,不发 Referer。取消、确认收货、私信仍然要登录做;页面上有 "Email me a sign-in link",只会发到这张订单的买家邮箱。
- **`/orders/find`**:订单号 + 邮箱,对上了跳到上面的只读页。入口:登录页("Bought as a guest? Find your order")、guest 付款成功页、网站底部 "Find an order"。
- **登录页加 "Email me a sign-in link (no password)"**:给已有账号发免密码登录链接(Supabase magic link,`shouldCreateUser: false`,跳转地址还是 `/auth/confirm`,不用改 Supabase 设置)。不管邮箱有没有注册都显示"已发送",不让人借此探测谁注册过。
- **订单邮件**:标题和正文都带订单号,正文后面加一张订单详情表(订单号、广告、广告类型、投放平台、卖家、预订日期、金额、付款时间);买家邮件按钮都指向订单只读页,卖家邮件带买家名字。
- **订单号显示**:买家 Purchases 页、卖家 Sales 页、管理员订单页(新加 "Order" 列,点开是订单只读页;顶部可以按订单号或买家邮箱搜索)。Stripe 付款的描述以订单号开头、metadata 加 `order_number`,Stripe 后台能按订单号搜。

**要手动执行的 SQL**(Supabase SQL Editor,**先执行再合并部署**,否则下单后读不到订单号、订单页和邮件会出错):

```sql
-- 1. 订单号:序列 + 列,已有订单按下单时间从 118 开始补号
create sequence if not exists public.listing_order_number_seq;

alter table public.listing_orders add column if not exists order_number bigint;

update public.listing_orders o
set order_number = coalesce((select max(order_number) from public.listing_orders), 117) + n.rn
from (
  select id, row_number() over (order by created_at, id) as rn
  from public.listing_orders
  where order_number is null
) n
where o.id = n.id;

-- 下一张订单接着最大的号往后编(表里没有订单时从 118 开始)。
select setval(
  'public.listing_order_number_seq',
  greatest(coalesce((select max(order_number) from public.listing_orders), 117), 117)
);

alter sequence public.listing_order_number_seq owned by public.listing_orders.order_number;
grant usage, select on sequence public.listing_order_number_seq to service_role;

alter table public.listing_orders
  alter column order_number set default nextval('public.listing_order_number_seq'),
  alter column order_number set not null;

create unique index if not exists listing_orders_order_number_key
  on public.listing_orders (order_number);

-- 2. 订单专属只读链接用的随机 token(已有订单每行自动生成一个不同的值)
alter table public.listing_orders
  add column if not exists view_token uuid not null default gen_random_uuid();

create unique index if not exists listing_orders_view_token_key
  on public.listing_orders (view_token);
```

执行完核对一下(应该看到每张订单都有编号,最小的是 118,`view_token` 都不一样):

```sql
select order_number, view_token, created_at from public.listing_orders order by order_number;
```

**上线前想让第一张真实订单正好是 HFA-000118**:先把测试订单清掉(连同 `payments`、`listing_order_proof_changes` 里对应的行,这一步请人工确认后再做),确认 `listing_orders` 已经没有行,再执行:

```sql
select setval('public.listing_order_number_seq', 117);
```

**手动测一遍**(执行完 SQL、部署之后)

1. 用 guest 身份买一单 → 确认邮件标题带 `HFA-000xxx`,正文有订单详情表;点 "View my order" 不用登录就能打开订单页。
2. 订单页点 "Email me a sign-in link" → 收到登录邮件,点开进入 Purchases 页,能看到这张订单和订单号。
3. 退出登录,打开 `/orders/find`:填对订单号 + 邮箱能打开订单页;订单号对、邮箱错(或反过来)都提示找不到。
4. 登录页点 "Email me a sign-in link (no password)",填 guest 的邮箱 → 收到登录邮件。
5. 管理员订单页:有 "Order" 列;搜 `118`、`HFA-000118`、买家邮箱片段都能搜到。
6. Stripe 后台这笔付款的描述以订单号开头。

## Guest 登录与设置密码(2026-09-24)

**问题**(产品负责人测试发现):guest 下单时我们用 `signInWithOtp` 给他的邮箱建号,Supabase 会发一封 "Confirm your email",买家同时收到它和订单确认邮件;这种没确认的账号在订单页点 "Email me a sign-in link" 也只会再收到 "Confirm your email";邮件里的链接打开是 localhost(Supabase 后台 Site URL 没改);而且 guest 从没设过密码,确认了也不知道怎么登录。

**做法**(产品负责人确认):guest 用免密码登录(登录链接 + 6 位验证码),**登录后提醒设密码**,方便以后用密码登录。

**代码改了什么**

- **下单不再发 "Confirm your email"**:`resolveGuestBuyerId`(`src/lib/supabase/guest-checkout.ts`)改用 service_role 的 `auth.admin.createUser({ email, email_confirm: true })` 建号(不设密码、不发邮件)。guest 下单后只收到我们的订单确认邮件。账号标记成已确认不会被冒用:没有密码,要登录只能点发到这个邮箱的链接。
- **登录页**:按钮改成 "Forgot password or bought as a guest? Email me a sign-in link";发完邮件直接显示验证码输入框,填邮件里的 6 位验证码也能登录(电脑下单、手机看邮件的情况);订单页发完登录邮件也有"去登录页填验证码"的链接(`/login?code=1`)。用密码登录失败时提示可以用登录链接。
- **设密码**:Dashboard 新增 "Password" 页(`/dashboard/password`),没密码时显示 "Set a password",有密码时是修改密码。没设过密码的账号(Google/Facebook 登录的除外)在 Dashboard 顶部看到提醒 "Set a password so you can log in faster next time",点 "Not now" 7 天内不再提醒。有没有密码靠数据库函数 `current_user_has_password()` 判断(见下面 SQL)。
- **注册页**:用 guest 下过单的邮箱注册时,不再报看不懂的错,提示"这个邮箱已经有账号(可能是访客下单时建的),用登录链接登录后在 Dashboard → Password 设密码"。
- **`/auth/confirm` 也接受 `code`**:改动之前建的 guest 账号还没确认过邮箱,要登录链接时 Supabase 仍然发 "Confirm sign up"(`{{ .ConfirmationURL }}` 格式,跳回 `/auth/confirm?code=…`),现在点开也能直接登录,之后再要链接就是正常的登录邮件了。

**要手动做的**

1. **Supabase → Authentication → URL Configuration**:Site URL 改成正式域名(比如 `https://hereforads.com`,**不是 localhost**);Redirect URLs 里要有 `https://hereforads.com/auth/callback` 和 `https://hereforads.com/auth/confirm`。Vercel 的 `NEXT_PUBLIC_SITE_URL` 也要是正式域名。
2. **Supabase → Authentication → Emails → "Magic link or OTP" 模板**,正文换成(加了 6 位验证码 `{{ .Token }}`,链接格式不变):

```html
<h2>Your HereForAds sign-in link</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard/purchases">Log in to HereForAds</a></p>
<p>Or enter this code on the login page: <strong>{{ .Token }}</strong></p>
<p>The link and code expire in 1 hour. If you didn't ask for this, you can ignore this email.</p>
```

   "Confirm sign up"、"Invite user"、"Change email address"、"Reset password" 这几个模板**保持 `{{ .ConfirmationURL }}` 不动**(注册确认走 `/auth/callback`,依赖这个格式)。
3. **SQL**(Supabase SQL Editor,先执行再合并;没执行的话只是不显示"设密码"提醒,不会报错):

```sql
-- 当前登录的账号有没有设过密码(只能查自己)。Guest 下单时建的账号没有密码。
create or replace function public.current_user_has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(u.encrypted_password is not null and u.encrypted_password <> '', false)
  from auth.users u
  where u.id = auth.uid();
$$;

revoke all on function public.current_user_has_password() from public, anon;
grant execute on function public.current_user_has_password() to authenticated;
```

**手动测一遍**(改完上面 3 项、部署之后)

1. 用一个**从没用过的邮箱**以 guest 身份下单 → 只收到订单确认邮件,**没有** "Confirm your email"。
2. 订单页点 "Email me a sign-in link" → 收到 "Your HereForAds sign-in link",有链接和 6 位验证码;点链接打开的是正式域名,直接进入 Purchases 页,顶部有"设密码"提醒。
3. 再要一封,在另一个浏览器的登录页填邮箱 + 验证码 → 也能登录。
4. Dashboard → Password 设密码 → 退出,用邮箱 + 密码能登录;提醒不再出现。
5. 用另一个 guest 邮箱去注册页注册 → 提示这个邮箱已有账号、用登录链接。
6. 改动之前建的 guest 账号(比如之前测试用的邮箱):点 "Email me a sign-in link" → 收到的是 "Confirm your email",点开能直接登录;再要一次就是正常的登录邮件。

## 安全核查 · 第 1 批(2026-09-24,切 live 收款前)

切 Stripe live 之前做了一次全站安全核查(报告只发给了产品负责人,没进仓库)。第 1 批修"严重/高"的问题,**SQL 要先手动执行,再合并部署**(代码会读新加的列,没执行 SQL 时订单相关页面会报错)。

### 产品负责人确认的规则

1. **暂停放款(`listing_orders.payout_hold`)**:拒付、在 Stripe 后台退款、卖家被封,都不改订单状态,只给订单加一个"不许动钱"的标记。有标记的订单,买家确认收货、cron 自动放款、重试放款、24 小时免费取消全部跳过;`releaseOrderPayout` 转账前也会再查一次(还会按 Stripe 上这笔付款的实时状态兜底:发现拒付/退款就自动加标记,不转账)。只有管理员能在 **`/admin/holds`(Disputes & holds)** 点 "Remove hold" 解除,解除后按原流程继续(到期的下一次 cron 就放款)。原因取值:`dispute` / `refund` / `seller_banned`;`payout_hold_note` 是管理员内部备注(拒付编号、原因、谁什么时候解除),买卖双方读不到。
2. **拒付**(`charge.dispute.created`):加标记 + 邮件通知管理员。钱已经转给卖家的,同样标记 + 告警,由管理员在 Stripe 后台手动撤回转账(Connect → Transfers → Reverse),MVP 不自动撤回。**拒付赢了只通知,不自动放款**,管理员解除;**输了**订单记成 `cancelled`(`cancel_reason = 'dispute_lost'`),标记保留。
3. **Stripe 后台退款**(`charge.refunded`):钱还没转给卖家的全额退款 → 订单记成 `cancelled`(`cancel_reason = 'manual_refund'`),不会再放款;部分退款、或者已经放款之后才退 → 加标记 + 告警,管理员决定。我们自己的 24 小时免费取消不受影响(它先把订单锁成 `cancelled` 再退款)。
4. **封号**:被封卖家所有托管中的订单(`paid_in_escrow`/`delivered`/`confirmed`)一律加 `seller_banned` 标记,由管理员按情况人工处理;**解封不会自动解除**,逐单处理。被封卖家的广告也不能再下单(`buyListingAction` 拒绝)。
5. **结账只收卡**(Apple Pay / Google Pay 属于卡,照常显示):`payment_method_types: ["card"]`。Bacs、SEPA 这类几天后才到账的付款方式,付款成功时 `payment_status` 还是 `unpaid`,会被当成金额不符卡住,以后专门支持了再开。
6. **老表 `orders`/`ad_spaces`**:收回 anon/authenticated 的全部权限,表和数据保留;webhook 里读写 `orders` 的死代码删了。

### 代码改了什么

- **买家联系方式只有服务端能读**:之前 `listing_orders` 的 select 策略只限行不限列,卖家拿自己的 session 调 REST API 就能读到买家的电话、地址、邮箱、姓名和 `view_token`。改成列级权限(见下面 SQL),用户态查订单改用 `PARTY_ORDER_COLUMNS`(`src/lib/supabase/types.ts`),不再 `select("*")`。**以后给 `listing_orders` 加新列,默认 authenticated 读不到,要买卖双方能看的话记得 `grant select (新列)`。**
- **webhook**(`src/app/api/stripe/webhook/route.ts`):数据库出错返回 500 让 Stripe 重试(以前返回 200,买家付了钱订单可能一直停在待支付);付款处理先写 payments(唯一索引防重复)再用条件更新推进订单,并检查影响行数,重复/并发投递不会插两行 payments、不会发两遍邮件(以前插两行后这单永远放不了款);新增拒付、退款三个事件。
- **24 小时免费取消**(`src/lib/orders/actions.ts`):退款请求报错时,先用同一个 idempotency key 重试,再查 Stripe 有没有已经成功的退款;只有确认没退成才把订单还原,查不清楚就保持取消并通知管理员——不会再出现"钱退了、订单却回到托管、之后又放款"。
- **开放重定向**(`src/lib/safeRedirect.ts`):`next=/\evil.com`、`/\t/evil.com` 以前能跳到站外,现在拒绝反斜杠和控制字符,并用 URL 解析再确认是本站。
- **管理员告警邮件**:`sendAdminAlert`(`src/lib/email/send.ts`),收件人是新环境变量 `ADMIN_ALERT_EMAIL`。
- `/admin/holds` 页面 + 管理后台导航 "Disputes & holds" + 总览页统计卡片;买卖双方的订单卡片、订单只读页显示 "On hold — under review"。

### 要手动做的

1. **Supabase SQL Editor 执行下面的 SQL**(先执行,再合并部署)。
2. **Vercel**(Production + Preview)加环境变量 `ADMIN_ALERT_EMAIL`(收拒付/退款告警的邮箱)。
3. **Stripe 后台 webhook endpoint**(测试 sandbox 和 live 各一个)在原来的 `checkout.session.completed`、`account.updated` 之外,**加勾** `charge.dispute.created`、`charge.dispute.closed`、`charge.refunded`。
4. Stripe 后台 Payment methods 不用改:代码里已经限定只收卡。

### 要手动执行的 SQL

```sql
-- 0. 先检查:同一张订单有没有多行托管付款(以前 webhook 并发时可能插了两行)。
--    有结果的话先别往下执行,把结果发给开发,人工合并掉多余的那行。
select order_id, count(*) from public.payments
where status <> 'amount_mismatch'
group by order_id having count(*) > 1;
```

```sql
-- 1. 暂停放款标记
alter table public.listing_orders
  add column if not exists payout_hold text,
  add column if not exists payout_hold_at timestamptz,
  add column if not exists payout_hold_note text;

alter table public.listing_orders
  drop constraint if exists listing_orders_payout_hold_check,
  add constraint listing_orders_payout_hold_check
    check (payout_hold is null or payout_hold in ('dispute', 'refund', 'seller_banned'));

create index if not exists listing_orders_payout_hold_idx
  on public.listing_orders (payout_hold_at) where payout_hold is not null;

-- 2. 一张订单最多一行托管付款(webhook 重复/并发投递时靠它去重)
create unique index if not exists payments_one_escrow_payment_per_order
  on public.payments (order_id) where status <> 'amount_mismatch';

-- 3. 列级权限。注意 Postgres 的规则:表级权限还在的时候,`revoke update (某列)` 不起作用
--    (README 前面"管理员系统"一节那几条列级 revoke 很可能一直没生效)。所以这里先收回
--    整张表的权限,再按"除了敏感列以外的所有列"逐列授权。列清单按库里实际的列生成,
--    跟 README 记录的表结构对不上也能正确执行。
do $$
declare
  spec record;
  cols text;
begin
  for spec in
    select * from (values
      -- 表, 权限, 不给 authenticated 的列
      ('listing_orders', 'select', array['buyer_email','buyer_phone','buyer_address','buyer_name','view_token','payout_hold_note']),
      ('profiles',       'insert', array['is_banned','stripe_onboarded','stripe_connect_account_id','country']),
      ('profiles',       'update', array['is_banned','stripe_onboarded','stripe_connect_account_id','country']),
      ('listings',       'insert', array['is_featured']),
      ('listings',       'update', array['status','is_featured','rights_attested_at','terms_accepted_at']),
      ('seller_profiles','insert', array['is_verified','stripe_account_id','stripe_charges_enabled','stripe_payouts_enabled']),
      ('seller_profiles','update', array['is_verified','stripe_account_id','stripe_charges_enabled','stripe_payouts_enabled'])
    ) as t(tbl, priv, excluded)
  loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
    where table_schema = 'public' and table_name = spec.tbl
      and column_name <> all (spec.excluded);

    execute format('revoke %s on public.%I from anon, authenticated', spec.priv, spec.tbl);
    execute format('grant %s (%s) on public.%I to authenticated', spec.priv, cols, spec.tbl);
  end loop;
end $$;

-- 4. 老流程的表:不删数据,只收回权限(README"页面一览":2026-09-17 起代码不再读写)
revoke all on public.orders, public.ad_spaces from anon, authenticated;
```

执行完核对(第一句应该**没有结果**:买家联系方式、view_token、管理员备注这几列 authenticated 读不到;第二句只查 INSERT/UPDATE,SELECT/REFERENCES 是正常的读权限,不用管):

```sql
select column_name, privilege_type from information_schema.column_privileges
where table_schema = 'public' and table_name = 'listing_orders' and grantee = 'authenticated'
  and column_name in ('buyer_email','buyer_phone','buyer_address','buyer_name','view_token','payout_hold_note');

select table_name, column_name, privilege_type from information_schema.column_privileges
where table_schema = 'public' and grantee = 'authenticated'
  and table_name in ('profiles', 'listings', 'seller_profiles')
  and column_name in ('is_banned','stripe_onboarded','stripe_connect_account_id','country',
                      'is_featured','status','is_verified')
  and privilege_type in ('INSERT', 'UPDATE')
order by 1, 2, 3;   -- 应该只剩 listings.status 的 INSERT(发布广告时写 'active')
```

### 手动测一遍(执行完 SQL、部署到预览环境之后,用 Stripe 测试卡)

1. 卖家账号登录,浏览器控制台用 Supabase REST 查 `listing_orders?select=buyer_phone` → 报 permission denied;Sales/Purchases 页正常显示。
2. 同样用 REST 把自己的 `seller_profiles.is_verified` 改成 true、把自己广告的 `is_featured` 改成 true → 都被拒。
3. 下单付款,Stripe CLI `stripe events resend <evt_id>` 重发同一个 `checkout.session.completed` → payments 只有一行、邮件只发一次。
4. 用拒付测试卡 `4000 0000 0000 0259` 付款 → 订单出现在 `/admin/holds`(Payment disputed),`ADMIN_ALERT_EMAIL` 收到邮件;卖家交付、买家点 Confirm receipt → 提示 on hold,不放款。
5. `/admin/holds` 点 Remove hold → 订单回到正常流程。
6. 另下一单,在 Stripe 后台全额退款 → 订单变 "Cancelled — refunded",出现在 `/admin/holds` 的 "Refunded in Stripe" 列表。
7. 管理员封一个有托管中订单的卖家 → 这些订单都出现在 `/admin/holds`(Seller account suspended);他的广告点 Buy now 提示不可购买。
8. `/login?next=/%5Cexample.com` 登录后停在 `/listings`,不会跳到 example.com。

## 安全核查 · 第 1 批上线后的验证结果 + 第 2、3 批交接(2026-09-25)

**给接手的 session**:这一节是切 Stripe live 前安全核查的交接文档。第 1 批(PR #50)已合并、SQL 已执行、测试卡验证通过;**第 2 批已上线并验证通过(2026-09-25,PR #52–#57,见"安全核查 · 第 2 批"和"第 2 批测试反馈");Supabase CAPTCHA 已开启;第 3 批已上线并验证通过(2026-09-25,PR #59/#60,见"安全核查 · 第 3 批")**,下面的规则都已经跟产品负责人确认过,按这里实现即可。工作方式(产品负责人定的,不要改):每批一个 PR;提交前跑 `npm run lint`、`npm run build`、`npm audit`;需要的 SQL 写进 README、由产品负责人手动执行(Supabase MCP 连不上 HereForAds 的项目,只能给他 SQL 让他跑、把结果截图回来);密钥不进代码;拿不准的或会改产品规则的先问;推送 + 开 PR 后停下等确认。

### 第 1 批上线后已经验证过的(2026-09-25,Stripe 测试 sandbox)

- 列级权限 SQL 已执行并核对:authenticated 读不到 `listing_orders` 的 `buyer_email/buyer_phone/buyer_address/buyer_name/view_token/payout_hold_note`;`profiles`/`listings`/`seller_profiles` 的敏感列只剩 `listings.status` 的 INSERT。
- 拒付:`4000 0000 0000 0259` 付款 → 订单自动进 `/admin/holds`(Payment disputed),买家页显示 On hold;在 Stripe 点 Accept dispute → 订单变成已取消(dispute lost)。暂停中的订单没有放款(Stripe 里只有 chargeback,没有对应 transfer)。
- 放款金额正确:USD 100 订单转给卖家 US$83.75(100 − 12 − 4%·100 − 0.25),GBP 30 订单转 £25.00。
- **多币种**:产品负责人已在 Stripe 平台账户的 Balance 里开了 USD、EUR、GBP 三个币种余额。美元付款直接进美元余额,不再换成英镑;转给卖家也用美元。
- **Adaptive Pricing(买家可选用本国货币付款)可以保留**:买家选英镑付 £78.46,Stripe 记的仍是 US$100 进美元余额,webhook 金额核对通过,放款仍是 US$83.75。换汇费(4%)由买家承担。**代码不需要为它改**(session 回传的 currency/amount_total 是原标价币种)。
- **卖家那边的换汇**:美元转给只有英镑银行账户的卖家,钱一进卖家 Stripe 账户就被换成英镑,换汇费(约 2%)由卖家承担,平台转出的是足额美元。卖家账户已开 "Debit negative balances"。
- 平台提现是手动的;提现时只提 `/admin/finance` 里的平台收入部分(托管中的是欠卖家的钱)。

### 第 2 批:限流 + Cloudflare Turnstile(产品负责人已同意方案)

**问题**:公开入口没有应用层限流。Supabase Auth 的限流按 IP 算,而我们所有 Auth 请求都从 Vercel 服务器发出,等于全站共用一个额度——攻击者刷"发登录链接"就能让所有用户收不到邮件;知道某人邮箱可以枚举 `/orders/find`(订单号连续);guest 下单能批量建账号、不付款无限占日历档期(36 分钟一次)。

**方案**(已确认):
- **Postgres 自建限流表**(不接 Upstash):一张 `rate_limits` 表 + 一个只给 service_role 执行的函数(原子 upsert 计数,固定时间窗),服务端在 action 里调用。**只存 IP 的 SHA-256 哈希**(加盐,盐放环境变量),不存明文 IP;定期清理旧记录。IP 取 Vercel 的 `x-forwarded-for` 第一个 / `x-real-ip`。
- **限流表查询出错时放行并记日志**(fail-open),Supabase 自己的限流做第二道兜底。
- **额度**(产品负责人同意,上线后看日志再调):

| 入口 | 每个 IP | 每个邮箱 |
|---|---|---|
| 发登录链接(`login/actions.ts` `sendSignInLinkAction`、`orders/[token]/actions.ts`) | 5 次/小时 | ~~3~~ 5 次/小时(2026-09-25 测试后调整) |
| 验证码登录(`login/actions.ts` `verifySignInCodeAction`) | 10 次/15 分钟 | 5 次/15 分钟 |
| 找订单(`orders/find/actions.ts`) | 10 次/小时 | — |
| guest 下单(`listings/[id]/actions.ts` 未登录分支) | 10 次/小时 | 5 次/小时 |
| 联系表单(`lib/contact/actions.ts`,另外要收回 anon 直接 insert `contact_messages` 的权限,改走 service_role) | 5 次/小时 | — |

- 未付款的日历占用:同一买家或同一 IP **同时最多 2 个**。
- **Turnstile**(Cloudflare,Managed 模式):同一个 token 只能验证一次,所以每个入口只选一边校验——
  - **Supabase 校验**(Supabase 后台开 CAPTCHA 后,Auth 接口必须带 `captchaToken`,顺带挡住拿公开 anon key 直调 Auth API):发登录链接、验证码登录、注册、密码登录。代码把前端拿到的 token 作为 `options.captchaToken` 传给 `signInWithOtp`/`verifyOtp`/`signUp`/`signInWithPassword`。
  - **我们服务端校验**(`https://challenges.cloudflare.com/turnstile/v0/siteverify`):guest 下单("Continue as guest")、`/orders/find`、联系表单。
  - 登录用户正常购买、Dashboard 内操作不加。
- **需要产品负责人手动做的(写代码时把具体步骤告诉他)**:Cloudflare → Turnstile 建站点(`hereforads.com`,Managed),Vercel 加 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`(和 IP 哈希盐);**第 2 批部署之后**才在 Supabase → Auth → Bot and Abuse Protection 开 CAPTCHA(选 Turnstile,填同一个 secret),先开会让现有登录全部失效。以后加 CSP 时要放行 `challenges.cloudflare.com`。

### 第 3 批:中/低风险 + 小的产品调整

| # | 问题 | 位置 | 做法(已确认的写明"已确认") |
|---|---|---|---|
| 10 | 日历订单可能被重复预订:付款链接 31 分钟过期、占用 36 分钟,webhook 延迟超过几分钟时第二个买家能订同一段日期 | `api/stripe/webhook/route.ts` 付款分支、`create_booking_order` | webhook 推进日历订单前按同样的锁再查一次重叠,冲突就自动全额退款 + 通知买家和管理员;处理 `checkout.session.expired` 释放占用 |
| 12 | 上传文件不校验类型/大小(能往公开 bucket 传 HTML/SVG 做钓鱼页),扩展名取自文件名 | `new-listing/actions.ts:74`、`my-listings/[id]/edit/actions.ts:65`、`profile/actions.ts:82`、`dashboard/messages/actions.ts:39`、`listings/[id]/actions.ts:354` | 服务端白名单 + 校验文件头,扩展名由类型决定:广告媒体 jpeg/png/webp/gif + mp4/webm/mov,私信/头像/横幅只允许图片;单文件 ≤ 10MB。Storage bucket 设 `allowed_mime_types`/`file_size_limit`(给 SQL 或后台步骤)。**产品负责人问过"交付内容"——交付仍然只收链接,这条跟交付无关** |
| 13 | 没有安全响应头 | `next.config.ts` | HSTS、`X-Frame-Options: DENY`(或 CSP `frame-ancestors 'none'`)、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、`Permissions-Policy`;CSP 先 Report-Only(Next 内联脚本需要 nonce,放行 Stripe/Supabase/Turnstile 域名) |
| 17 | 私信线程页把 URL 参数 `otherUserId` 直接拼进 `.or()`(PostgREST 过滤注入,RLS 兜住了) | `dashboard/messages/[listingId]/[otherUserId]/page.tsx:33` | 校验 UUID 格式 |
| 18 | 私信能发给任意用户、挂在任意 listing 下 | `dashboard/messages/actions.ts:58` | **已确认**:只有注册用户能发;买家只能发给这条广告的卖家;卖家只能回复已经给他发过消息的人。消息要让卖家看出是哪条广告(会话已有 "Re: 广告标题" 链接,检查一下卖家的消息列表是否也清楚) |
| 19 | 密码最短 6 位 | `register/actions.ts:27`、`dashboard/password/actions.ts:26` | **已确认**:至少 8 位,必须同时有数字、大写字母、小写字母;另外让产品负责人在 Supabase → Auth → Password 设同样的规则、开 "Secure password change" |
| 20 | `existing_media` 用 `includes` 校验,能塞外部 URL | `new-listing/actions.ts:69`、`my-listings/[id]/edit/actions.ts:60` | 改成 `startsWith(`${SUPABASE_URL}/storage/v1/object/public/ad-space-photos/${user.id}/`)` |
| 21 | guest 付款成功页 URL 带邮箱(进浏览器历史/日志) | `listings/[id]/actions.ts:290` | 改成带 `session_id`,页面服务端查 Stripe 后只显示打码邮箱 |
| 22 | `service.ts`/`stripe/server.ts` 没有 `import "server-only"` | `lib/supabase/service.ts`、`lib/stripe/server.ts` | 加上(先确认 `server-only` 包在依赖里) |
| 23 | `seller_profiles.website_url`、`social_accounts.url` 能直接用 REST 写成 `javascript:`(React 19 会拦 href,目前不构成 XSS) | 数据库 | 加 check 约束 `url is null or url ~* '^https?://'`(先查有没有不符合的老数据) |
| — | 广告标价币种有 8 种(`enums.ts` 的 `CURRENCIES`),但英国平台只能转账给美国/英国/EEA/加拿大/瑞士;`lib/stripe/countries.ts` 仍有 44 个开户国家,那些地区的卖家放款会失败 | `lib/supabase/enums.ts:41`、`lib/stripe/countries.ts`、`lib/fees.ts` | **建议**只保留 GBP/USD/EUR(+CAD 可选)、开户国家缩到 5 个地区——**产品负责人还没拍板,先问** |
| — | 发布广告时币种默认用卖家收款国家的币种,并提示"建议用你银行账户的币种标价";Payment Management 页把换汇说明写明确(转到卖家 Stripe 时自动换汇、约 2% 由卖家承担) | `ListingForm.tsx`、`dashboard/stripe-connect/page.tsx` | 产品负责人倾向做,实现前再确认一次 |
| — | 订单状态 "Paid out" 容易被误解成已经到卖家银行卡 | `lib/supabase/enums.ts:209-210` | 建议改成 "Released to seller",**先问** |

### 切 live 前产品负责人要手动做的(清单,不是代码)

- **Stripe(live)**:`sk_live_` 只配 Vercel Production(Preview 继续 test key);建 live webhook endpoint,订阅 `checkout.session.completed`、经典 `account.updated`、`charge.dispute.created`、`charge.dispute.closed`、`charge.refunded`,勾 "Listen to events on Connected accounts",`whsec_` 填 `STRIPE_WEBHOOK_SECRET`;平台提现改手动;Balance 开 USD/EUR/GBP(需要对应币种的收款账户,产品负责人倾向 Wise Business 这类 sole trader 可开的多币种账户);Connect 设置关掉 Express 账户的 Instant Payouts 和"卖家自己改打款计划",打开 debit negative balances;Radar 默认规则 + 高风险交易要求 3DS;Branding 和对账单描述填 HEREFORADS;Business 资料(sole trader 信息)按实际填;用一笔小额真实订单走通付款→放款→退款。
- **Supabase**:Site URL = `https://hereforads.com`,Redirect URLs 只留正式域名的 `/auth/callback`、`/auth/confirm`;Auth 限流、CAPTCHA(第 2 批之后)、密码规则(第 3 批);Storage bucket 类型/大小限制。
- **Vercel**:`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`(live)、`SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET`(≥32 位随机)、`RESEND_API_KEY`、`ADMIN_ALERT_EMAIL`、`NEXT_PUBLIC_SITE_URL=https://hereforads.com`,敏感的标 Sensitive;Cron Jobs 里 `/api/cron/auto-confirm` 每小时一次返回 200;开 Deployment Protection。
- **Resend/DNS**:SPF/DKIM/Return-Path 都 Verified;DMARC 先 `p=none` 两周再收紧。
- **会计/律师**:VAT、HMRC 数字平台申报、Terms 措辞(老问题,见"费用、取消与退款规则")。

## 安全核查 · 第 2 批:限流 + Cloudflare Turnstile(2026-09-25)

按上一节"第 2 批"交接实现,规则和额度没有改。**上线顺序很重要,按下面"要手动做的"一步步来**:`NEXT_PUBLIC_TURNSTILE_SITE_KEY` 是构建时写进前端代码的,必须先在 Vercel 配好再部署;Supabase 的 CAPTCHA 必须等部署完才开,先开会让所有登录/注册失败。

### 代码改了什么

- **限流**(`src/lib/security/rateLimit.ts`):server action 里先按访客 IP(Vercel 的 `x-forwarded-for` 第一个 / `x-real-ip`)和邮箱各计一次数,存在新表 `rate_limits`(固定时间窗,数据库函数 `rate_limit_hit` 原子加一,只给 service_role 执行)。表里只存 `HMAC-SHA256(RATE_LIMIT_SALT, IP 或邮箱)`,不存明文。额度就是交接表里那几行;"发登录链接"的额度登录页和订单页共用。限流表出错(包括没执行 SQL、没配盐)一律放行并记日志,Supabase 自己的限流是第二道兜底。旧计数由每小时的 cron(`/api/cron/auto-confirm`)顺带调 `purge_rate_limits()` 清掉一天以前的。
- **Turnstile**:前端组件 `src/components/Turnstile.tsx`(Managed 模式 + `interaction-only`:多数访客看不到任何东西,Cloudflare 觉得可疑时才出现一个勾选框;提交失败后自动换新 token),服务端 `src/lib/security/turnstile.ts`。每个入口只在一边校验:
  - **交给 Supabase 校验**(token 作为 `captchaToken` 传给 Supabase):发登录链接(登录页 + 订单页 "Email me a sign-in link")、注册、密码登录。
  - **我们服务端校验**(siteverify):验证码登录、guest 下单("Continue as guest")、`/orders/find`、联系表单。
  - **跟交接文档不一样的一处**:交接里写"验证码登录由 Supabase 校验",但查了 Supabase Auth 源码,`/verify` 接口(`verifyOtp`)不校验 CAPTCHA,传了也不看。所以验证码登录改成我们自己校验,效果一样。
  - Cloudflare 接口本身不通(网络/5xx/`internal-error`)时放行并记日志;token 缺失、无效、过期、重复使用一律拒绝。没配 `TURNSTILE_SECRET_KEY` 时跳过校验(本地开发用),没配 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 时页面上不显示组件。
- **未付款的日历占用**:同一买家或同一 IP 同时最多 2 个(登录用户也算)。在数据库函数 `create_booking_order` 里检查(所有日历下单在一把全站锁上排队,并发时也数得准),订单新增列 `hold_ip_hash`(下单 IP 的加盐哈希)。第 3 个会提示 "You already have 2 unfinished checkouts for date bookings. Complete one, or try again in about 30 minutes."(未付款占用 36 分钟后自动失效)。
- **联系表单**改用 service_role 写 `contact_messages`,SQL 收回 anon/authenticated 直接 insert 的权限(以前拿公开的 anon key 能用 REST API 无限灌)。
- 登录用户正常购买、Dashboard 内的操作都不加 Turnstile。密码登录、注册没有加应用层限流(交接表里没有),靠 Supabase CAPTCHA + Supabase 自己的限流。

### 要手动做的(按顺序)

**第 1 步 · Cloudflare 建 Turnstile 站点**

1. 登录 Cloudflare → 左侧 **Turnstile**(新版后台在 "Application security → Turnstile")→ **Add widget**。
2. Widget name 填 `HereForAds`;**Hostnames** 加 `hereforads.com`(子域名比如 `www` 自动包含)。
   - Vercel Preview 环境也要能登录的话,再加一个 `vercel.app`(会覆盖所有 `*.vercel.app` 预览地址;site key 本来就是公开的,多加这个的风险只是别人可以在他的 vercel.app 站点上用我们的 key,消耗的是我们的免费额度,可以接受)。不加的话 Preview 上登录/下单会过不了人机校验。
3. **Widget Mode** 选 **Managed**;"Pre-clearance" 选 No。→ Create。
4. 记下 **Site Key**(公开的)和 **Secret Key**(保密)。

**第 2 步 · Vercel 环境变量**(Settings → Environment Variables,Production 和 Preview 都勾)

| 变量 | 值 | 类型 |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 第 1 步的 Site Key | 普通即可(本来就会进前端代码) |
| `TURNSTILE_SECRET_KEY` | 第 1 步的 Secret Key | **Sensitive** |
| `RATE_LIMIT_SALT` | 随机 64 位十六进制:终端跑 `openssl rand -hex 32`,或者 1Password 生成 64 位随机字符串 | **Sensitive** |

`RATE_LIMIT_SALT` 以后换掉只会让限流计数从零开始,不影响别的;但**不要**写进代码或聊天记录。

**第 3 步 · 合并 PR、等 Vercel 部署完成**(环境变量必须在这之前配好,否则要在 Vercel 里 Redeploy 一次)。

**第 4 步 · Supabase SQL Editor 执行下面的 SQL**(部署之后执行即可;先部署也不会出错——没有 SQL 时限流放行、日历占用上限不生效)。可以重复执行。

**第 5 步 · 手动测一遍**(见下面"手动测一遍"第 1–7 条),都正常再做第 6 步。

**第 6 步 · 部署之后才开 Supabase CAPTCHA**

1. Supabase → 项目 → **Authentication** → **Attack Protection**(旧版后台叫 "Bot and Abuse Protection",在 Authentication → Settings 里)。
2. 打开 **Enable Captcha protection**,Provider 选 **Turnstile by Cloudflare**,**Captcha secret** 填第 1 步的 **Secret Key**(跟 Vercel 里 `TURNSTILE_SECRET_KEY` 同一个)→ Save。
3. 马上测"手动测一遍"第 8 条。万一登录全部失败,先把这个开关关掉(立刻恢复),再把现象发给开发。

以后加 CSP(第 3 批第 13 条)时要放行 `https://challenges.cloudflare.com`(script-src 和 frame-src)。

### 要手动执行的 SQL

```sql
-- 1. 限流计数表:固定时间窗,只存 IP/邮箱的加盐哈希。只给 service_role 用。
create table if not exists public.rate_limits (
  bucket text not null,          -- 入口 + 维度,比如 'signin_link:ip'
  key_hash text not null,        -- HMAC-SHA256(IP 或邮箱),盐在 Vercel 环境变量 RATE_LIMIT_SALT
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, key_hash, window_start)
);

alter table public.rate_limits enable row level security;   -- 不建任何策略:anon/authenticated 一行都读写不到
revoke all on public.rate_limits from anon, authenticated;

-- 计一次数并返回"还没超额"。insert ... on conflict 是原子的,并发请求不会少算。
create or replace function public.rate_limit_hit(
  p_bucket text, p_key text, p_limit integer, p_window_seconds integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
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
$$;

-- 清理一天前的计数(每小时的 cron /api/cron/auto-confirm 顺带调用)。
create or replace function public.purge_rate_limits()
returns void
language sql
set search_path = ''
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;
grant execute on function public.purge_rate_limits() to service_role;

-- 2. 联系表单:收回 anon/authenticated 直接 insert 的权限(以前拿公开的 anon key
--    就能用 REST API 无限往里灌),改由服务端限流 + Turnstile 后用 service_role 写。
drop policy if exists "anyone can submit a contact message" on public.contact_messages;
revoke all on public.contact_messages from anon, authenticated;

-- 3. 日历订单:同一买家或同一 IP 同时最多 2 个未付款的占用。
--    hold_ip_hash 是下单 IP 的加盐哈希(跟限流表同一种哈希),不存明文 IP。
--    第 1 批把 listing_orders 的 select 改成了逐列授权,新列默认 authenticated 读不到,不用另外处理。
alter table public.listing_orders
  add column if not exists hold_ip_hash text;

create index if not exists listing_orders_pending_holds_idx
  on public.listing_orders (hold_expires_at)
  where status = 'pending_payment' and hold_expires_at is not null;

-- 在原来的 create_booking_order(README"日历按天预订 → 第 1 批")基础上改了三处:
-- 读 buyer_id / hold_ip_hash、检查未付款占用个数、插入时写 hold_ip_hash。其余不变。
create or replace function public.create_booking_order(p_order jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
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

  -- 未付款占用上限:同一买家/同一 IP 的下单可能落在不同 listing 上,listing 行锁管不到,
  -- 所以所有日历下单先在这把全站锁上排队(每次只锁几毫秒,量很小),数得才准。
  -- 先拿这把锁、再锁 listing,顺序固定,不会死锁。
  perform pg_advisory_xact_lock(hashtext('create_booking_order:pending_holds'));
  if (
    select count(*) from public.listing_orders o
    where o.status = 'pending_payment'
      and o.hold_expires_at > now()
      and (o.buyer_id = v_buyer_id or (v_ip_hash is not null and o.hold_ip_hash = v_ip_hash))
  ) >= 2 then
    raise exception 'too_many_pending_holds';
  end if;

  -- 同一条 listing 的下单排队执行,直到这个事务结束。
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
$$;

revoke all on function public.create_booking_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_booking_order(jsonb) to service_role;
```

执行完核对(应该返回 `false, false, true, false, false, true`):

```sql
select has_function_privilege('anon', 'public.rate_limit_hit(text,text,integer,integer)', 'execute'),
       has_function_privilege('authenticated', 'public.rate_limit_hit(text,text,integer,integer)', 'execute'),
       has_function_privilege('service_role', 'public.rate_limit_hit(text,text,integer,integer)', 'execute'),
       has_table_privilege('anon', 'public.contact_messages', 'insert'),
       has_table_privilege('authenticated', 'public.rate_limits', 'select'),
       has_function_privilege('service_role', 'public.create_booking_order(jsonb)', 'execute');
```

上线后看限流效果(计数最多的几个;`key_hash` 是哈希,看不出是谁):

```sql
select bucket, window_start, hits from public.rate_limits order by hits desc limit 20;
```

### 手动测一遍(部署到正式环境、执行完 SQL 之后)

1. `/contact` 提交一条留言 → `/admin/contact` 能看到。同一台电脑连续提交 6 次,第 6 次提示 "Too many attempts"。
2. `/orders/find` 用真实的订单号 + 邮箱 → 打开订单页;连续错 10 次后第 11 次提示 "Too many attempts"(一小时后恢复)。
3. 登录页 "Email me a sign-in link":每次发送后显示"还能再要几封、几点前";同一个邮箱一小时内第 6 次提示 "Too many attempts — please try again after HH:MM UK time"(2026-09-25 从 3 次调到 5 次);收到的邮件里链接和验证码都能登录(二选一,用过一个另一个就失效)。
4. 验证码登录:故意输错时提示还剩几次;输错 5 次后,第 6 次提示 "Too many attempts"(15 分钟后恢复)。
5. 退出登录,用一个新邮箱 "Continue as guest" 下单 → 正常进 Stripe 付款页。
6. 开了日历的广告:同一个账号进付款页不付款、返回再订另一段日期、再返回订第三段 → 第三次提示 "You already have 2 unfinished checkouts…"。
7. 浏览器控制台执行 `fetch('<SUPABASE_URL>/rest/v1/contact_messages', {method:'POST', headers:{apikey:'<anon key>', 'Content-Type':'application/json'}, body: JSON.stringify({name:'x',email:'x@x.com',message:'x'})}).then(r => r.status)` → 返回 401 或 403(以前是 201)。
8. **开了 Supabase CAPTCHA 之后**:密码登录、注册、发登录链接(登录页和订单页)、验证码登录、Google 登录都还能正常用。

### 第 2 批测试反馈(2026-09-25,产品负责人实测)

**结论:第 2 批全部通过**。阶段 A(SQL + 权限核对)、阶段 B(联系表单、找订单、登录链接/验证码、订单页登录链接、guest 下单、日历未付款占用上限、Cloudflare 统计、密码登录)、阶段 C(开启 Supabase CAPTCHA 后:密码登录、注册、登录链接、验证码、订单页登录链接、Google 登录、guest 下单)都由产品负责人实测正常。

**产品负责人决定不做的**:订单查询加手机号;"忘了订单号 → 把名下订单链接发到邮箱"。理由:用户查自己邮箱里的订单邮件、或登录后在 Purchases 就能找到订单,有问题走联系表单。

- 通过:联系表单限流(第 6 条被拦)、发登录链接 + 验证码登录、订单页发登录链接、guest 下单进 Stripe 付款页、密码登录。第一次测联系表单发了 8 条没被拦,是因为刚好跨了整点(固定时间窗按整点分段,16 点段 4 条、17 点段 4 条),不是 bug。
- 按反馈改了:
  - 发登录链接每个邮箱 3 次/小时 → **5 次/小时**;发送成功后显示"还能再要几封、几点前";所有限流提示都带上"几点以后再试"(英国时间,计数按整点重置)。
  - 验证码输错时显示还剩几次。
  - 页面文案 "6-digit code" 改成 "Code from the email"(Supabase 项目设置的验证码是 8 位)。
  - 登录邮件里的链接和验证码是**同一个一次性凭证**:先填了验证码,再点链接就会失效;再要一封新邮件,旧的也失效。`/auth/confirm` 遇到链接失效时,如果这个浏览器已经登录着就直接进 Purchases,不再显示"链接失效";否则登录页的提示改成说明这个规则。
- Stripe 付款页的 Apple Pay、Link("Onelink")都属于卡类付款,钱照样进平台 Stripe 账户,代码里的 `payment_method_types: ["card"]` 不用改。

## 后台留言提醒 + 登录链接防邮箱扫描(2026-09-25)

**产品负责人确认的规则**:打开 `/admin/contact` 就把当时看到的留言全部算作已读;"今日"按英国时间 0 点算;每收到一条留言立刻发一封邮件。

### 代码改了什么

- **新留言邮件**:联系表单提交成功后给 `ADMIN_ALERT_EMAIL` 发一封 "[HereForAds admin] New contact message from …",正文是留言内容(超过 2000 字截断),按钮指向 `/admin/contact`;邮件的 Reply-To 是留言人邮箱,直接点"回复"就能回他。用 `after()` 发,不拖慢提交。
- **未读**:`contact_messages` 加 `read_at` 列(下面 SQL)。后台顶部导航 "Contact" 上显示未读数红点;打开 `/admin/contact` 后,页面在浏览器里显示出来才把当时看到的留言标成已读(不在服务端渲染时标——链接预取也会渲染页面),这次看到的未读留言带 "New" 标签,导航红点清零。
- **总览页卡片**右上角:Contact messages 显示 "N new"(红),Total users 显示 "+N today"(绿,按 `profiles.created_at` 英国时间当天 0 点起算)。
- **登录邮件链接防邮箱安全扫描**:Hotmail/Outlook 的 Safe Links 等会在用户点开之前先访问邮件里的链接;以前 `/auth/confirm` 一被访问就登录,一次性的链接和验证码就被扫描器用掉,用户再点/再填显示"已过期"。现在 `/auth/confirm` 把 `token_hash` 转到新页面 `/auth/continue`,显示一个 "Log in" 按钮,**点了按钮才真正登录**(POST,扫描器不会点)。Supabase 邮件模板**不用改**。

### 要手动执行的 SQL

```sql
alter table public.contact_messages
  add column if not exists read_at timestamptz;

create index if not exists contact_messages_unread_idx
  on public.contact_messages (created_at) where read_at is null;

-- 可选:上线前已经看过的老留言全部标成已读,红点从 0 开始
update public.contact_messages set read_at = now() where read_at is null;
```

**顺序**:先执行 SQL,再合并部署(代码会读 `read_at`,没有这一列时后台总览页和 Contact 页的未读数会出错)。

### 手动测一遍

1. 无痕窗口在 `/contact` 提交一条留言 → `ADMIN_ALERT_EMAIL` 收到邮件,点"回复"收件人是留言人的邮箱。
2. 管理员账号打开 `/admin` → 顶部 "Contact" 有红色数字 1,Contact messages 卡片右上角 "1 new"。
3. 点进 `/admin/contact` → 那条留言带 "New";顶部红点消失。刷新页面 → "New" 没了。
4. 用新邮箱注册一个账号 → `/admin` 的 Total users 卡片右上角 "+1 today"。
5. 登录页要一封登录邮件,点邮件里的 "Log in to HereForAds" → 先看到一个 "Log in" 按钮的页面,点了才进 Purchases。验证码照常能用。

## 改日期:立刻释放未付款的日历占用(2026-09-25)

**问题**(产品负责人测试 B8):买家进了 Stripe 付款页又想改日期/时长,回到广告页时自己刚才选的日期还被占着(最多 36 分钟),重新选会提示日期冲突。

**做法**:
- **点 Stripe 付款页上的"返回"**:日历订单的 `cancel_url` 改成 `/api/checkout/cancelled?order=…`。这里先让 Stripe 付款链接作废(`checkout.sessions.expire`),再把订单的 `hold_expires_at` 改成现在,日期马上变回可选;然后带着刚才选的开始日期和时长回到广告页(顶部蓝色提示 "Checkout cancelled and those dates are free again"),买家直接改。
- **浏览器后退 / 关掉付款页之后重新下单**:同一买家在同一条广告上再次下单时,先自动释放他之前没付款的占用(同样先作废付款链接),不会被自己挡住。
- **安全**:只有买家本人(登录)或下单时同一个 IP(guest,按 `hold_ip_hash` 比对)能释放;付款链接作废失败、已经付款成功或查不清楚的一律不释放,不会出现"日期放出去了钱又付进来"。订单留在 `pending_payment`,跟自然过期的一样,不改成 cancelled。
- 没付款也没改的,仍然是 36 分钟后自动释放。
- 需要新列 `listing_orders.checkout_session_id`(记下付款链接)。**这个功能上线前建的未付款订单没有这个值,不会被提前释放,等它们自然过期。**

**要手动执行的 SQL**(先执行再合并;没执行时下单照常,只是不能提前释放):

```sql
alter table public.listing_orders
  add column if not exists checkout_session_id text;
```

(第 1 批把 `listing_orders` 的读权限改成了逐列授权,新列 authenticated 默认读不到,不用另外处理。)

**手动测一遍**:
1. 买家账号在一条开了日历的广告上选 3 天 → 进付款页 → 点页面左上角的 "←" 返回 → 回到广告页,顶部有蓝色提示,日历上这 3 天是可选的,刚才的日期和时长已经填好;改成 5 天 → 能再进付款页。
2. 进付款页后用浏览器后退键回来,换一段日期直接下单 → 能进付款页,不提示日期冲突;原来那段日期也变回可选。
3. 在第 1 步作废的旧付款页(如果还开着)点付款 → Stripe 提示链接已失效,付不了。

## 安全核查 · 第 3 批:中/低风险 + 小的产品调整(2026-09-25)

按"第 2、3 批交接"一节的第 3 批表格实现。产品负责人本批的决定:
- **标价币种(8 种)和开户国家(44 个)暂时不缩减**,等有了用户再看。风险仍在:收款国家不在美国/英国/EEA/加拿大/瑞士的卖家,放款那一步会失败(Stripe 报错,订单停在 confirmed,cron 每小时重试并记日志),到时候管理员人工处理。
- **同意**:发布广告时默认用卖家收款国家的币种 + 提示用银行账户币种标价;Payment Management 页写明换汇规则。
- **同意**:订单状态 "Paid out" 改成 "Released to seller"。

### 代码改了什么

| # | 改动 |
|---|---|
| 10 | **付款时再查一次日期冲突**:数据库触发器在日历订单从 `pending_payment` 推进到 `paid_in_escrow` 时锁住广告、查跟其他已付款订单有没有重叠;冲突就报 `booking_conflict`,webhook 把这一单记成 `cancelled`(`cancel_reason = 'booking_conflict'`)、全额退款(幂等)、邮件通知买家和管理员。另外处理 `checkout.session.expired`:付款链接过期立刻释放占用的日期。 |
| 12 | **上传校验**(`src/lib/uploads.ts`):按文件头判断真实类型,广告媒体只收 JPG/PNG/WebP/GIF/MP4/WebM/MOV,头像/横幅/私信图片只收图片;单个文件 ≤ 10MB;扩展名和 Content-Type 由判断出的类型决定,不信文件名。bucket 也设了类型/大小白名单(下面 SQL),挡住绕过网站直接调 Storage 的上传。 |
| 13 | **安全响应头**(`next.config.ts`):HSTS、`X-Frame-Options: DENY`、`nosniff`、`Referrer-Policy`、`Permissions-Policy`;CSP 先 **Report-Only**(只报告不拦截),违规记到 Vercel 日志("CSP violation")。观察一两周没有误伤再改成强制(那时 script-src 要改用 nonce)。 |
| 17 | 私信会话页的 URL 参数先校验是 UUID 再拼进查询。 |
| 18 | **私信规则**:买家只能发给这条广告的卖家;卖家只能回复在这条广告下给他发过消息的人;服务端 + 数据库策略两层检查。收件人只能改 `read_at`,改不了消息内容。卖家的消息列表每个会话都显示广告标题(之前就有)。 |
| 19 | **密码**:至少 8 位,必须同时有数字、大写字母、小写字母(注册、设/改密码两处);表单下方有提示。 |
| 20 | 复制/编辑广告时沿用的旧图片,只认 `{SUPABASE_URL}/storage/v1/object/public/ad-space-photos/{自己的 user id}/` 开头的地址。 |
| 21 | guest 付款成功页的 URL 不再带邮箱,改成带 Stripe 的 `session_id`,页面服务端查 Stripe 后只显示打码邮箱(`kc•••@hotmail.co.uk`)。 |
| 22 | `lib/supabase/service.ts`、`lib/stripe/server.ts` 加了 `import "server-only"`(Next 16 自带,不用装包),万一被前端代码引用,构建直接报错。 |
| 23 | `seller_profiles.website_url`、`social_accounts.url` 数据库约束只能是 http/https(`social_accounts.url` 允许空字符串:只填账号名时存的是 `''`,2026-09-25 执行 SQL 后核对发现,已修正约束)。 |
| — | 发布广告时默认币种 = 卖家收款国家的货币(欧元区 → EUR,英国 → GBP……,不在可选币种里的用 USD),币种下拉框下面提示"用银行账户币种标价,否则 Stripe 换汇约 2%、由你承担";Payment Management 页写明换汇规则。 |
| — | 订单状态 "Paid out" → "Released to seller";Sales 页 "Completed" 标签下的小标题 → "Released to your Stripe account";`/admin/finance` "Paid out to sellers" → "Released to sellers"。 |

### 要手动做的(顺序)

1. **Supabase SQL Editor 执行下面两段 SQL**(先执行再合并,都可以重复执行)。
2. **Supabase → Authentication → Providers → Email**(新版后台在 Authentication → Sign In / Providers → Email):
   - **Minimum password length** 填 `8`;
   - **Password requirements** 选 **"Lowercase, uppercase letters and digits"**;
   - 打开 **Secure password change**(改密码前要求最近登录过)。
   已有用户的旧密码不受影响,下次改密码时才按新规则。
3. **Stripe 后台 webhook endpoint**(测试 sandbox 和 live 各一个)**加勾 `checkout.session.expired`**。
4. 合并 PR、等部署完成,按下面"手动测一遍"测。

### 要手动执行的 SQL

```sql
-- 1. 日历订单付款时再查一次日期重叠(第 10 条):订单从 pending_payment 推进到
--    paid_in_escrow 时锁住这条广告,发现跟别的已付款订单重叠就报错 booking_conflict,
--    webhook 收到这个错误会取消这一单并全额退款。
create or replace function public.guard_booking_payment()
returns trigger
language plpgsql
set search_path = public
as $$
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
$$;

drop trigger if exists listing_orders_booking_payment_guard on public.listing_orders;
create trigger listing_orders_booking_payment_guard
  before update of status on public.listing_orders
  for each row execute function public.guard_booking_payment();

-- 2. 私信规则(第 18 条):买家只能发给这条广告的卖家;卖家只能回复在这条广告下给他
--    发过消息的人。数据库层也挡一次,防止绕过网站直接调 REST API。
drop policy if exists "authenticated users can send messages" on public.listing_messages;
drop policy if exists "send to the listing seller, or reply as the seller" on public.listing_messages;
create policy "send to the listing seller, or reply as the seller"
on public.listing_messages for insert
to authenticated
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

--    收件人只能改 read_at(标记已读),不能改消息内容。
revoke update on public.listing_messages from anon, authenticated;
grant update (read_at) on public.listing_messages to authenticated;

-- 3. 链接只能是 http/https(第 23 条)。not valid:只检查以后写入的数据,老数据不影响执行。
alter table public.seller_profiles
  drop constraint if exists seller_profiles_website_url_http,
  add constraint seller_profiles_website_url_http
    check (website_url is null or website_url ~* '^https?://') not valid;
alter table public.social_accounts
  drop constraint if exists social_accounts_url_http,
  add constraint social_accounts_url_http
    check (url is null or url = '' or url ~* '^https?://') not valid;  -- 只填账号名时 url 存的是空字符串
```

```sql
-- 4. 上传文件(第 12 条):bucket 只收图片/视频,单个文件最大 10MB。已经上传的文件不受影响。
update storage.buckets
set allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm', 'video/quicktime'
    ],
    file_size_limit = 10485760
where id = 'ad-space-photos';
```

> **2026-09-26 更新**:广告视频改成浏览器直传 Storage(10 秒以内、最高 1080p,单个最大 25MB),bucket 单文件上限要调到 25MB,不然 10 秒的 1080p 视频传不上去(图片仍由服务端限制 10MB,且上传前已在浏览器压缩):
>
> ```sql
> update storage.buckets set file_size_limit = 26214400 where id = 'ad-space-photos';
> ```

执行完可以核对(第一句应该返回 `true`;第二句列出不是 http/https 的老链接,有结果的话在后台改掉或发给开发):

```sql
select exists (select 1 from pg_trigger where tgname = 'listing_orders_booking_payment_guard');

select 'seller_profiles' as tbl, user_id::text as id, website_url as url from public.seller_profiles
where website_url is not null and website_url !~* '^https?://'
union all
select 'social_accounts', id::text, url from public.social_accounts
where url is not null and url <> '' and url !~* '^https?://';
```

### 验证结果(2026-09-25,产品负责人实测)

- 第 1–6 项(上传校验、私信、密码规则、guest 成功页、状态名、默认币种)正常;SQL、Supabase 密码规则、Stripe `checkout.session.expired` 都已配置。
- 第 7 项:securityheaders.com 评分 **A**。HSTS、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy 都有;"Content-Security-Policy" 显示缺失是**预期的**——现在发的是 `Content-Security-Policy-Report-Only`(只报告不拦截)。观察一两周 Vercel 日志里的 "CSP violation",没有误伤再改成强制(script-src 换成 nonce)。
- 测试反馈后加了:订单/消息列表的广告小封面图、"View Stripe dashboard" 新标签页打开(PR #60)。

### 手动测一遍

1. **上传**:发布广告时传一个 `.html` 或 `.svg` 文件(改名成 `.jpg` 也一样)→ 提示 "isn't a supported file";传一张正常 JPG、一段 MP4 → 正常;传一个超过 10MB 的文件 → 提示 "larger than 10 MB"。头像上传 MP4 → 提示只能是图片。
2. **私信**:买家在广告页 "Ask the seller" 发消息 → 正常;卖家在 Messages 里回复 → 正常;卖家打开一个不存在的会话地址 `/dashboard/messages/<广告id>/<随便一个用户id>` 发消息 → 提示 "You can only reply to people who have messaged you about this listing"。
3. **密码**:注册时填 `abcdefgh` → 提示规则;填 `Abcdefg1` → 能注册。Dashboard → Password 同样。
4. **guest 付款成功页**:未登录用 guest 下单付款(测试卡)→ 成功页地址是 `...?session_id=cs_test_...`,页面显示打码邮箱。
5. **状态名**:Purchases/Sales 页已放款的订单显示 "Released to seller"。
6. **默认币种**:收款国家是英国的卖家打开 "Publish a listing" → 币种默认 GBP,下面有换汇提示。
7. **响应头**:浏览器 F12 → Network → 点任意页面请求 → Response Headers 里有 `strict-transport-security`、`x-frame-options: DENY`、`content-security-policy-report-only`。之后一周在 Vercel Logs 搜 "CSP violation",有结果截图给开发。
8. **付款时日期冲突**(不好手动造,可以不测):触发器已在本地 Postgres 上测过;真遇到时买家和 `ADMIN_ALERT_EMAIL` 会收到邮件。

## 模板化整理(2026-09-25)

**目标**:以后复制出一个新站点(最可能是"虚拟活动预订")时,不用翻 README 几十段 SQL,也不用满代码找品牌字样。**对现在的 hereforads.com 没有任何功能变化**(见下面"怎么验证的")。
**不做的**(产品负责人确认过):不把"广告/活动/商品"抽象成可切换的多业务系统;不改任何业务规则和页面行为。

**模板版本**:以后复制新站点,从 GitHub Releases 上**安全复查之后**的版本开始(计划中的 `template-v2`,在 main `cf5131e` 或之后);`template-v1` 早于安全修复,不要用。

### 做了什么

1. **数据库迁移文件 `supabase/migrations/`**:6 个文件(类型 → 表/约束/索引/序列 → 函数和触发器 → RLS 策略 → 表/列/函数权限 → storage bucket 和策略),在一个**新建的空** Supabase 项目里按文件名顺序执行,就得到跟线上一样的库。**以 2026-09-25 线上导出的结构为准**,不是 README 里的历史 SQL。
   - ⚠️ **不要在 HereForAds 线上库执行这些迁移**(对象都已经存在,会报错)。以后线上库结构有改动,继续按老办法写 SQL 手动执行,**同时**在 `supabase/migrations/` 加一个新文件(文件名用更晚的时间戳),保证新站点也能跟上。
   - **导出工具 `supabase/scripts/export_schema.sql`**:在 SQL Editor 里运行、Download CSV,就是当前库的完整结构(只读,不导出数据)。以后核对"迁移文件和线上是否一致"、或者核对新站点建得对不对,都用它。
   - **老流程的 5 张表**(`ad_spaces`、`orders`、`campaigns`、`payouts`、`proof_uploads`)和 5 个相关枚举代码早就不用了,**没放进迁移**,结构存档在 `supabase/legacy/`。线上的这些表**没动**(产品负责人决定)。
   - 不需要种子数据:`site_pages` 没有行时 `/terms`、`/privacy` 用代码里的默认文案;第一个管理员按上线清单手动 insert。
2. **站点配置 `src/config/site.ts`**:站名、域名、标语、描述、logo、图标主色和文字、默认发件地址、订单号前缀、存储 bucket 名、费率和固定手续费、最低发布价、托管天数、免费取消时限、日历规则都在这里。代码里原来写死的 "HereForAds"(页面标题/分享卡片、页头 logo、页脚、登录/注册页、订单页、邮件落款和管理员邮件标题、条款默认文案、个人主页链接前缀、找订单页的 "HFA-" 提示)都改成读配置。`fees.ts`、`booking.ts`、`enums.ts` 原来导出的常量名不变,只是数值改成从配置里来。
3. **新站点上线清单 `docs/NEW_SITE_CHECKLIST.md`**:GitHub(新建私有仓库导入,不要 Fork)→ 改代码 → Supabase(建项目、跑迁移、Auth 设置、邮件模板、SMTP、密码规则、Google 登录)→ Stripe(Connect、webhook 事件、Branding)→ Cloudflare(DNS、Turnstile)→ Vercel(环境变量全表、域名、Cron)→ Resend → 第一个管理员 → 测一遍再开 CAPTCHA。

### 导出线上结构时发现、已跟产品负责人确认的两处问题

1. **`social_accounts` 的链接约束没有 `url = ''`**:WORKLOG 记的是"已按修正后的 SQL 重新执行",但线上导出的约束仍然是 `url is null or url ~* '^https?://'`。代码在卖家只填账号名、不填链接时存的是空字符串,所以**现在线上"只填账号名添加/修改社交账号"会报约束错误**。
2. **`get_user_id_by_email` 匿名访客和登录用户都能调**:README"Guest 结账"那段 SQL 只 `revoke ... from public`,但 Supabase 默认单独给了 `anon`/`authenticated` 执行权限,这两条没收回。这个函数是 SECURITY DEFINER、能读 `auth.users`,任何人拿网页里公开的 anon key 就能查"某个邮箱有没有注册、对应哪个用户 ID",再对上公开的卖家主页。代码只在服务端用 service_role 调它,收回后功能不受影响。

迁移文件里这两处都是修正后的写法。**线上要补执行下面的 SQL**(可以重复执行,只改这一个约束和一个函数权限,不碰数据):

```sql
-- 1. 只填账号名的社交账号:允许 url 为空字符串
alter table public.social_accounts
  drop constraint if exists social_accounts_url_http,
  add constraint social_accounts_url_http
    check (url is null or url = '' or url ~* '^https?://') not valid;

-- 2. get_user_id_by_email 只给服务端调
revoke execute on function public.get_user_id_by_email(text) from anon, authenticated;

-- 核对:应该是 url = ''、false、false、true
select
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'social_accounts_url_http') as social_url_rule,
  has_function_privilege('anon', 'public.get_user_id_by_email(text)', 'execute') as anon_can_call,
  has_function_privilege('authenticated', 'public.get_user_id_by_email(text)', 'execute') as logged_in_can_call,
  has_function_privilege('service_role', 'public.get_user_id_by_email(text)', 'execute') as server_can_call;
```

执行后测:① `/dashboard/profile` 只填账号名(不填链接)添加一个社交账号,能保存;② 不登录用一个**已注册过的邮箱**走 guest 下单到 Stripe 付款页(用到这个函数),正常跳转。

**已完成(2026-09-25)**:产品负责人已在线上执行,核对结果正确(`url = ''`、false、false、true),上面两项测试都通过。

### 怎么验证的

- **迁移 = 线上**:本地 Postgres 16 模拟 Supabase 环境(anon/authenticated/service_role 角色、auth/storage schema、Supabase 的默认权限),空库按顺序跑 6 个迁移,再用导出工具导出,跟线上导出逐段逐条对比:类型、序列、表、约束、外键、索引、函数、触发器、RLS、策略、storage 策略、表/列/函数权限、bucket 全部一致,差别只有上面两处修正和老流程的表。另外用 SQL 实测了权限:匿名能看上架广告、看不到联系留言;登录用户能发布广告、改不了 status/is_banned、读不到订单的买家邮箱列、调不了 `get_user_id_by_email`;service_role 调 `create_booking_order` 能下单,订单号 HFA-000001。
  - 线上是 Postgres 17,本地只有 16,17 多出来的 `maintain` 权限没法在本地验证(它是 Supabase 默认给的,迁移里没有碰)。**迁移还没在真正的 Supabase 新项目里跑过**,第一次建新站点时按清单第 3 步跑完后,用导出工具核对一遍。
  - 上面两条线上修正 SQL 在"按线上导出重建的库"上跑过两遍,结果正确。
- **网站无变化**:改动前(main)和改动后各 `next build` 一次、`next start` 起来,对比首页、登录、注册、联系、条款、隐私、找订单、`/publishers/join`、`/auth/continue` 9 个页面的 HTML(去掉脚本和构建哈希后完全相同,包括 `<title>` 和分享卡片 meta),两个图标(`/icon`、`/apple-icon`)逐字节相同。要登录才能看的几处(个人主页链接前缀、后台订单搜索框提示、订单页标题、邮件落款)是同样的字符串替换,没有实际打开看。订单号解析的正则改成从前缀生成,11 个输入(含 "HFA-000118"、"hfa000118"、"hfa 118"、"#118"、非法输入)跟原来结果一致。
- `npm run lint`、`npm run build`、`npm audit` 见 PR。

**以后做"活动预订"时的差异**(供参考,不是这次的任务):按场次(具体时间)而不是按天订、一场多个名额、活动所在地时区、活动结束后放款、开始前自动发参加链接和提醒、按活动定退款规则(英国"指定日期的休闲活动"不适用 14 天取消权)。账号、Stripe Connect 托管放款、拒付/退款、订单号、邮件、后台、安全防护都能直接复用。

## 安全复查(2026-09-25 晚,模板化整理之后)

产品负责人要求再扫一遍:密钥有没有进代码、卖家之间能不能互看、普通用户能不能看到管理员、其它漏洞。

### 结论

| 检查项 | 结果 |
|---|---|
| 密钥写进代码 | **没有**。当前代码和全部 git 历史里没有 Stripe/Supabase/Resend/Turnstile 的真实密钥;`.env.example` 只有占位符;用到密钥的文件全在服务端,浏览器下载的构建文件里搜不到任何密钥变量 |
| 卖家 A 看/改卖家 B 的数据 | **不能**。数据库 RLS + 列级权限(见迁移文件)只让买卖双方看到自己的订单、私信、付款,读不到买家邮箱/电话/地址这几列;代码里所有用 service_role 写订单的操作(交付、改链接、确认放款、取消、Stripe 收款账户)都先核对"是这单的买家/卖家"和订单状态;下单金额和卖家取自数据库里的广告,不是表单 |
| 普通用户看到管理员 | **不能**看到管理员名单(`admins` 表只能查自己那一行,也没有任何途径把自己加成管理员);后台所有 server action 都先 `requireAdmin()`。**但后台页面有漏洞,见下面第 1 条(已修)** |
| 其它 | 找订单要订单号 + 邮箱 + IP 限流 + Turnstile;订单专属页用随机 UUID;webhook 校验 Stripe 签名;定时任务要 `CRON_SECRET`;条款页 HTML 保存前过滤;`npm audit` 0 个漏洞 |

### 1. 【高,已修,代码】后台 7 个页面只靠 layout 检查管理员身份

`/admin`、`/admin/orders`、`/admin/contact`、`/admin/holds`、`/admin/listings`、`/admin/pages`、`/admin/pages/[slug]` 用 service_role 查全站数据,但只在 `admin/layout.tsx` 里 `requireAdmin()`。Next.js 站内跳转时 layout 不重新渲染(文档 Authentication → "Layouts and auth checks"),**不登录的人**发一个模拟站内跳转的请求就能让页面执行、拿到页面内容——比如 `/admin/orders` 会返回全部订单的买家姓名/邮箱/电话/地址,`/admin/contact` 返回全部联系留言。本地已复现(未登录请求拿到 HTTP 200 和订单页内容)。

修法:这 7 个页面开头都加 `await requireAdmin()`(Users、Finance 两个页面本来就有),layout 里写了说明,以后新加后台页面必须自己检查。修后用同样的请求测了全部 9 个后台页面,都只返回"跳转登录",没有数据。

**线上没有访问日志可以确认有没有人用过这个漏洞。** 利用它需要懂 Next.js 内部请求格式,普通用户点页面不会触发。

### 2. 【中,SQL 要手动执行】任何人能列出图片 bucket 里的全部文件(包括私信图片)

storage 上的 select 策略 "public can view ad space photos" 允许任何人查 `storage.objects`,也就是能调用 Storage 的"列出文件"接口。私信图片存在 `用户ID/messages/随机名`,用户 ID 在卖家主页等地方是公开的,所以别人能列出某个用户的私信图片再打开。Supabase 文档(Storage → Access Control)写明:公开 bucket 不需要这条策略就能访问;上传只需要 insert 策略(代码从不 upsert)。**产品负责人同意删掉**,迁移文件已同步。

```sql
drop policy if exists "public can view ad space photos" on storage.objects;

-- 核对:应该只剩一条 insert 策略
select policyname, cmd from pg_policies where schemaname = 'storage';
```

执行后测:① 首页/广告详情页的图片、卖家头像和横幅正常显示;② 发布一条带图片的广告(或给已有广告加一张图)能上传;③ 私信里发一张图,双方都能看到。

**已执行(2026-09-25)**:产品负责人已在线上执行(PR #63 合并之后)。

### 3. 【低,产品负责人要求一起修】Stripe 账户 ID 公开可读;删广告/换头像时旧图片没删

**(a) 卖家 Stripe 账户 ID 不再对外公开。** 以前任何人都能通过 API 读到 `profiles.stripe_connect_account_id`、`seller_profiles.stripe_account_id`。改成列级权限:这两列只有服务端(service_role)能读,其它列照旧公开(页面上的"已认证"标记、封禁状态、国家等不受影响)。

- 代码:公开页面(广告详情、卖家主页 `/sellers/[id]` 和 `/[username]`、广告/卖家卡片列表、`/dashboard/profile`)原来 `select("*")`,改成只读 `PUBLIC_PROFILE_COLUMNS` / `PUBLIC_SELLER_PROFILE_COLUMNS`(`src/lib/supabase/types.ts`);卖家读自己 Stripe 账户 ID 的 3 处(Payment Management 页面、连接 Stripe、打开 Stripe 后台)改成确认本人后用 service_role 读。放款、webhook、下单本来就是 service_role。
- **以后给 `profiles` / `seller_profiles` 加新列,要同时在下面的 grant 里加上这一列**(迁移文件 `_grants.sql` 也要加),不然前台读不到、页面会报错。

**(b) 删广告、编辑广告去掉图片、换头像/横幅时,真的删掉旧文件。** 以前代码用登录用户身份删,但 storage 没有 delete 策略,删除静默失败。现在统一走 `src/lib/mediaCleanup.ts`:只删这个用户自己文件夹下的文件;删之前查一遍还有没有别的地方在用(复制广告会共用同一批图片;头像、横幅、价目表图、私信图片都在同一个 bucket),还在用的保留;用 service_role 删;失败只记日志,不影响保存。**以前没删掉的老文件这次不清理**(要清的话以后另做一次性清理)。

**顺序很重要:先合并部署,再执行下面的 SQL。** 新代码在执行 SQL 前后都能用;反过来先执行 SQL 的话,旧代码的 `select("*")` 会让广告页、卖家主页报错。

```sql
-- Stripe 账户 ID 只给服务端读(可以重复执行)
revoke select on table public.profiles from anon, authenticated;
grant select (id, role, display_name, created_at, updated_at, country, stripe_onboarded, is_banned, username)
  on table public.profiles to anon, authenticated;
revoke select on table public.seller_profiles from anon, authenticated;
grant select (
  user_id, bio, avatar_url, is_verified, created_at, updated_at, stripe_charges_enabled,
  stripe_payouts_enabled, content_categories, website_url, banner_url, price_card_image_url
) on table public.seller_profiles to anon, authenticated;

-- 核对:应该是 false、true、false、true
select
  has_column_privilege('anon', 'public.profiles', 'stripe_connect_account_id', 'select') as anon_sees_stripe_id,
  has_column_privilege('anon', 'public.profiles', 'display_name', 'select') as anon_sees_name,
  has_column_privilege('authenticated', 'public.seller_profiles', 'stripe_account_id', 'select') as user_sees_old_stripe_id,
  has_column_privilege('authenticated', 'public.seller_profiles', 'avatar_url', 'select') as user_sees_avatar;
```

执行后测:① 不登录打开首页、`/listings`、一条广告详情、一个卖家主页、`/publishers`,都正常显示(卖家名、头像、"已认证"标记);② 登录卖家账号打开 `/dashboard/profile` 能改资料和用户名;③ `/dashboard/stripe-connect` 正常显示 Stripe 状态,"View Stripe dashboard" 能打开;④ 编辑一条广告删掉一张图保存,在 Supabase → Storage → ad-space-photos → 你的用户 ID 文件夹里,那张图没了;⑤ 用 Duplicate 复制一条广告,删掉原来那条,复制出来的那条图片还在;⑥ 换一次头像,旧头像文件没了、新头像正常显示。

**已执行(2026-09-25)**:PR #64 合并部署之后,产品负责人已在线上执行上面的 SQL。

## 赞助商展示:日历上显示买家品牌 + 卖家自选的空档展示(2026-09-26 决策记录)

参考 thewall.ink 的 WALL HISTORY:买家愿意的话,在广告页上展示"谁买过这个广告位",点一下就能访问买家的网站或社交账号——对卖家是成交背书,对买家是额外曝光。产品负责人 2026-09-26 确认的规则:

### 1. 买家:下单时自愿填写
- 付款页多一块可选项"Show my brand on this listing":**品牌名**(最多 60 字)+ **一个链接**(网站或一个社交账号,只能一个),勾选"同意公开展示"才会展示。不填、不勾都不影响购买。
- 只有**付款成功**的订单才展示:`paid_in_escrow / delivered / confirmed / released / expired_auto_confirmed`。待付款、已取消、因退款/拒付暂停放款(`payout_hold` 为 `refund` 或 `dispute`)的都不展示。
- 付款后买家**不能再改**名字和链接(防止卖家看过之后被换成恶意链接),但可以在"我的购买"里随时**撤回展示**(再打开也行,内容不变)。

### 2. 展示在哪里
- **开了日历预订的广告**:详情页的"Sponsor calendar"按天列出——已被预订的日子显示买家的品牌名和链接(包括还没开始的预订,买家下单时已被告知);没被预订的日子显示"Available",如果卖家设了自选展示(见第 3 条),同时显示卖家的内容并标注 **"Creator's pick"**,这一天仍然可以预订。
- **没开日历的广告**:详情页显示"Sponsors"一栏,列出自愿展示的历史买家(同一品牌去重,最多显示最近 12 个)。

### 3. 卖家:空档自选展示(house ads)
- 卖家在个人资料页设置最多 5 条"品牌名 + 链接",用来放自己的或朋友的。日历上**没被预订的日子**按日期轮换展示其中一条(同一天刷新不会变)。
- 必须标"Creator's pick"并且那天保持可预订——不能让买家误以为这天已经被人买了(虚假成交背书在英国消费者保护法下有风险)。

### 4. 安全规则
- 链接只接受 `http(s)://`,拒绝 IP 地址、localhost、带用户名密码的链接,长度 ≤ 300;名字去掉控制字符。数据库层面也有 check 约束兜底。
- 页面上显示链接的**域名**(让人点之前看得到要去哪),所有链接 `target="_blank" rel="sponsored nofollow noopener noreferrer ugc"`——付费链接必须标 sponsored,否则会影响整站在 Google 的排名。
- **卖家审查**:在"我的销售"订单卡片上能看到买家填的内容,可以"Hide from listing"/"Show again"。
- **管理员监管**:`/admin/sponsors` 列出所有公开的买家展示和卖家的自选展示,可以隐藏;管理员隐藏的,卖家和买家都不能重新打开。
- 所有写操作走服务端(service_role),先校验身份:买家只能改自己的订单,卖家只能改卖给自己的订单,管理员走 `requireAdmin()`。
- 新字段不放进买卖双方用户态 client 读的订单列(`PARTY_ORDER_COLUMNS`),由服务端单独读——**没执行下面的 SQL 之前,网站其它功能照常,只是这个功能不显示**。

### 要手动执行的 SQL(HereForAds 线上库,部署前或部署后都行)

```sql
-- 订单上的买家展示信息
alter table public.listing_orders
  add column if not exists sponsor_name text,
  add column if not exists sponsor_url text,
  add column if not exists sponsor_public boolean not null default false,
  add column if not exists sponsor_hidden_by_seller_at timestamptz,
  add column if not exists sponsor_hidden_by_admin_at timestamptz;
alter table public.listing_orders drop constraint if exists listing_orders_sponsor_name_len;
alter table public.listing_orders drop constraint if exists listing_orders_sponsor_url_http;
alter table public.listing_orders
  add constraint listing_orders_sponsor_name_len
    check (sponsor_name is null or char_length(sponsor_name) between 1 and 60),
  add constraint listing_orders_sponsor_url_http
    check (sponsor_url is null or (sponsor_url ~* '^https?://' and char_length(sponsor_url) <= 300));

-- 卖家的空档自选展示,只有服务端读写
create table if not exists public.seller_house_ads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  url text check (url is null or (url ~* '^https?://' and char_length(url) <= 300)),
  hidden_by_admin_at timestamptz,
  created_at timestamptz default now() not null
);
create index if not exists seller_house_ads_user_idx on public.seller_house_ads (user_id);
alter table public.seller_house_ads enable row level security;
revoke all on table public.seller_house_ads from anon, authenticated;
```

执行完核对:`select sponsor_public from public.listing_orders limit 1;` 不报错、`select count(*) from public.seller_house_ads;` 返回 0。

> **2026-09-26 已在 HereForAds 线上库执行**(产品负责人确认,核对查询不报错、`seller_house_ads` 返回 0)。上面的 SQL 可以重复执行。

## 部署(Vercel)

- Environment Variables 里配 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`(类型选 Secret 或 Config 都行,`NEXT_PUBLIC_` 前缀的值反正都会被打进浏览器端代码,选哪个纯粹是 Vercel 后台能不能再看到明文的区别,不影响功能),再加支付相关的 `SUPABASE_SERVICE_ROLE_KEY`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`NEXT_PUBLIC_SITE_URL`(生产环境填 `https://hereforads.com`)——**前三个必须选 Secret**,不能带 `NEXT_PUBLIC_` 前缀
- `next.config.ts` 里把 Server Actions 的请求体上限从默认 1MB 调到了 10MB(`experimental.serverActions.bodySizeLimit`),不然发布广告位带图片会报 `Body exceeded 1 MB limit` 的 500 错误
- **`main` 才是 hereforads.com 实际部署的分支**(有 `public/logo.png` 品牌 logo 为证)。仓库另外还有一条 `claude/admiring-goldberg-8x70p7`,历史上曾各自独立合并过好几个 PR、跟 `main` 分叉了十几个提交,**没有连着线上环境**,不要在那条分支上开发——之前有 session 误在那条分支上开发、PR 也顺利合并了,但改动从未真正上线,排查了很久才发现。这条笔记之前写反过(说 admiring-goldberg 才是生产分支),已更正。

## 已知欠缺 / 下一步 TODO

**老流程(`ad_spaces`/`orders` 日历预订)已经整体下线,不再是活跃的 TODO**——2026-09-17 已经把对应的页面、组件、`enums.ts`/`types.ts` 里的类型都删了,详见上面"页面一览"和 WORKLOG 同日期条目。老流程原来遗留的几条 TODO(支付抽成/退款、卖家收款前置校验、`campaigns` 表、图片管理、跨月日历展示)如果以后要在 MVP v2 上重新做,当参考,不再是要修的 bug。

下面是当前唯一在跑的 MVP v2(`listings`/`listing_orders`)已知欠缺:

- **迁移文件还没在真正的 Supabase 新项目里跑过**:这个开发环境连不上 HereForAds 的 Supabase 项目。2026-09-25 起 `supabase/migrations/` 按线上导出整理好了,在本地 Postgres 上验证过跟线上一致(见"模板化整理"一节);第一次建新站点时要用导出工具再核对一遍
- **没配自动放款的定时触发器**:`/api/cron/auto-confirm` 端点写了,处理资金冻结期(`ESCROW_HOLD_DAYS`,3 天)到期后的自动放款,但没有实际的 Vercel Cron / Supabase pg_cron 去调用它
- **退款/纠纷仍是人工**:规则已在 2026-09-23 定下(见"费用、取消与退款规则"一节),代码还没实现,在实现之前出问题仍需要人工去 Stripe 后台处理
- **没做自动翻译**、**没做可嵌入组件**、**没做中国卖家收款通道**:都是产品方案里明确列的"预留但 MVP 不做"
- ~~**占用式(daily/weekly/monthly)listing 还没有真正的档期日历**~~ 2026-09-24 起做了卖家可选的日历预订,见"日历按天预订"一节(没开日历的按天/周/月广告仍然按一个单位卖)。
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
