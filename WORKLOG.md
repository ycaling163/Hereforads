# 工作日志

这个仓库有好几个 session(不同时间、不同 Claude 对话,偶尔还有人直接在 GitHub 网页操作)在并行改,只看 git log/commit message 容易漏掉"为什么"和"哪些是已经拍板的决策"。**每次改了代码、数据库结构、线上环境变量/配置,或者拍板了产品/技术决策,都在这里补一条**,别指望后面的 session 能从聊天记录里把上下文猜回来。

规则:

- 按日期分段,新的加在最下面(跟 git log 反着,方便看"从头到尾发生了什么")
- 写清楚:做了什么、改了哪些文件/表/环境变量、有没有做了但还没跑通验证的事、有没有需要人工去 Supabase/Stripe/Vercel 后台配的东西
- 拍板的产品/技术决策不要只写在这里——顺手同步到 README 对应章节(比如"MVP v2 产品方案"一节),这里只记"什么时候、为什么这么定",README 是查最终结论的地方
- 开始干活前,先扫一眼这个文件最近几条 + README,别只看代码就动手,容易对不上号(2026-09-17 那条就是教训)

---

## 2026-09-16

- 另一个 session 按团队确认的《HereForAds MVP 产品方案》(内容见 README "MVP v2 产品方案(权威决策记录)" 一节)从零搭了 MVP v2 代码骨架:新增 `listings`/`listing_orders`/`payments`/`listing_messages` 表 + RLS(SQL 写进 README,当时还没在真实 Supabase 项目跑过)、Stripe Connect Express onboarding(卖家 `stripe_onboarded` 才能把 listing 从 `draft` 发布成 `active`)、Charges & Transfers 托管交易流程(Checkout → webhook 标 `paid_in_escrow` → 卖家提交交付凭证 → 买家确认或 3 天自动确认 → Transfer 给卖家扣 12% 佣金)、简单的一对一私信。
- 这批改动先加进了 `main`(commit `6bcfbd3`),又被同一个 session 自己 revert 了一次(`1881bac`),6 分钟后原样重新加回去(`8d0eb51`),最后通过 PR #16(`claude/mvp-v2-listings-skeleton`)由 `ycaling163` 在 GitHub 网页上点了合并(`2169f51`)。
- 已知欠缺(见 README"MVP v2 骨架已知欠缺"):Stripe webhook 端点、`/api/cron/auto-confirm` 定时触发器都还没在 Stripe/Vercel 后台配上,整条 Checkout → webhook → 托管 → 交付 → 确认 → Transfer 链路没有用 Stripe 测试模式跑通过一次完整交易。

## 2026-09-17

- 收到反馈:老的"实体广告位日历预订"流程(`ad_spaces`/`orders`,参考 thewall.ink 那套)里,买家的预订被卖家确认("已确认(待付款)")之后没有任何付款入口——代码只写到"占日期、状态停在待确认"就没了。接的是 Stripe Connect destination charge(买家在 Checkout 付款,钱直接转进卖家的 Express 账户,平台不经手资金,没抽成):新增 `/dashboard/payments`(卖家开户/查看收款状态)、"我的预订"页买家的"去支付"按钮、`/api/stripe/webhook` 处理 `checkout.session.completed`(把订单从 `confirmed` 推进到 `paid`)/`account.updated`(同步卖家 `stripe_charges_enabled`)。
- push 的时候发现 9-16 那批 MVP v2 骨架已经先合并进了 `main`,俩改动撞了同一批文件,尤其是 `src/app/api/stripe/webhook/route.ts` 和 `src/lib/stripe/server.ts`(两边都新建了同名文件,内容完全不同)。跟人确认后按"两条产品线并存,不互相覆盖"处理:合并成一个 webhook route——`checkout.session.completed` 先试着把老流程的 `orders` 表从 `confirmed` 推进到 `paid`,一行都没改到才说明不是老流程的订单,再去按 MVP v2 的 `listing_orders` 处理;`account.updated` 两边(`seller_profiles` 和 `profiles`)的字段都更新。统一用 MVP v2 那边已经建好的 `src/lib/supabase/service.ts`(`createServiceClient`),删掉了自己重复造的 `src/lib/supabase/admin.ts` 轮子。
- **走了一段弯路**:一开始没意识到 MVP v2 是团队已经确认过的方向,以为是别的 session 自作主张加的东西,建议直接从 `main` 上把它删掉——是我理解错了,团队已经拍过板、数据库该建的字段也跑过了,只是记录决策的那份产品方案文档(Claude Docs,协作文档,可被随时编辑)本身没跟着代码同步更新,里面 $0.99 最低价、12% 佣金这两条还留着"需要你拍板"的措辞,导致后面看文档的人(包括我)以为这两个数字还没定。**教训:改代码/下结论之前,先看这份工作日志 + README 里的决策记录,不要只看 git log 或者某一份可能过期的文档去猜。**
- 把那份产品方案文档的内容(产品定位、用户角色、获客逻辑、MVP 范围表、已确认的关键决策、预留但暂不做的扩展点)搬进了 README 新增的"MVP v2 产品方案(权威决策记录)"一节。**以后 README 是查最终产品决策的权威版本**,协作文档发现跟 README 对不上时,以 README 为准,并回头把文档也改一致——不要反过来。
- 建了这份工作日志(本文件),以后每天(不管是哪个 session 还是人工改的)都要往这里补一条,不能只靠聊天记录或者 commit message 传信息。
- **重要 bug 修复**:上面两条改动(`22220d7`、`6fe8b06`)推上去之后,Vercel 上连续两次 Production 构建 `Error`。本地复现:`src/lib/stripe/server.ts` 里 `export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)` 是模块顶层直接 `new`,Next.js build 的"Collecting page data"阶段会静态 import 每个 route/action 模块做分析,这一步就会真的执行到这行——如果这时候 `STRIPE_SECRET_KEY` 在构建环境里还没生效,会直接抛 `Neither apiKey nor config.authenticator provided`,**把整个构建炸掉,连跟 Stripe 完全无关的页面都发布不出去**(不是账号配置问题,是代码本身的 bug,MVP v2 那批代码从没在真实 Vercel 环境构建过,所以之前没暴露)。改成用 `Proxy` 惰性初始化:只有第一次真正调用 `stripe.xxx(...)`(请求时,不是 build 时)才会去读环境变量、建客户端,其他文件不用改,因为大家都是 `import { stripe } from "@/lib/stripe/server"` 后当普通对象用。本地分别在"没设 `STRIPE_SECRET_KEY`"和"设了假值"两种情况下跑过 `next build`,都成功。
- **卡了一整个下午的问题,没解决完,先记录现状**(详细排查过程和下一步建议见 README 顶部"当前卡住的问题"一节,这里只记时间线):用户实际在 hereforads.com 上测试买家付款,Stripe Checkout 页面能正常打开、测试卡能正常付款、成功跳转回站内,但订单状态一直卡在 `待支付`,没有推进到 `paid_in_escrow`。一路排查:确认了买家确实完整走完 Stripe 真实付款(不是代码没跳转);确认 Stripe 后台那个 webhook 目的地长期 "Total 0" 投递、账户级 Events 日志也搜不到对应事件,说明 `checkout.session.completed` 大概率没有真正送达 `/api/stripe/webhook`;顺藤摸瓜查到域名 `hereforads.com`(IONOS 买的,nameserver 指到 Cloudflare)的 DNS 配置有问题——根域名 A 记录原本指向 IONOS 自己的服务器(不是 Vercel),而且 `hereforads.com`/`www.hereforads.com` 两条记录都开着 Cloudflare 的橙色代理,怀疑代理把 Stripe 的 webhook POST 请求当机器人流量拦了。已经把 A 记录值改成 Vercel 官方 IP `76.76.21.21`、把 Vercel 里 `hereforads.com` 设成主域名,但把 Cloudflare 代理关掉(橙色云朵→灰色 DNS only)这一步用户反馈"没有用",最后状态没有确认清楚,今天先到这里,下一个 session 直接接着查。

- **接着上面那条,问题解决了,但根因跟猜的不完全一样**:重新截图确认后,Cloudflare 里 `hereforads.com`(A)和 `www.hereforads.com`(CNAME)两条记录云朵图标其实已经是灰色(DNS only)——DNS/Cloudflare 这条路径本身是修好的,但修好之后订单还是卡在 `待支付`,说明这不是(唯一)原因。往下查发现:Stripe 后台的 **Sandboxes**(新的隔离测试环境,跟以前的 Test/Live mode 切换不是一回事,每个 sandbox 独立一套 API keys/webhook/客户数据)里,买家测试购买实际用的这个 "Hereforads" sandbox,**Webhooks 页面是空的,压根没有配置任何 destination**——之前记录的那个 "hereforads-production" webhook 大概率是配在了旧版 Test mode 或另一个 sandbox 下,Stripe 自然无处可发事件,Vercel 日志里 `/api/stripe/webhook` 也确认零请求。在当前 sandbox 里重新建 destination 时,第一次只顾着勾 `checkout.session.completed`,没注意到新版创建界面默认建议的是 "Accounts v2" 事件组而不是代码里判断的经典 v1 `account.updated`,补勾经典 `account.updated` 之后才完整。最后配置:destination URL `https://hereforads.com/api/stripe/webhook`,订阅 `checkout.session.completed` + 经典 `account.updated`;Vercel `STRIPE_WEBHOOK_SECRET` 换成这个 destination 的 signing secret 并重新部署。验证:重新测试购买,Purchases 页面正确显示 `托管中`。**教训:Cloudflare 代理确实是个真实存在的问题、也确实修了,但排查一个"webhook 没收到事件"的问题时,不能只查网络层,一定要先去 Stripe 后台确认对应 sandbox/mode 下 webhook destination 本身存在且订阅了正确的事件——这个最基础的检查这次是最后才做的,应该提到最前面。**排查期间产生的几条老测试订单会永久卡在 `待支付`(对应事件从未投递、不会重发),是 sandbox 测试数据,不用管。

- **下线老的"实体广告位日历预订"流程,收敛到只剩 MVP v2**:用户确认测试阶段 `orders` 表没有真实数据,老流程代码不影响 V2 就可以删,登录/注册这些共用的保留。删了 `src/app/dashboard/{spaces,orders,bookings,payments,new-space}`、`src/app/spaces`(含各自的 `actions.ts`),以及只有它们在用的组件/lib:`SpaceCard.tsx`、`SpaceForm.tsx`、`BookingCalendar.tsx`、`lib/booking.ts`、`lib/currency.ts`。`enums.ts`/`types.ts` 里对应的 `AD_SPACE_TYPES`/`AD_SPACE_STATUSES`/`ORDER_STATUSES`(+ 各自的 labels)、`AdSpace`/`Order` 类型也一并删掉(确认过删除前这些定义除了老流程文件自己,没有别处引用)。`ad_spaces`/`orders` 两张表本身没动,只是代码不再读写。
- `Header.tsx`/`dashboard/layout.tsx` 的导航去掉了"(旧)"那几个链接;顺手改了三处会 404 的死链接(`git rm` 之后 `next build` 不会报这种错,因为 `redirect()` 目标是字符串、不做静态检查,是靠 grep `redirect(` 全量人工核对出来的):`/dashboard` 首页原来跳 `/dashboard/spaces` 改成跳 `/dashboard/my-listings`,登录/注册成功后原来跳 `/spaces` 改成跳 `/listings`。
- 首页(`app/page.tsx`)和 `/sellers/[id]` 原来是查 `ad_spaces` 表、用 `SpaceCard` 渲染,改成查 `listings`(`status='active'`)、用 `ListingCard` 渲染,不然删完老流程这两个页面会变成死链接/空白。
- **日历预订这个功能本身没有照搬到 V2**,是用户明确要求的:V2 的占用式(daily/weekly/monthly)listing 以后要做真正的档期日历时可以再做,不用现在补;`lib/booking.ts` 的日期区间/冲突计算逻辑在删除前的 commit 里还在,到时候可以直接抄,不用重新设计。
- 新增 `/dashboard/my-listings`:卖家自己发布的全部 listing 列表(含 `draft`/`active`/`paused`),对应 WORKLOG 9-16 那条记的已知缺口"卖家没有'我的广告位'列表页"。目前只是列表,没有编辑/下架入口。
- 给 `listings/[id]` 页加了 `DailyCountdown`(老流程 `spaces/[id]` 本来就有这个组件,只是从没接到 V2 页面上):`pricing_unit === 'daily'` 时在价格下面显示"距离今日档期刷新还剩 HH:MM:SS"。组件本身没改,纯粹是补一处调用。
- 验证方式:`npm run build`(手动传了几个假的 `STRIPE_SECRET_KEY`/`SUPABASE_*` 环境变量,这个开发环境没有真实值)全绿,`npx eslint src` 无报错,路由列表确认老路由都消失、新路由都在。没有本地起 dev server 用浏览器点一遍(这个环境没有真实 Supabase 数据可登录测试),线上部署后建议用真实账号走一遍首页 → listings → sellers 页 → dashboard 各个 tab,确认没有遗漏的死链接。
- README 同步更新:"页面一览"表去掉老流程行、加了 `/dashboard/my-listings` 和 `DailyCountdown` 的说明;"支付流程"一节删掉了老流程的 destination charge 描述(那套连着 `/dashboard/payments`/`/dashboard/bookings`,现在也删了);"已知欠缺"里把老流程那批 TODO 标成"已下线,仅供以后参考",新增了"占用式 listing 还没有日历"和"`my-listings` 只是列表没有编辑入口"这两条。
- **dashboard 导航从顶部横条改成左侧竖排**,按用户要求分组:仪表盘(单独)、广告管理(Publish listing + My listings)、交易管理(Sales + Purchases)、支付管理(单独,直接链到 Stripe payouts,因为目前只有这一个页面)、消息(单独,不并进交易管理)、个人资料(单独)。新增 `src/components/DashboardSidebar.tsx`("use client",用 `usePathname` 高亮当前页),`dashboard/layout.tsx` 从 `<nav>` 横条改成 `flex` 布局的侧边栏 + 主内容区。
- **`/dashboard` 首页从"重定向到 my-listings"改成真的总览页**:统计"待处理订单(卖家视角,`listing_orders.status='paid_in_escrow'` 数量)"、"待确认收货(买家视角,`status='delivered'` 数量)"、"近 30 天成交额"(按 `paid_at` 落在 30 天内的 `amount` 原样相加,按币种分开显示,没做汇率换算)、"广告位状态分布"(`listings` 按 `status` 分组计数)。统计比较粗糙(没扣费、没有趋势图),够用但以后可以细化。
- 踩了一个 lint 坑:`dashboard/page.tsx` 里 `new Date(Date.now() - ...)` 被 `react-hooks/purity` 规则拦了("Cannot call impure function during render")——这个 Server Component 是每次请求都重新渲染,不存在被缓存/记忆化的问题,规则本身是针对客户端渲染纯度设计的,加了 `eslint-disable-next-line` 并写注释说明,没有改成别的写法绕过去。
- **修了 `/dashboard/stripe-connect`("Payment Management")页两个问题**:①之前不管有没有连好 Stripe,页面顶部都显示"你需要先完成 Stripe 开户"这句话,连好之后其实是矛盾的(下面同时显示"已完成"),改成按 `onboarded` 状态显示不同文案。②用户要求这页应该显示"已销售总额"和"能提现的钱"——已销售总额从 `listing_orders` 表算(排除还没付款的 `pending_payment`,按币种分开求和,不做汇率换算);"能提现的钱"没有从自己数据库估算(那样不准,Stripe 那边的打款节奏、手续费扣减细节我们这边拿不到),改成直接调 Stripe 官方的 Balance API(`stripe.balance.retrieve({}, {stripeAccount: accountId})`)拿这个 Connect 账户真实的 `available`/`pending` 余额,外加一个跳转到 Stripe Express 自带 Dashboard 的按钮(`stripe.accounts.createLoginLink`)——真正"提现"这件事本来就是 Stripe 托管的,不是这个项目自己实现的功能,给个入口过去就够了。新增了 `src/components/StatCard.tsx`(从 `dashboard/page.tsx` 里抽出来复用)。
- **把全站残留的中文 UI 文案统一改成英文**(不动代码注释,注释继续中文给团队看):首页文案、`Header`/`DashboardSidebar` 导航、登录/注册页整个表单和错误提示、`UserMenu`(我的账号/退出登录)、`PasswordInput`(显示/隐藏)、`SocialAccountBadge`(访问主页/粉丝)、`/dashboard/profile` 整个页面(标题、社交账号管理表单的所有 label/按钮/错误提示)、`/sellers/[id]`(已认证/社交账号/全部广告位/匿名卖家)、`enums.ts` 里三张会显示给用户看的 label 表(`SOCIAL_PLATFORM_LABELS`、`LISTING_STATUS_LABELS`、`LISTING_ORDER_STATUS_LABELS`——之前这三个是中文,其他 MVP v2 的 label 表当时写的时候就已经是英文了)、`DailyCountdown` 组件文案、`app/layout.tsx` 的 `<html lang="zh-CN">`(改成 `"en"`)和 metadata description。翻译不是逐字直译,是按"HereForAds = 把你的空间变成广告位"这个定位重新写的英文文案(比如首页 hero:"Turn your space into ad space.")。检查方式:全仓库扫一遍中日韩统一表意文字(CJK)字符,确认剩下命中的文件里中文只出现在代码注释里,没有漏改的用户可见文案。以后新加 UI 文案默认写英文,这条已经写进 README 顶部的提示里。
- **拆开"创作者内容领域"和"广告位接受的品牌类目"这两个之前混在一起的概念**:用户反馈发布 listing 时那个"Categories"选择器很奇怪——那其实是"这个创作者平时做什么内容"该填的东西(比如手工/创作类博主),不该跟"这个广告位愿意接哪些品牌类目的广告"(比如同一个手工博主的广告位可以接时装、餐饮品牌)绑在同一个字段上。改法:`listings.categories` 保留原样,但语义收窄成"这个 listing 接受的广告品牌类目",表单 label 改成 "Ad categories you accept" 并加说明文字;新增 `seller_profiles.content_categories`(`listing_category[]`,复用已有枚举类型,默认 `'{}'`)专门存创作者自己的内容领域,加到 `/dashboard/profile` 页(`ProfileForm.tsx` 新增一组 checkbox,`updateProfileAction` 里 upsert 进去),买家能在 `/sellers/[id]` 页看到这些标签。`listings/[id]` 页给品牌类目 chips 加了"Accepts ads from"这行小标题,进一步跟"卖家自己是什么类型创作者"区分开。**这次改动依赖一条新的数据库列**(`alter table public.seller_profiles add column if not exists content_categories public.listing_category[] not null default '{}';`,已写进 README"MVP v2 数据库变更"一节的 SQL 代码块),这个开发环境连不上真实 Supabase 项目,**这条 SQL 需要人工去 Supabase 后台执行**,执行前 `/dashboard/profile` 保存内容领域会因为列不存在而报错。

- **用户实际测试 Stripe 开户流程后反馈两个问题,牵出一个真实的产品/代码 gap**:①用户在英国走 Stripe Express 开户,做了 ID 验证,但 Stripe **没有让他填银行账户**,结果 Payment Management 页却已经显示"已连接"、可以看统计数字;②他问"打款要不要自己选币种",以及"后台没有提现按钮"是不是缺功能。查证后结论:
  - `charges_enabled`(能收款/能发布 listing)和 `payouts_enabled`(能把余额打到银行账户)是 Stripe 账户上两个**独立**的能力位,账户完全可能先具备前者、还没具备后者(银行账户没填/没审完)。`/dashboard/stripe-connect` 页原来的 `onboarded` 判断只看 `charges_enabled && details_submitted`,没管 `payouts_enabled`,所以用户那种"能收款但不能提现"的中间状态被误判成"一切正常",页面没有任何提示——这是真 bug,不是用户操作问题。
  - 打款币种不需要卖家在我们这边选,是卖家 Stripe 账户绑定的银行账户自带的默认结算币种(`account.default_currency`);如果卖家的 listing 用了别的币种,Stripe 打款时自动换汇,扣一笔小额手续费,这个项目不用管。
  - "没有提现按钮"是设计如此:提现这件事完全交给 Stripe Express 自带的 Dashboard 管(卖家点"View Stripe dashboard"过去自己操作),这个项目故意不重新做一遍 Stripe 已经做好的东西。
  - **修复**:`stripe-connect/page.tsx` 现在不管 `onboarded` 是不是 `true`,只要账户存在就会查一次 `stripe.accounts.retrieve`,拿到 `payouts_enabled`(决定要不要显示"还差一步,去填银行账户"的提示 + "Finish payout setup" 按钮,复用已有的 `StripeConnectForm`/`startStripeOnboardingAction`,不用新建组件)和 `default_currency`(决定要不要显示换汇提示——检测到有 listing 用了非账户默认币种的币种时,显示一行"你的打款币种是 X,其他币种会被 Stripe 自动换算"的说明文字)。`profiles.stripe_onboarded` 这个存库字段故意不去掺和 `payouts_enabled`(它的语义一直是"能不能发布 listing",不是"能不能提现"),`payouts_enabled` 每次进页面都是实时查的,没有存库,也没必要存(页面访问频率不高,直接查 Stripe 更准确、不会有缓存过期的问题)。

- **加了打款明细,让卖家看到"100 英镑是怎么分的"**:用户问要不要有费用明细。之前 `src/lib/stripe/release.ts` 算完 Stripe 实报手续费(`balance_transaction.fee`)和卖家净到手金额就直接拿去发 Transfer,两个数只是临时变量,没有存库,`payments` 表原来只存了 `platform_fee_amount`。现在这两个数(`stripe_fee_amount`、`net_amount`)也存进 `payments` 表了(新加两列,SQL 见 README,同样需要人工去 Supabase 后台执行,执行前这两列不存在,`release.ts` 的 update 语句会报错——**这个改动会阻塞真实放款,上线前必须先跑这条 SQL**)。`/dashboard/sales` 页现在每个订单下面有一个小的费用明细框:总价 → 平台佣金(下单时就知道)→ Stripe 手续费(只有 `released` 之后才知道,之前显示"结算后才能看到具体手续费")→ 实际到手。`payments` 表本来就有买家/卖家能查自己订单的 SELECT RLS 策略(不用改权限),直接在 Sales 页用当前登录用户的 session 查就行,没有用 service_role client。

- **补齐三个用户反馈的缺口:未读消息/新订单红点、Sales 页按状态分组、Sales 页看不到买家是谁**:
  - **未读消息/新订单提示**:`listing_messages` 新加一列 `read_at`(收件人打开会话页时补上时间戳,null 就是未读,SQL 见 README,需要人工执行,还顺带补了一条之前漏掉的 UPDATE RLS 策略——之前这张表只有 select/insert 策略,收件人标记已读会被 RLS 静默拒绝)。新增 `src/lib/supabase/notification-counts.ts` 的 `getActionCounts()`,统一算"未读消息数"(`listing_messages` 里 `receiver_id=我 且 read_at is null` 的数量)和"新订单数"(`listing_orders` 里 `seller_id=我 且 status='paid_in_escrow'` 的数量,复用了 dashboard 首页统计卡片同一个口径)。`Header.tsx` 顶部账号头像右上角显示两者之和的红色数字气泡(`UserMenu.tsx` 加了 `badgeCount` prop);`DashboardSidebar.tsx` 的 "Messages"/"Sales" 两个导航项各自单独显示对应数字。打开某个消息会话(`messages/[listingId]/[otherUserId]/page.tsx`)会把对方发来的未读消息标记已读——**这里有个已知的理论风险没有处理**:这个 Server Component 渲染时就直接写库,如果 Next.js 在某些场景下预取(prefetch)了这个动态路由,理论上会在用户真正点开之前就把消息标记已读。这个项目所有页面都是认证态的完全动态路由(用了 cookies,构建产物里全是 `ƒ` 标记),App Router 对这种路由通常不会做数据预取,风险很低,但不是 100% 排除,先记录在这里,如果以后发现"消息还没点开就显示已读"的诡异现象,从这里查起。
  - **Sales 页按状态分组**:改成五个分区(New orders `paid_in_escrow` / In progress `delivered` / Awaiting payout `confirmed` / Completed `released`+`expired_auto_confirmed` / Awaiting payment `pending_payment`),每个分区标题带数量,数量为 0 的分区不渲染。
  - **Sales 页看不到买家信息**:补了买家昵称(查 `profiles.display_name`,跟老流程"收到的预订请求"页当年的做法一样)和一个直接跳到 `/dashboard/messages/[listingId]/[buyerId]` 私信页的链接,方便卖家联系买家对接交付。**顺带确认了用户提到的"交付时把广告展示链接发给买家"这个需求其实已经实现**:`DeliverOrderForm`/`markDeliveredAction` 早就有 `proof_url` 这个必填字段("Link the buyer can check"),标记交付时填的链接会存在 `listing_orders.proof_url`,买家在 Purchases 页能直接看到——不是新功能,用户可能是还没测过这条链路。没有额外做"购买时填联系方式"这个字段,判断是消息系统 + Sales 页买家昵称/私信链接已经能满足"对接交付工作"这个诉求,重复做一个联系方式字段是多余的。

- **后续两条追加需求,一条做了一条明确推迟**:
  - **邮件通知(新私信/新订单发邮件提醒)——用户明确说"resend 后面做",这轮先不做**。现阶段测试人少、大家都是自己盯着账号头像的红点看,等真要接 Resend 时需要用户去注册账号拿 API key 给我们,再单独排期。
  - **买家昵称可点击查看资料 + 私信支持发图片——这两个做了**。Sales 页买家昵称现在跳到 `/sellers/[buyer_id]`(这个路由虽然叫"sellers",但代码从来没按 `profiles.role` 做过区分,查什么 id 都能看,给买家用完全没问题,不用另外建一个 `/users/[id]` 路由)。私信(`ContactSellerForm`/`ReplyForm` 两个发送入口)加了图片上传,`listing_messages` 新增 `image_url` 列(SQL 见上面,需要人工执行),消息允许"只发图不写字"(`body` 存空字符串,不再要求 textarea `required`,校验挪到 server action 里:文字和图片至少有一个)。图片复用 `ad-space-photos` bucket,路径 `{userId}/messages/{uuid}.ext`。收件箱列表页(`messages/page.tsx`)对纯图片消息显示"📷 Photo"占位,不然预览行是空的。

- **首页文案定稿 + 导航栏改名**:大标题保留 "Turn your space into ad space."(用户提了两个候选"Turn your space into Ad work"/"Get a space, use for ad space",都有语法/清晰度问题,建议不换,已经跟用户说明);副标题改成融合版"Create your ad space in minutes and get paid by brands to advertise on it."。**两个首页按钮的文案-跳转对应关系,用户一开始提反了**——"Browse listings"(跳 `/listings`,买家找位置投广告的动作)应该对应"Find ad space",不是用户说的"Sell Ad space";"Publish your space"(跳 `/dashboard/new-listing`,卖家发布自己位置的动作)应该对应"Sell ad space",不是用户说的"Find Ad space"。按纠正后的对应关系改的,不是原样照抄用户的文字,跟用户确认过这个纠正逻辑。顶部导航"Listings"改成"Ad spaces",`/listings` 页面自己的 `<h1>` 和 `<title>` 也同步改成"Ad spaces"保持一致(用户单独反馈过这个不一致)。
- **SEO 元数据从几乎空白补齐**:之前 `layout.tsx` 的 `metadata` 只有一行 title/description,没有 `openGraph`,也没有 `metadataBase`(会导致 Next.js 对相对路径的 OG 图片路径报警告)。现在根 layout 用了 title 模板(`"%s | HereForAds"`,子页面只需要设置自己的短标题),写了更完整的 description,加了 `openGraph`(标题/描述/`images: ["/logo.png"]`,复用现成的 logo,没有单独做 1200×630 的分享卡片,见 README 备注)。`/listings` 页加了静态 `metadata` 导出;`/listings/[id]` 加了 `generateMetadata`,标题用该 listing 自己的 `title`,是**动态**的(每个广告位详情页浏览器标签页/搜索结果标题都不一样,不是全站一个标题),额外多查了一次 `listings` 表(只选 `title,description` 两列,跟页面主体 `select("*")` 的查询是分开的,重复查询这点开销可以接受,没有为了去重专门包一层 `React.cache`)。
- **换掉默认 favicon**:项目从建立到现在都没配过 `favicon.ico`/`icon.png` 这类文件,浏览器标签页显示的是各自浏览器的默认占位图标(用户截图里看到的黑色图标),跟品牌毫无关系。做法:新增 `src/app/icon.tsx`/`src/app/apple-icon.tsx`,用 Next.js 内置的 `next/og`(`ImageResponse`,不需要额外装图片处理库或转换工具,这个环境也确实没装 Pillow/cairosvg/rsvg-convert 这些)动态生成一个圆角方块 + 白色 "A" 字母的图标,背景色是从 `public/logo.png` 里 "Ads" 那部分文字实际采样出来的品牌蓝(约 `#0B5CFF`,用 Python/Pillow 在这个环境里采的样,不是瞎猜的颜色),不是一个新做的、跟品牌无关的设计。本地 `next start` 起了一个临时端口验证过 `/icon`(32×32)和 `/apple-icon`(180×180)两个路由真的能生成出 PNG、图案对不对,验证完手动停掉了那个临时进程。
- 用户又发了两张参考图问选哪个当图标,选了徽章+放射色块那版(不是定位图钉那版,理由是图钉套圆圈套文字这种细节在 32px favicon 会糊成一团),重新用 `next/og` 画了一版(参考图本身是截图、带白边,没有直接拿去用),`apple-icon.tsx` 保留完整放射色块,`icon.tsx`(32×32)简化成纯色块 + "Ad" 两个字母。

## 2026-09-18

- **加了管理员后台**:用户反馈"广告位现在直接公开,需要有管理员系统"。确认了两个关键决策(问过用户):①新 listing 要**事前审核**(不是先上线、管理员事后抽查),②这版管理范围是审核/拒绝/下架/推荐 listing + 封禁解封用户 + 只读看订单,群发邮件/消息、自动化审核明确是以后的事。详细设计和完整 SQL 见 README 新增的"管理员系统"一节,这里只记关键决策和踩的坑:
  - 管理员身份用独立的 `admins` 表(不是 `profiles.is_admin` 列),这张表故意不给 `authenticated` 开任何写权限,加管理员只能去 Supabase 后台手动 insert 一行——代码里没有任何自我提权的路径。
  - **做审核流程时顺手发现一个已经存在的安全洞,不是这次引入的**:`listings` 表"卖家能改自己 listing"的 RLS 策略没有限制列,意味着改之前任何登录用户理论上都能直接拿自己的 session 调 REST API 把 `status` 从 `draft` 改成 `active`,完全绕过任何审核(甚至不需要真的连 Stripe);`profiles.stripe_onboarded`/`stripe_connect_account_id` 同理也能被用户自己 PATCH。这次统一 `revoke update (...) ... from authenticated` 收回了这几列的权限,把对应的几处写入(`stripe-connect/page.tsx`、`stripe-connect/actions.ts`)从普通 session client 切到了 service_role client。**这条 REVOKE 是这次改动里风险最高的一条 SQL,上线时必须确认所有相关代码都已经部署,不然会突然开始报权限错误**——已经在这次改动里一起切好了,不是留着以后再做。
  - `listings.status` 状态机加了三个值:`pending_review`(卖家连好 Stripe 提交后的状态,取代直接 `active`)、`rejected`、`removed`。`is_featured` 是独立的布尔量,管理员标了之后首页/列表页排到最前面,带 "⭐ Featured" 角标。
  - 封禁除了改 `profiles.is_banned`,还调了 Supabase Auth 管理员 API(`auth.admin.updateUserById(..., {ban_duration: "876000h"})`)真正封掉登录,外加 `src/proxy.ts` 里加了一道每次请求查 `is_banned` 的检查(不然用户现有的 token 在过期刷新之前还能用一阵子)。**这部分没有在真实 Supabase 项目上跑通过测试**,这个开发环境连不上 `myadsspace` 项目,只做到本地类型检查通过、API 用法跟官方文档核对一致,上线后第一次封禁操作需要人工验证效果。
  - 新增页面:`/dashboard/admin`(总览统计)、`/dashboard/admin/listings`(审核队列,按状态分 tab,Approve/Reject/Remove/Feature 几个 action)、`/dashboard/admin/users`(用户列表,Ban/Unban)、`/dashboard/admin/orders`(只读,最近 200 条)。这几个页面全部挂在 `src/app/dashboard/admin/layout.tsx` 这一道闸下面(`requireAdmin()`,不是管理员直接跳回 `/dashboard`),子页面不用各自重复校验。侧边栏(`DashboardSidebar.tsx`)只有管理员登录时才会多出"Admin"这一组,顺手修了一个 `isActive` 的边界 bug(`/dashboard/admin` 是 `/dashboard/admin/listings` 等几个子项的前缀,不特殊处理的话进子页面时"Overview"也会一起高亮)。
  - 验证方式:`npm run build` + `npx eslint src` 全绿,路由列表确认四个 `/dashboard/admin/*` 页面都生成了。跟之前所有涉及数据库改动的工作一样,这个开发环境连不上真实 Supabase 项目,SQL 需要人工去后台执行,执行前审核/封禁这些功能会因为找不到对应的表/列而报错。
- **同一天下午,把管理员页面从 `/dashboard/admin/*` 挪到了顶层 `/admin/*`**:上面这版上线后用户反馈"个人和 admin 的内容一起了"(截图里 Admin 那组导航跟个人导航挤在同一个侧栏)。第一次尝试是给 Admin 那组加了琥珀色边框/配色跟其他导航项区分开,构建/lint 都过了但还没来得及提交,用户又追加了更明确的要求:"管理员和个人不在同一个页面才行"——不是配色问题,是要真正的页面级隔离。问题根源是 Next.js 的嵌套 layout:只要 URL 还在 `/dashboard/` 前缀下,就一定会经过 `dashboard/layout.tsx` 这层壳,子路由没法"跳出"父 layout,所以配色区分是这套路由结构下能做到的上限。正确做法是把整棵 admin 路由树挪到跟 `/dashboard` 平级:`git mv src/app/dashboard/admin src/app/admin`,`admin/layout.tsx` 换成自己独立的深色导航条(不再引用 `DashboardSidebar`),`admin/**` 里所有 `/dashboard/admin/...` 的内部链接和 redirect 路径都改成 `/admin/...`。`DashboardSidebar.tsx`/`dashboard/layout.tsx` 回退到不知道 admin 状态的纯个人版本。入口从侧栏挪到了账号头像下拉菜单(`Header.tsx` 算一次 `isAdmin`,`UserMenu.tsx` 加一条只有管理员能看到的"🛡 Admin"链接指向 `/admin`)。`npm run build` + `npx eslint src` 重新验证全绿,`README.md`/本文件同步更新。

- **同一天晚些时候,讨论"要不要把 Stripe 变成可选(愿意的走托管、不愿意的走线下)",结论是否决,顺带把托管放款模型从"等交付确认"改成"资金冻结期"**。完整决策记录写进了 README 新增的"平台责任边界"一节,这里只记结论,不重复论证过程:
  - **不做"Stripe 可选/线下可选"**:骗子会永远挑线下那条路(先在平台建立信任,再劝人"省手续费"私下转账),交易是从平台开始的,出事用户还是怪平台,开放线下通道等于主动放弃唯一能管住风险的机制,责任却一点没甩掉。
  - **承认一个甩不掉的事实**:只要走 Stripe Connect(现在这套 Charges & Transfers 模式),charge 打在平台自己的账户上,dispute/chargeback 冲的是平台账户,不是卖家——这是架构层面的事实,ToS 怎么写都免不掉,顶多能免掉"交付结果"这部分(广告效果好不好、卖家有没有按时上线),免不掉"钱本身有没有安全到账"这部分。
  - **落地的代码改动**:托管放款的触发条件从"卖家标记交付→买家确认收货"改成"付款后一个短暂的资金冻结期(`ESCROW_HOLD_DAYS`,3 天,从 `paid_at` 起算)",买家可以随时提前放款,不用等交付确认;`AUTO_CONFIRM_DAYS` 改名 `ESCROW_HOLD_DAYS`,`/api/cron/auto-confirm` 的触发条件从 `delivered`/`delivered_at` 改成 `paid_in_escrow`/`paid_at`,`confirmReceiptAction` 改名 `releaseNowAction`,`markDeliveredAction` 改名 `addDeliveryLinkAction`(只更新 `proof_url` 这个信息性字段,不再推进订单状态),`DeliverOrderForm.tsx` 改名 `DeliveryLinkForm.tsx`;`/dashboard/sales`/`/dashboard/purchases`/`/dashboard`/`/dashboard/stripe-connect` 几个页面的分组和文案同步更新。踩了一个需要注意的并发点:买家提前放款和定时任务的自动放款有可能同时触发同一笔订单,沿用了原来"条件更新 `status` 当锁,检查受影响行数再继续"的写法(把 `paid_in_escrow` 抢成 `confirmed` 再发起 Stripe transfer),防止同一笔订单被转两次账。
  - **没变的**:卖家发布前仍然要求 Stripe Connect 完成 KYC(这是防欺诈的主要防线,比逐条审核内容更有效);管理员的举报/封禁机制定位不变(控制"同一账号反复作案拉高平台 dispute rate"的风险,不是裁定每笔交易纠纷);`listing_orders.status` 用的 Postgres 枚举类型没有改动,`delivered`/`expired_auto_confirmed` 这两个值留着兼容历史行,没有新 SQL 需要执行。
  - **明确没做的**:挂牌费/排名费/联盟营销这类替代或补充交易抽成的收入模式,这轮只讨论没落地,不要误以为已经实现。
  - 验证方式:`npm run build` + `npx eslint src` 全绿。

- **紧接着又被纠正了一次**:上面那版"付款后固定冻结期,不管交付直接自动放款"上线后,用户马上指出一个实际漏洞——"没有交付,买家不会愿意确认付款,收到了款,并没有拍视频[交付凭证],那就会出现问题,还是需要点了交付,才能买家确认"。这是对的:没有任何交付信号的话,①买家没有依据判断要不要提前放款,②更严重的是,卖家可以完全不作为、纯靠超时自动放款拿到钱,这比原来的模型对买家更不利,不是更轻量,是退步。
  - **修正**:恢复"卖家先标记交付(`markDeliveredAction`,提交一个买家能核对的链接,订单从 `paid_in_escrow` 推进到 `delivered`)"这道前置动作,`ESCROW_HOLD_DAYS` 重新从 `delivered_at` 起算,不是从 `paid_at` 起算;买家在 `delivered` 状态下可以随时"Confirm receipt"提前放款,也可以等窗口到期后 `/api/cron/auto-confirm` 自动放款。卖家不标记交付,订单永远停在 `paid_in_escrow`,不会被定时任务碰到——堵死了"零操作靠超时拿钱"的路径。
  - **说清楚这跟"平台不裁定履约"不矛盾**:平台仍然不验证这个交付链接是否属实、不判断广告内容好不好,只是要求卖家做一次自证式操作再开始计时——这是"要求一个信号"和"验证信号真实性/评判信号质量"的区别,前者不违反"平台不做交付裁定"的原则,后者才违反。
  - 代码基本是把上一条记录里改过的几个文件改回原样:`/api/cron/auto-confirm` 触发条件改回 `delivered`/`delivered_at`,`markDeliveredAction`/`DeliverOrderForm.tsx` 恢复原名和原逻辑(状态推进,不只是写 `proof_url`),`releaseNowAction`(原 `confirmReceiptAction`)的守卫条件改回 `status === "delivered"`,`/dashboard/sales`/`/dashboard/purchases`/`/dashboard`/`/dashboard/stripe-connect` 的文案和分组也改了回去。`ESCROW_HOLD_DAYS` 这个改名保留下来了(名字本身没问题,只是语义注释改回"交付后"),`releaseNowAction` 这个改名也保留了(单纯改名,逻辑跟原来的 `confirmReceiptAction` 一致)。README"平台责任边界"一节已经更新成反映这个最终状态,不是两次改动叠加的中间状态。
  - **教训**:这次说明"平台不对交易结果负责"不能简单等同于"不需要任何交付层面的信号"——即使不裁定质量,至少需要一个能证明"卖家做了动作"的最低限度信号来做超时放款的前提,不然自动化机制本身会变成新的欺诈路径。
  - 验证方式:`npm run build` + `npx eslint src` 全绿。

- **纯文档记录,没有代码改动**:讨论"线下交易能不能防住"时确认了一点——只要买卖双方能在平台私信里沟通,随时可以交换联系方式跑去线下交易,这个技术上防不住(Upwork/Fiverr/Airbnb 这些平台也一样防不住)。这不推翻上面的决策,反而是"不要主动开放线下选项"的另一层理由:关键不是"能不能完全防住",是"这条路是不是平台自己设计提供的"——平台主动开的口子担责任,用户自己违反条款私下操作则不算平台设计或纵容。把接下来要做的三件事记进了 README"平台责任边界"一节新增的"线下交易技术上防不住"小节,标注了是给以后写 Terms of Service / Privacy Policy 用的备忘,这轮只是记录结论,没有写正式条款也没有落地成代码:①Terms 里要写清楚平台保护只覆盖 Stripe 完成的交易;②私信里做联系方式检测提醒(不做硬拦截,防不住但留个"平台提醒过"的记录),这个一旦做了会涉及"平台扫描私信内容"的隐私披露,需要专门写进 Privacy Policy;③把走 Stripe 这条路做得足够顺、有吸引力,减少用户绕开平台的动机。

- **重新设计广告卡片 + 社交账号展示,一路跟用户来回反馈跑出来的几轮改动,一并记录**:
  - 起因:用户想让广告位网格卡片长得像"谁 + 内容分类 + 平台粉丝数 + 价格 + 标题"这种一目了然的样式(参考的是别的产品截图)。重写 `ListingCard.tsx`,新增 `src/lib/listingCards.ts`(`attachSellerInfo`,按 seller_id 批量查 profiles/seller_profiles/social_accounts,避免每张卡片单独查询)、`src/lib/format.ts`(`formatFollowerCount`,粉丝数缩写成 25K/1.2M)。
  - **发现并修了粉丝数填不进去的 bug**:`SocialAccountsManager.tsx`/`SocialAccountRow.tsx` 的 follower_count 输入框原来是 `type="number"`,用户填 "22k" 这种缩写时浏览器直接判定整个输入无效、提交时变成空字符串,存库变成 null——不是没做展示,是数据从来没存进去。改成 `type="text"` + 服务端 `parseFollowerCount()`(`src/lib/format.ts`),支持纯数字/千位逗号/k、m 缩写。
  - **换成真实平台图标**:第一版图省事画了"IG"/"TT"这种自制圆形字母徽章,用户明确要求用真实品牌图标,换成 `react-icons`(`react-icons/si`,Simple Icons 集合):Instagram/TikTok/YouTube/小红书/微博/B 站/微信各自的官方图标 + 品牌色。抖音在 Simple Icons 里没有独立图标(字节跳动自己那个音符标,跟 TikTok 视觉上基本是同一个符号),复用了 TikTok 图标改成黑色,不是瞎画。新增 `src/components/SocialPlatformIcon.tsx`。
  - **修了"账号存在但没填粉丝数就整个不显示"的问题**:`ListingCard.tsx`/`listings/[id]/page.tsx` 原来的逻辑是"过滤出有 follower_count 的账号才渲染",导致粉丝数还没填的账号(哪怕填了 handle/链接)整个图标都不出现,看起来像完全没有社交账号。改成"账号存在就显示图标,有粉丝数显示数字,没有就显示平台名占位",新增两个共用组件:`SocialStatChip.tsx`(卡片/详情页侧栏用的紧凑版)、`SocialStatCard.tsx`(个人主页用的大版,图标+大号数字+平台名/账号名,点击跳转到账号链接)。
  - **`/sellers/[id]` 个人主页从纯文字列表改版成"创作者主页"**:加了顶部 banner(纯色渐变条,数据库没有 banner 图字段,先用 CSS 占位,不是真的图片上传功能)、头像放大压在 banner 下面、社交账号列表换成上面那个 `SocialStatCard` 网格,广告位列表标题从"Listings"改成"Ad spaces"跟其他地方统一。
  - **新增卖家个人网站字段**(`seller_profiles.website_url`,SQL 见 README):跟 `social_accounts` 分开(那是具体平台账号,这个是没有平台归属的个人站点),只在 `/sellers/[id]` 个人主页展示一行链接,不上列表卡片/listing 详情页侧栏(空间紧,买家在那两处更关心平台粉丝数)。`ProfileForm.tsx` 新增输入框,支持不带协议头直接填 "example.com"(服务端 `normalizeWebsiteUrl()` 自动补 `https://` 并校验)。
  - **这轮改动依赖数据库操作,都需要人工去 Supabase 后台执行**(这个开发环境连不上真实 `myadsspace` 项目,SQL 已写进 README"MVP v2 数据库变更"一节):①`social_accounts` 表的 UPDATE RLS 策略在线上库要么缺失要么跟 README 记录的不一致(用户编辑已有账号时反复报"Save failed — the database rejected the request",没有具体数据库报错、只是影响 0 行,是 RLS 静默拒绝的典型信号),补了一条幂等的 `drop policy if exists` + `create policy` 重建这条策略。②新增 `seller_profiles.website_url` 列时,顺带发现 `seller_profiles` 这张表**从建表到现在,这份 README 就没记录过任何 RLS 策略**(bio/avatar_url/content_categories 现在能存能读,大概率是线上库某个时间点手动配的,配的是什么没人能确认),预防性地补了三条幂等的 SELECT/INSERT/UPDATE 策略,跟 `social_accounts` 用同一套标准,避免同样的"文档缺失导致的 Save failed"在新列上重演。这几条 SQL 没跑之前,编辑已有社交账号会一直失败,保存网站字段也可能因为同一类问题失败。
  - 验证方式:`npm run build` + `npx eslint src` 全绿(改了哪些文件就 lint 哪些)。这个开发环境连不上真实 Supabase 项目,没跑起真实 dev server 用浏览器测过,SQL 也没有实际执行验证过。

- **紧接着上面那条,用户看了实际效果后追加了四点反馈,一并改了**:
  - **banner 改成通栏全宽**:之前 banner 是放在 `max-w-7xl` 容器里面的一个圆角矩形,两侧留白很明显,不是真的"通栏"。把 banner 挪到容器外面,变成页面顶层的独立全宽 block(`h-40 sm:h-56`,没有 `rounded`/`max-w`),下面的头像/简介/社交卡片/广告位网格仍然包在原来的 `max-w-7xl` 容器里,靠负 `margin-top` 让头像压在 banner 底边上,视觉效果不变。
  - **banner 从纯 CSS 占位改成真能上传**:新增 `seller_profiles.banner_url`(SQL 见 README),`ProfileForm.tsx` 加了一个上传入口(预览 + 文件选择,复用跟头像一样的 `ad-space-photos` bucket,路径 `{user_id}/banner/{uuid}.ext`),`updateProfileAction` 里新增 `uploadImage()` 抽出来的上传逻辑(头像/banner 共用同一段代码,不是复制粘贴两遍)。**用户特别要求"重新上传要删掉旧文件"**,不然旧图会一直占着 storage 空间:改完的逻辑是先查一次当前 `seller_profiles.avatar_url`/`banner_url`,上传新文件成功、且新的 seller_profiles upsert 也成功落库之后,才用 `storagePathFromPublicUrl()`(从公开 URL 反解出 bucket 内相对路径)把旧文件从 storage 删掉——顺序很重要,只有确认新链接已经安全存库,才删旧文件,不然存库这步万一失败,页面会指向一个已经被删掉的文件。这个清理逻辑对头像也一并补上了(以前换头像从来不删旧文件,是同一类遗留问题,顺手一起修了,不是本来就要求的但成本几乎为零)。
  - **社交账号展示去掉多余的平台文字**:用户反馈"有 icon 就不需要再写 YouTube/小红书这些字"。`SocialStatChip.tsx`(卡片/详情页侧栏用)之前没填粉丝数时会 fallback 显示平台英文名当占位文字,改成没有数字就只显示裸图标,不再有文字。`SocialStatCard.tsx`(个人主页大卡片)之前图标下面写的是"平台名 · 账号 handle",平台名去掉了,只保留 handle(如果有的话),因为 handle 是真实信息、平台名是图标已经表达过的冗余信息。
  - **粉丝数还是没显示,不是新 bug**:这条属于用户还没跑上一轮消息里给的 SQL(`social_accounts` UPDATE 策略 + `seller_profiles` 三条策略),数据库层面粉丝数大概率还是存不进去,不是这轮代码改动能解决的,回复里让用户先跑 SQL、再去 Dashboard 重新保存一次账号。
  - 验证方式:`npm run build` + `npx eslint src` 全绿。跟前面几轮一样,这个开发环境连不上真实 Supabase 项目,SQL 没有实际跑过,banner 上传/删除逻辑也没有用真实 storage bucket 测试过,上线后建议先用真实账号测一次"上传 banner → 换一张 → 确认 storage 里旧文件真的被删了"。

- **用户指出一个真实的产品风险,加了"这条广告具体投放在哪个账号"这个字段**:之前广告网格卡片/listing 详情页展示的是"卖家名下所有社交账号"(比如同时显示 YouTube + Xiaohongshu 两个图标),用户指出这样买家很容易误以为花一份钱能同时在卖家所有社交媒体投放,容易产生纠纷——一条 listing 实际上只对应一个具体的投放位置。
  - **新增 `listings.social_account_id`(可空,外键指向 `social_accounts.id`,`on delete set null`)+ `listings.is_website_placement`(布尔)**,两者互斥(不建 check 约束,靠表单单选下拉框保证互斥),都是空/false 就是"未指定/其他"。SQL 见 README"MVP v2 数据库变更"一节。
  - **`ListingForm.tsx` 新增必填的 "Ad placement" 单选下拉框**:选项是卖家自己名下的全部 `social_accounts`(标签"平台 · handle")+(如果填过 `seller_profiles.website_url`)"My website" + 兜底的 "Other / not tied to a specific account"。`createListingAction` 服务端重新校验一遍(不相信前端传来的 account id,重新查一次这个用户名下的 `social_accounts` 确认真的是他自己的账号)。
  - **展示逻辑跟着改**:`src/lib/listingCards.ts` 的 `attachSellerInfo` 从"批量查卖家的全部社交账号"改成"批量查这批 listing 各自 `social_account_id` 指向的那一个账号"(`ListingCardData.socialAccounts` 数组字段改名成 `placementAccount`,单数、可能是 null),`ListingCard.tsx`/`listings/[id]` 详情页的卖家信息栏都改成只显示这一个账号(或者 `WebsiteStatChip` 表示投放在网站上)。**`/sellers/[id]` 个人主页的"Social reach"板块不受影响,仍然展示卖家的全部社交账号**——那是买家了解"这个创作者整体是什么样的人"该看的地方,跟"这一条具体广告投放在哪"是两个不同的问题,用户原话确认了这个区分("个人页面可以是所有社媒都展示,广告网格和广告详情只显示他填的那个")。
  - **新增 `WebsiteStatChip`**(`src/components/SocialStatChip.tsx` 里跟 `SocialStatChip` 放一起):跟社交账号那个 chip 视觉一致,图标换成通用的地球图标(`react-icons/hi2` 的 `HiOutlineGlobeAlt`),没有粉丝数(网站没有"粉丝"这个概念),纯粹是"这条广告投放在卖家自己网站上"的标识。
  - **已知限制,写进了 README"已知欠缺"一节**:这两列只有新建 listing 的表单在填,这次改动之前已经发布的老 listing(包括用户自己测试用的那条"Prime Foreground Desk Placement")这两列都是 null/false,而且**项目目前没有 listing 编辑页**(`/dashboard/my-listings` 只是列表,这是之前就记录过的已知欠缺),老 listing 没有任何入口能补填这个字段,卡片上会一直显示"未指定平台",不是这次改动没做完,是依赖一个还没做的编辑页——如果用户需要,下一步可以先做一个只让改这一个字段的轻量编辑入口,不用等完整的 listing 编辑页。
  - 验证方式:`npm run build` + `npx eslint src` 全绿。没有真实 Supabase 数据可以测试发布流程本身。
- **同一轮,用户反馈的另外两点,一并处理**:①banner 图从"纯 CSS 占位"确认已经在上一条做成可上传的了,这次追加反馈的是希望个人主页 social account 展示格式是"icon + @handle + 数字 followers"内联一行,现有 `SocialStatCard` 已经是图标在上、数字居中、handle 在下的堆叠卡片布局,这次没有再改版式(用户这条反馈更像是复述"这样清楚"的效果描述,不是明确要求改布局,先按现状处理,如果用户后续明确要内联一行布局再改)。②**粉丝数依然没有显示**,复查了一遍前端代码(输入框/解析函数/保存逻辑/展示逻辑)没有发现新的代码 bug,跟前几轮的结论一致——大概率是 README 里给的那几段 SQL(`social_accounts` UPDATE 策略、`seller_profiles` 三条策略)用户还没有实际去 Supabase 后台跑,回复里请用户确认具体是"编辑时报错 Save failed"还是"保存后没报错但就是不显示数字"这两种情况,方便下一步精确定位是权限问题还是别的什么。

- **加了"复制已发布广告"功能,不是完整的编辑页,但解决了用户实际要的问题**:用户明确要求"卖家可以复制已经发布的广告进行编辑,比如替换封面图,加上提示检查广告的位置"——背景是上一条刚加了"一条 listing 只能绑一个平台"的规则,如果卖家想把同一个广告投放到多个平台(比如 YouTube 和 TikTok 各发一条),得把标题/简介/价格/类目重新填一遍,很麻烦;复制能省掉这些重复劳动,同时靠明显的提示防止卖家复制完忘记改投放平台(比如复制了 YouTube 那条,结果新的一条也显示投放在 YouTube,实际上是想发 TikTok)。
  - **没有做成真正的"编辑已发布 listing"**(`/dashboard/my-listings` 仍然没有编辑入口,这个已知欠缺没变),做的是"用另一条 listing 的内容预填一个全新的发布表单":`/dashboard/my-listings` 每条 listing 旁边加了 "Duplicate" 链接,跳到 `/dashboard/new-listing?from={listingId}`;`new-listing/page.tsx` 收到 `from` 参数后查那条 listing,**校验 `seller_id` 真的是当前登录用户自己的**(RLS 本身会放行任何人读取别人 `status=active` 的 listing,这里要额外挡一下,不然能拿别人的广告内容当模板抄)。真正提交表单时走的还是原来的 `createListingAction`,插入一条全新的行,不会碰到原来那条 listing。
  - **`ListingForm.tsx` 新增 `duplicatedFromTitle` 提示条**:复制进来时顶部会出现一个琥珀色提示框,写清楚"这是复制自《xxx》,每条广告只能对应一个平台,如果这条要发在别的平台,记得改下面的 Ad placement,需要多平台就发多条 listing,别指望一条覆盖所有平台"——Ad placement 下拉框本身默认还是会带出原来那条的平台(方便只是想改改文案/价格、平台没变的场景),不是清空强制重选,靠这条醒目提示 + 本来就有的必填校验来防止"复制完忘记改"这个操作失误。
  - **媒体(图片/视频)处理**:复制过来的图片默认整批带过来(卖家不用重新传一遍),但每张图右上角加了悬浮显示的 ✕ 删除按钮(纯前端 `useState` 管理,删了就不会提交对应的隐藏 input),配合原来就有的"再传几张新的,追加在后面"的上传框,卖家可以删掉第一张(默认是封面图)、再传一张平台专属的截图当新封面,达到"替换封面图"的效果,不用做拖拽排序这种更重的功能。`createListingAction` 服务端对提交上来的 `existing_media` 做了校验——只认真的是这个用户自己在 `ad-space-photos` bucket 底下的文件路径(`/object/public/ad-space-photos/{user_id}/...`),不会无脑相信前端传来的任意 URL 字符串。
  - 验证方式:`npm run build` + `npx eslint src` 全绿。这个开发环境没有真实 Supabase 数据,没有实际跑通"复制 → 改平台 → 发布"这条流程。

- **加了真正的 listing 编辑 + 删除,补上之前用 Duplicate 绕开的那个缺口**:用户明确要求"需要建一个编辑按钮和删除",不再满足于上一条的 Duplicate 曲线救国方案。
  - **`/dashboard/my-listings/[id]/edit`**(新增 `page.tsx` + `actions.ts`):复用 `ListingForm.tsx`(发布/复制/编辑三个场景现在共用同一个表单组件),也把 `new-listing/actions.ts` 里那一大段字段校验逻辑抽成了 `src/lib/listingFormValidation.ts` 的 `parseListingFormFields()`,创建和编辑两边调同一份,不重复写。
  - **图片支持单张删除**:`ListingForm.tsx` 的"已上传媒体"从纯预览列表改成每张图带悬浮 ✕ 按钮(客户端 `useState`,配合隐藏的 `existing_media` input 告诉服务端要保留哪些),这样删掉旧封面、传一张新的就行,不用做拖拽排序。服务端只认提交上来的 `existing_media` 里真的是这个用户自己 storage 路径下的文件,不会无脑信任前端传来的任意 URL。
  - **编辑 `active` 状态的 listing 会自动退回 `pending_review`**:这是主动加的一条安全考虑,不是用户提出来的细节——内容审核通过之后又被卖家改了如果不重新审核,等于审核形同虚设,是"顺手补的一个安全洞"(2026-09-18 早些时候那次 `listings.status` REVOKE)想防的同一类问题在编辑功能这个新口子上重新出现。`status` 这一列已经被 REVOKE 挡住普通登录态写入了,这里用 `createServiceClient()`(service_role)专门写这一列,但查询上还是老实带了 `seller_id`/原状态两个条件兜底,没有因为绕开 RLS 就变成一个通用的"改状态"后门。**`draft`/`rejected` 编辑后状态不变,不会自动重新排队进审核**——这个范围控制是刻意的,README"已知欠缺"里补了说明,不是漏做。
  - **删除**(`/dashboard/my-listings` 新增 "Delete" 按钮,复用 `ConfirmSubmitForm`):`listing_orders.listing_id` 引用 `listings` 时没设 `on delete cascade`,所以有订单历史(哪怕很久以前已完成)的 listing 删不掉,Postgres 会报外键约束错误——这是故意保留的行为(防止买家历史订单突然指向不存在的 listing),代码识别这种情况转成友好提示,不是把原始报错甩给用户。删除成功后顺手清掉这条 listing 在 storage 里的图片文件,不留垃圾。
  - **顺手做的小重构**:把 `dashboard/profile/actions.ts` 里原来私有的 `storagePathFromPublicUrl()` 挪到了新建的 `src/lib/storage.ts`,这次删 listing 图片时复用,不用再写一遍一样的 URL 解析逻辑。
  - 验证方式:`npm run build` + `npx eslint src` 全绿。这个开发环境连不上真实 Supabase 项目,"编辑 active listing 后状态真的退回 pending_review"、"删有订单的 listing 真的会被拒绝而不是误删"这两条关键路径没有用真实数据跑过,上线后建议人工各测一次。

- **用户测试新加的编辑功能,编辑一条已经 active 的 listing 保存时报错**:跟之前 `social_accounts`/`seller_profiles` 那两次一模一样的套路——没有具体 Postgres 错误,只是 0 行受影响,RLS 静默拒绝的信号。检查了一遍 `updateListingAction`(`src/app/dashboard/my-listings/[id]/edit/actions.ts`)代码本身没有问题(权限校验、字段更新、service-role 状态回退那段逻辑都没有 bug),结论跟前两次一致:线上库里 `listings` 表实际配置的 RLS 策略,大概率跟这份 README 记录的对不上。补了一段幂等的 `drop policy if exists` + `create policy`,把 `listings` 表全部四条策略(select/insert/update/delete)重建一遍,SQL 见"MVP v2 数据库变更"一节。**这不是代码改动,纯粹是 SQL,需要用户自己去 Supabase 后台跑。**

- **新增 `/creators` 创作者主页(网格展示)**:用户要求做一个"创作者页面",网格展示已注册的创作者——头像、名字、各社交平台粉丝数、广告数、价格(from 最低价或价格区间)、内容方向。落地方案:只展示**至少有一条 `active` listing** 的卖家(跟首页/`/listings` 现有的"只显示 `active`"规则保持一致,`draft`/`pending_review`/`rejected`/`removed` 状态的卖家不会出现在这个网格里,这样"广告数"、"价格 from"这些字段才有真实意义,不会出现一个 0 广告的空卡片);排除 `profiles.is_banned` 的账号,不在公开发现页露出。新增 `src/lib/creatorCards.ts`(`getActiveCreators`,仿照已有的 `listingCards.ts` 那套"批量查、按 id 建 Map 拼装"的写法,一次查完 `listings`/`profiles`/`seller_profiles`/`social_accounts` 四张表,不是每个卡片单独查):按 `seller_id` 分组统计广告数,价格区间取"该卖家最便宜那条 listing 的币种"内部的 min/max(卖家如果同时挂了 USD 和 GBP 的 listing,不会把两种货币混在一个区间里显示,只显示最低价那个币种的区间)——只有一条 listing 时 min=max,卡片上就显示单价而不是区间。排序:认证卖家优先,同等条件下按广告数量降序,再按显示名字母序。新增 `src/components/CreatorCard.tsx`(头像/认证角标/内容领域标签复用 `LISTING_CATEGORY_LABELS`、社交平台粉丝数复用现成的 `SocialStatChip`,最多显示 4 个社交账号 + "+N more",避免账号多的卡片撑爆网格),卡片整个可点击跳到已有的 `/sellers/[id]` 主页(没有另建一套"创作者详情页",复用现成路由)。`src/app/creators/page.tsx` 走跟 `/listings`/首页一样的 Server Component + `createClient()` 模式。`Header.tsx` 导航加了一个 "Creators" 链接,放在 "Ad spaces" 前面。
  - 验证:`npm install` + `npm run build`(手动传假的 `STRIPE_SECRET_KEY`/`SUPABASE_*`/`NEXT_PUBLIC_SITE_URL`,这个开发环境没有真实值)全绿,路由列表确认 `/creators` 生成;`npx eslint src` 无报错。这个环境连不上真实 Supabase 项目,没有用真实账号数据跑过页面(比如多币种卖家的价格区间显示、4 个以上社交账号的 "+N more" 这两处边界情况),上线后建议找一个有多条 listing、多个社交账号的真实卖家账号看一眼效果。

- **上面那条 "Creators" 页面改名成 "Publishers"**:用户反馈"发布广告的卖家叫 creator 不够准确"——这批卖家不一定自己生产内容(可能只是账号/网站运营者),"creator" 偏营销包装,"publisher"(发布方/刊登方)更贴合这个产品里"发布广告位供购买"这个动作本身,不预设卖家一定是内容创作者。改动范围:`src/app/creators/` → `src/app/publishers/`(路由 `/creators` → `/publishers`)、`CreatorCard.tsx` → `PublisherCard.tsx`、`creatorCards.ts` → `publisherCards.ts`(`getActiveCreators`/`CreatorCardData`/`CreatorPriceRange` 相应改名),页面标题/文案/`Header.tsx` 导航链接文字同步从 "Creators" 改成 "Publishers"。**只改了这一个新页面的措辞,没有动 README/其他老页面里本来就在用的"创作者"这个泛指说法**(比如首页文案"from creator bio-links"、`ListingForm.tsx`/`ProfileForm.tsx` 里问卖家"你是什么类型的创作者"那些既有文案)——那些是这次改动之前就有的产品用词,用户这次反馈针对的是这个新导航入口的标签,不是要求全站改名。
  - 顺手做的另外两件小事(同一次用户反馈里一起提的):①`Header.tsx` 导航文字(Ad spaces / Publishers / Log in,以及登录后 `UserMenu` 里显示的账号名)从常规字重改成粗体(`nav` 容器上加 `font-bold`)。②发现 `src/app/globals.css` 里 `body` 的 `font-family` 写死成 `Arial, Helvetica, sans-serif`,而 `layout.tsx` 其实已经用 `next/font/google` 正确接入了 Geist(Vercel 出的免费开源字体,SIL Open Font License,可商用)、`@theme inline` 也定义好了 `--font-sans` 变量——只是 `globals.css` 没有引用这个变量,导致 Geist 从来没有真正生效,全站实际渲染的是系统 Arial。改成 `font-family: var(--font-sans), Arial, Helvetica, sans-serif;`,不用额外引入新字体或额外的字体文件,复用已经打包好的 Geist,系统字体只作为字体文件加载失败时的兜底。
  - 验证:`npm run build` + `npx eslint src` 全绿,路由列表确认 `/publishers` 生成、`/creators` 不再存在。

- **新增全站 Footer,里面放"联系我们"表单 + Terms/Privacy 链接**:用户要求。之前这个项目完全没有 footer,`layout.tsx` 只有 `<Header />` + `<main>`。新增 `src/components/Footer.tsx`(三栏:品牌+标语、Legal 链接、联系表单),挂进 `layout.tsx` 的 `<main>` 后面,所有页面都会带上。
  - **联系表单**:新增 `contact_messages` 表(SQL 见 README"MVP v2 数据库变更"一节末尾),不登录也能提交(表单不挂靠任何 listing/user_id,提交人是谁完全靠自己填的 name/email,不做身份校验)。故意只给 `anon`/`authenticated` 开 insert 策略,不开 select——提交人自己也读不回来,避免任何登录用户能拿别人的联系表单内容当自己的看。`src/lib/contact/actions.ts`(`submitContactMessageAction`,校验 name/email/message 都非空 + 简单邮箱格式正则)+ `src/components/ContactForm.tsx`(`"use client"`,`useActionState`,跟现有 `ContactSellerForm.tsx` 是同一套写法)。
  - **新增 `/admin/contact`**:只读列出 `contact_messages`(最近 200 条,跟 `/admin/orders` 同一个套路),用 `createServiceClient()` 读(这张表对 `authenticated` 没开 select 策略,普通登录态客户端读不到,只有 service_role 能看),回复走管理员自己点邮箱地址发邮件,没做站内回复。`admin/layout.tsx` 的导航加了一个 "Contact" 标签页。**这不是 MVP v2 产品方案原来范围里的东西**,是这次为了让联系表单提交后"有地方能看到"而顺手加的,不加的话表单提交了也没人知道,等于没做完。
  - **新增 `/terms`、`/privacy`**:footer 链接指向的落地页。这两页在这次之前完全不存在(README"平台责任边界"一节明确写过"这轮讨论只做了口头结论,没有落地成正式的 Terms of Service / Privacy Policy"),这次把已经拍过板的规则(托管放款流程、12% 佣金、$0.99 最低价、线下交易不受保护、Stripe 覆盖地区不含中国大陆)转成大白话条款文字放上去,**没有编造任何新规则**——只是把 README 里已经写死的决策搬到面向用户的页面。Privacy 那页只写了代码里真实存在的数据收集行为(Supabase Auth/profile 字段/listing 内容/私信/联系表单,Stripe 处理支付),额外确认了一遍代码库里目前没有接入任何第三方 analytics/广告追踪脚本才敢写"我们目前不用第三方追踪"这句话。**两页顶部都加了黄色提示条,写明"还没有律师审过,不是最终法律文本"**——这两份内容是我(AI)根据已经拍板的产品决策整理的草稿,不构成正式法律文件,上线前必须找律师过一遍,不能只看这次改动就当成合规的 ToS/Privacy Policy 直接生效。
  - 验证:`npm run build` + `npx eslint src` 全绿,路由列表确认 `/terms`/`/privacy`/`/admin/contact` 都生成了。这个开发环境连不上真实 Supabase 项目,`contact_messages` 表的 SQL 没有跑过、表单提交到 `/admin/contact` 能不能看到这条链路没有用真实数据验证过,上线后需要先在 Supabase 后台执行这段 SQL,再人工提交一次测试一下。

- **新增 `/publishers/join` 招募落地页**:背景是用户反馈 Publishers 页现在一个真实卖家都没有,问"要不要空建几十个卡片让人来 claim,还是一个个手动去邀请真人"。回复建议**不要做空卡片**——现在是走 Stripe 托管的真金白银交易,买家逛到的每张卡片都暗示"可以直接下单",空壳卡片(哪怕标"待认领")等于伪造供给,一旦被买家发现是空的,伤的是刚起步的信任,而且按 Publishers 页现在的实现,空卡片要显示出来还得配套造假 listing,风险更大。建议改成**手动一个个邀请真实创作者**(老牌 marketplace 冷启动的标准打法),但外联总得有个链接甩过去,不能只发一句话——于是这次做的是这个链接指向的落地页本身。
  - 内容:大白身话讲清楚"免费加入、免费发布、托管放款安全、自己定价、能被品牌方找到",配 3 步"How it works"和 4 条价值点,两处 CTA 按钮都指向注册(未登录)或直接发布页(已登录)。纯静态文案,**没有做"预注册/等待名单"这类中间表**——跟这次讨论里"要不要做预注册页"这个问题的答案一致:这个平台注册本身已经免费、不需要先连 Stripe 才能建 `draft` listing,预注册只是多一层"以后再联系你"的等待,反而增加转化损耗,不如直接导去能立刻用的免费注册。
  - **顺手给 `/login`、`/register` 加了 `?next=` 支持**:之前这两个 action 硬编码 `redirect("/listings")`,如果只是这样,从 `/publishers/join` 点"加入"注册完会先落到浏览页,还得自己找到"发布"入口,等于平白多一步流失。新增 `src/lib/safeRedirect.ts`(`safeRedirectPath`,只认站内相对路径开头的 `/`,拒绝 `//evil.com`/绝对 URL,防止 `next` 参数被拿去做开放重定向),`registerAction`/`loginAction` 从 `formData` 读 `next`(`RegisterForm`/`LoginForm` 各加了一个隐藏 input),校验通过就跳那里,不传或不合法就还是原来的 `/listings`。两个表单之间互跳的"没有账号?去注册"/"已有账号?去登录"链接也会把 `next` 带过去,保证从 `/publishers/join` 进来的人不管中间经过注册还是登录,最终都落在 `/dashboard/new-listing`。
  - Publishers 页(`/publishers`)顶部加了一个常驻的 "List your ad space free →" 按钮、空状态文案也从"check back soon"改成带 CTA 按钮的"be the first to get discovered",两处都链到这个新落地页,不是只能靠外部私信才能到达。
  - 验证:`npm run build` + `npx eslint src` 全绿;另外起了本地 dev server(`next dev`,假 Supabase/Stripe 环境变量),用 Playwright 截图看了 `/publishers/join`、`/publishers`、首页 footer 三处,确认布局、字体(Geist 生效)、按钮跳转文案都正常,截图里一个 emoji(🎛️)在这台机器的无头浏览器里字体缺字显示成方块,换成了更通用的 🎯,避免真实用户设备上可能出现同样的缺字问题。`?next=` 这条重定向链路没有用真实 Supabase 账号跑通过完整"注册成功 → 落到 new-listing 页"这一步,上线后建议人工从 `/publishers/join` 走一遍。

- **footer 的联系表单挪到独立的 `/contact` 页**:用户反馈截图——name/email/message 三个输入框 + 按钮直接堆在 footer 里,视觉上不像样子。表单组件(`ContactForm.tsx`)本身没改一个字,只是新建 `src/app/contact/page.tsx`(居中单栏布局,跟 `/login`、`/register` 页同一个模式)把它放进去,`Footer.tsx` 从"品牌/Legal/Contact us 表单"三栏改成"品牌/Links"两栏,Links 里 Terms of Service、Privacy Policy、Contact us 三个链接摆一起,点 "Contact us" 跳 `/contact`。
  - 验证:`npm run build` + `npx eslint src` 全绿,`/contact` 路由生成;起本地 dev server 用 Playwright 截图确认新 footer(两栏,没有表单)和 `/contact` 页(表单完整,居中布局)都正常。

- **新增 `profiles.username`,支持好记的个人主页链接**:用户拿 7smile-Linda 的主页举例——`hereforads.com/sellers/32537926-0d6d-41a4-b4d6-770a6257cce8` 这种 UUID 链接不方便发到别的平台主页或发给客户,想要 `hereforads.com/7smile-linda` 这种。落地方案:
  - `profiles` 加一列可选的 `username`(SQL 见 README"MVP v2 数据库变更"末尾),默认 `null`,老账号/没设置的人不受影响,继续只有 `/sellers/[id]` 这一个入口——**没有做自动跳转/canonical**,两个链接长期并存,不强迫已经分享出去的旧链接失效。
  - 新增 `src/lib/username.ts`(`normalizeUsername`):校验格式(小写字母/数字/连字符,3-30 位,首尾不能是连字符,存之前统一转小写,避免大小写变体互相抢注、也避免用 `ilike` 查询时被特殊字符当通配符解析的麻烦)+ 一份保留字表(`RESERVED_USERNAMES`,包含 `login`/`admin`/`dashboard`/`publishers` 等所有当前顶层路由,外加 `about`/`blog`/`help` 这类给以后预留的)。**保留字表是防用户"设了一个链接结果打不开自己主页"这种体验问题,不是安全兜底**——Next.js 本身"同级静态路由永远优先于动态路由"这条规则已经保证了哪怕漏保留了什么词,真撞上时赢的也是那个静态页面,不会有人的 profile 意外覆盖掉 `/login` 之类的真实页面。数据库那边也补了一条 `check` 约束镜像同一份格式规则,防止校验被绕过(比如有人拿自己 session 直接调 REST API)。
  - `/dashboard/profile` 表单(`ProfileForm.tsx`)加了一个 "hereforads.com/" 前缀 + 输入框的字段,`updateProfileAction` 里解析/校验,唯一性冲突时捕获 Postgres `23505` 错误码转成"这个用户名已经被占用"的提示,而不是把原始数据库报错糊给用户。设置成功后表单下面会出现一个"View your public profile →"的链接。
  - **把 `/sellers/[id]` 页面的渲染逻辑抽成了 `src/components/SellerProfileView.tsx`**(纯展示组件,接 profile/sellerExtra/accounts/listings 四个 prop),新增的 `src/app/[username]/page.tsx` 按 `username`(小写)查到 profile 之后复用同一个组件,两个路由渲染的是同一个页面,只是查询方式不同(按 `id` 还是按 `username`)。`src/app/sellers/[id]/page.tsx` 相应瘦身,只剩数据查询部分。
  - **顺手把两处遗留的裸 `<a href="/dashboard/...">` 内链改成了 `<Link>`**(`src/app/listings/page.tsx`、`src/components/ListingForm.tsx`):加了 `/[username]` 这个顶层动态路由之后,`npx eslint src` 突然在这两处报了 `@next/next/no-html-link-for-pages`(具体原因没深究,大概率是这条规则依赖 `next build` 生成的路由 manifest 来判断"这个 href 是不是站内已知页面",加了新的顶层动态段之后触发了它重新识别出这两处本来就该用 `Link` 的内链)——不是这次改动引入的新问题,是本来就该修的技术债被顺带暴露出来,改起来也没风险,一起改了避免 lint 不过。
  - 验证:`npm run build` + `npx eslint src` 全绿,路由列表确认 `/[username]` 生成;起本地 dev server 确认 `/login`、`/admin`、`/publishers` 等所有已有静态路由照常返回 200/307(没有被新的 `/[username]` 动态路由意外吞掉),访问一个不存在的用户名(`/some-random-user`)正确返回 404 而不是 500。这个开发环境连不上真实 Supabase 项目,`profiles.username` 这列的 SQL 没跑过,"设置用户名 → 唯一性冲突提示 → 访问 `/7smile-linda` 看到主页"这条完整链路没有用真实数据验证过,上线后需要先在 Supabase 后台执行这段 SQL,再人工测一遍。

## 2026-09-19

- **用真实账号验证了 `/[username]` 好记链接这条链路**:用户在 Supabase 后台直接跑了 `update public.profiles set username = '7smile-linda' where id = '...'`(见 2026-09-18 那条新增的 `profiles.username` 迁移),`https://hereforads.com/7smile-linda` 能正常打开她的主页了。中间排查过程记录一下,免得以后遇到类似"设置了但打不开"再走一遍弯路:先确认 SQL 迁移真的跑了(查出来 `username` 是 `NULL` 而不是报错"列不存在",说明列本身建好了,只是这个用户没设置值)——**这条本身不是 bug,是这个字段默认是空的,新功能刚上线时老用户都还没有值**。
- **顺手确认了网站链接图标 + www 前缀那条(2026-09-18 晚些时候那次改动)线上效果**,配合 `/dashboard/profile` 页面表单一起验证过,没有另开新问题。
- **用户反馈发了条 footer 联系表单消息,`/admin` 总览页没看到**:排查下来不是 bug,是这版 Overview 总览页压根没给 `contact_messages` 留位置——`contact_messages` 表本身有数据(SQL 查出来能查到那条提交记录),`SUPABASE_SERVICE_ROLE_KEY` 也是好的(`/admin` 总览页其他统计数字、`/admin/orders` 等页面数据都正常,证明 service_role key 没问题),纯粹是这批新加的 `/admin/contact` 只有顶部导航栏一个 "Contact" 标签页入口,总览页四个统计卡片(pending listings / total users / banned users)里没有它,管理员如果不知道还有这个单独的标签页,很容易以为"表单提交了但系统没收到"。补了第四张 "Contact messages" 统计卡片(`src/app/admin/page.tsx`,查 `contact_messages` 表的总行数,点进去跳 `/admin/contact`),网格布局从 `sm:grid-cols-3` 改成 `sm:grid-cols-2 lg:grid-cols-4` 塞下第四张卡片。
- 验证:`npm run build` + `npx eslint src` 全绿。这条卡片的计数逻辑在这个开发环境没法接真实数据跑一遍(连不上 Supabase),但查询写法跟同一个文件里另外三张卡片完全一样的模式,风险很低。

### 今天(9-18 晚到 9-19)的工作小结

写在这里方便下一个 session(或者人)5 分钟内知道"发生了什么",不用把上面一条条 bullet 全看一遍。详细原因/取舍都在上面对应日期的条目里,这里只列结论。

**上线了什么(6 个 PR,全部已合并进 `main`):**
1. 新增 `/publishers` 创作者/卖家网格页(展示头像、社交粉丝数、广告数、价格区间),原来叫 "Creators" 当天改名成 "Publishers"(卖家不一定是内容创作者,"publisher" 更贴合"发布广告位"这个动作)
2. 全站加了 footer(品牌 + Terms/Privacy/Contact us 链接),新增 `/terms`、`/privacy`(大白话条款,标了"还没律师审过")、`/contact`(联系表单落地页,提交存进新表 `contact_messages`)
3. 新增 `/publishers/join` 招募落地页——因为 `/publishers` 现在还没有真实卖家,用户明确否决了"造空卡片给人 claim"这个方向(伪造供给,买家发现是空的会砸信任),改成一个可以直接发给潜在创作者的外联链接。顺带给 `/login`、`/register` 加了 `?next=` 支持,注册完直接落到发布页而不是默认的浏览页
4. 新增 `profiles.username`,支持 `hereforads.com/{username}` 这种好记链接(替代分享 UUID 链接),`/sellers/[id]` 和新的 `/[username]` 现在共用同一个 `SellerProfileView` 组件
5. 卖家主页的网站链接加了地球图标 + `www.` 前缀
6. `/admin` 总览页加了第四张 "Contact messages" 统计卡片(排查"消息发了但仪表盘没显示"这个反馈时发现总览页压根没给联系表单留入口)

**已经跑过的 Supabase SQL(用户已确认,不用再提醒执行)**:`contact_messages` 建表、`profiles.username` 列 + unique/check 约束。**这两条之外、README 里记录的其余 MVP v2 SQL 是不是都跑过,这次没有重新逐条核对**——线上账号数/listing 数据看着是正常的,大概率早就跑过了,只是没有专门确认。

**还没处理 / 下一步**(按优先级粗排):
- **`/publishers` 现在还是空的**——这是接下来最要紧的事,不是代码问题:需要 CTO 拿着 `hereforads.com/publishers/join` 这个链接去外联真实创作者,一个个邀请,参考 WORKLOG 昨天讨论的"不做空卡片"结论
- **Terms of Service / Privacy Policy 还没给律师看过**——两个页面顶部都留了黄色提示条,正式对外宣传/大规模获客之前应该找人过一遍,尤其是托管放款/佣金那几条涉及钱的表述
- **`/dashboard/profile` 设置用户名这条路径,只验证过"直接在 Supabase 后台 SQL 改",没有真人从头点过表单**——建议找一个真实账号走一遍:填用户名 → 存 → 跳转确认 → 故意跟别人重名试一次看报错提示对不对
- **联系表单没有已读/回复状态**——`/admin/contact` 现在是纯列表,消息一旦看过没有"已读"标记,回复也只能自己点邮箱手动发邮件,消息一多容易漏。以后如果用量上来了,值得加个 `status`/`read_at` 字段
- **没有提醒老用户"你还没设置好记链接"**——`username` 是新加的可选字段,已经注册的卖家(包括 7smile-Linda 这种)默认都是空的,除非自己想起来去 `/dashboard/profile` 设置,或者像这次一样找人直接在后台 SQL 改。以后可以考虑在 `/dashboard/profile` 页面加一句提示,或者卖家有 listing 但没 username 时在 dashboard 首页提醒一下
- **OG 分享图还是拿 `logo.png` 这张窄长 wordmark 顶的**(老问题,不是这次引入的,顺手再记一遍免得又被忘掉)——分享到社交媒体/群聊缩略图不好看,以后可以用 `next/og` 单独做一张 1200×630 的

- **同一天再往后,另一个 session 做了一轮更大的改动:Guest 结账、发布流程整个改成免审核、Price Card。9 个 PR(#26–#34)全部已经用户自己合并进 `main`**——这个 session 每次改完推送后,PR 都被极快地(几分钟内)合并掉了,导致好几次要先 `git fetch origin main` 发现自己的分支已经落后、`git rebase origin/main` 之后才能继续推下一版,这是这轮工作流程上的一个特点,不是异常,以后接手类似"改一堆小的反馈驱动的调整"的活儿时预期到这一点。详细决策记录见 README 对应章节标题(小结见下面),这里只按 PR 顺序列一遍:
  - **#26 Guest 结账(不强制先注册)**:买家不登录也能点 "Buy now",只填邮箱;后台用 `supabase.auth.signInWithOtp()` 静默建号(不存在就建、存在就发登录链接),`src/lib/supabase/guest-checkout.ts` 的 `resolveGuestBuyerId()` 紧接着用 `service_role` 调新建的 `get_user_id_by_email()` 函数把邮箱查回 `id`。新增 `src/app/auth/confirm/route.ts`(Magic Link 落地页,`verifyOtp` 换 session)、`src/app/checkout/guest-success/page.tsx`(guest 结账成功后的免登录落地页)。**中间来回改过两版登录链接方案**:第一版想绕开"没装 custom SMTP 编辑不了邮件模板"这个 Supabase 后台限制,做了一版纯客户端解析 URL fragment 的方案;当天下午接入 Resend 当 custom SMTP 之后,又换回了 Supabase 官方推荐的 `token_hash` 方案(更简单、少一次跳转),最终代码是后者。详见 README"Guest 结账"一节。
  - **#26 附带:Guest 联系方式留底**:guest 结账时 Stripe Checkout 顺手开了 `billing_address_collection`/`phone_number_collection`(只对 guest,登录买家不开),webhook 把 `customer_details` 里的姓名/电话/地址写进 `listing_orders` 新增的三列,姓名还会回填空的 `profiles.display_name`。**这几列一度在 `/dashboard/sales` 卖家页也能看到,用户反馈"手机号不该给卖家看",改成只在 `/admin/orders` 展示**(#27 里一起改的)。详见 README"Guest 联系方式留底"一节。
  - **#27/#28 广告类型 `ad_type`**:发布 listing 新增必选的 Ad type(Static Image Ad / Video Product Placement / Product Introduction in Video / Sponsored Feature / Product Test Video / Custom),复用同一份枚举给 Price Card(见下面)。**Platform 没有像 ChatGPT 那边给的方案建议的那样改回多选**——跟 9-18 那次"一个 listing 一个投放位"的决定保持一致,继续单选,多平台打包价是明确的未来事项。类目(`Ad categories you accept`)加了一个 `any` 特殊值("接受任何类目"),跟具体类目互斥,选了就不用一个个勾。详情页布局也顺手理了一下:类目标签从标题边上挪到 Details 描述下面,`SocialStatChip` 只在 listing 详情页(不是卡片)额外加了平台文字标签。详见 README"广告类型 ad_type"一节。
  - **#27 发布免审核 + KYC 后置(这轮最大的一次产品方向调整)**:用户参考另一个"产品经理"对话(ChatGPT)的建议,决定把 HereForAds 定位成轻量工具型平台——**去掉了 Stripe KYC 和管理员审核这两道发布前置关卡**,新 listing 直接落 `active`,买家立刻能看到能买。KYC 挪到真正需要它的时刻:标记订单交付(`markDeliveredAction`)现在硬性要求 `stripe_onboarded`,因为这一步开始倒计时、最终会真的发起 Stripe Transfer(escrow 模式下钱在此之前一直在平台自己的 Stripe 账户里,技术上本来就不需要卖家提前连好 Connect 账户)。`/admin/listings` 从"发布前必经审核"变成"事后监督"(它的 Remove 功能本来就支持任意状态下架,直接复用)。发布表单新增两个必勾选框(内容授权/无版权纠纷 + 同意 Terms),时间戳存进 `listings.rights_attested_at`/`terms_accepted_at`,`src/app/terms/page.tsx` 同步改了措辞。**这条決定的技术前提**(为什么能安全去掉 KYC 前置)、**没有一起做的**(自动化内容审核)详见 README"发布免审核 + KYC 后置"一节,里面也记了一条关于"平台自己的 Stripe dispute 风险敞口,ToS 免责声明覆盖不到"的提醒,回应的是之前 9-18 "平台责任边界"那次讨论的延续。
  - **#27 顺手改的**:编辑 listing 时"只改价格不触发重新审核"这条规则(`updateListingAction` 的 `isPriceOnlyChange` 判断)在发布免审核上线的同一天就跟着废弃了(既然发布本身都不用审核,编辑也没道理卡),但中间过程写进了 git 历史,不是绕圈子,是真实的决策演进顺序。
  - **#29–#34 Price Card(个人主页价目表)**:`/sellers/[id]`/`/[username]` 页新增一块"价目表"卡片(挨着 "Social reach"),`/dashboard/profile` 新增管理板块,让卖家不用一条条发布 listing 也能给买家一个大致报价。**这是这轮里唯一一个来回改了好几版才定型的功能**,记一下演进顺序方便理解为什么最终代码长这样:①最早每行是"标题+价格"两个自由文本框→发现卖家不知道标题怎么写,改成 Ad type + Platform 两个下拉;②Platform 强制必选导致表单太长,改成可选,价格拆成金额+币种(复用发布 listing 表单那份 `CURRENCIES`,顺手挪到了 `enums.ts` 共享),加了可选的 Note 字段(给"最终价格取决于需求"这类说明用);③加了一个可选的自定义背景图,上线自测后发现效果不好(卖家上传的图容易跟站内其它卡片的极简风格不搭、还可能压低文字可读性),来回调过两次遮罩透明度,最后**当天就把整个背景图子功能拆掉了**,`PriceCard.tsx` 改成纯白/浅灰斑马纹列表。`seller_price_card_items` 这张新表的字段定义因此变过三次(README 里的 SQL 已经是最终版,不是历史上贴过的任何一版),`seller_profiles.price_card_image_url` 这一列留在数据库里没删(历史遗留,没代码再读写)。详见 README"Price Card"一节。

### 今天(guest 结账 / 发布免审核 / Price Card)工作小结

写在这里方便下一个 session 5 分钟内知道"发生了什么",详细原因见上面对应条目和 README 里点名的章节。

**上线了什么(9 个 PR,#26–#34,全部已合并进 `main`)**:
1. Guest 结账——买家不注册也能买,靠 Supabase magic link 静默建号,登录链接走 Resend(custom SMTP)发送
2. Guest 下单顺手收集姓名/电话/地址(通过 Stripe Checkout,不是自己的表单),只有 `/admin/orders` 能看,卖家看不到
3. 发布 listing 新增必选的 **Ad type**,类目加了 **Any category** 快捷选项
4. **发布 listing 不再要求 Stripe KYC、不再要求管理员审核**——直接上线,KYC 卡在"标记交付"那一步;发布表单加两个必勾选框(内容授权 + 同意 Terms)
5. 个人主页新增 **Price Card**(价目表),卖家填 Ad type + 可选平台 + 起价 + 可选备注,没有自定义背景图(试过又去掉了)

**必须确认已经在 Supabase 后台跑过的 SQL(这次没有逐条重新核对,按功能列一遍,建议按这个顺序检查)**:
1. `get_user_id_by_email()` 函数(见 README"Guest 结账")
2. `listing_orders` 新增 `buyer_name`/`buyer_phone`/`buyer_address` 三列(见 README"Guest 联系方式留底")
3. `create type public.ad_type` + `listings.ad_type` 列(见 README"广告类型 ad_type")——**已确认跑过**,用户截图测试过 Static image ad 正常显示
4. `alter type public.listing_category add value 'any'`(见 README"类目加一个 Any category 选项"小节)
5. `listings.rights_attested_at`/`terms_accepted_at` 两列(见 README"发布免审核 + KYC 后置")
6. `seller_price_card_items` 建表 + RLS(见 README"Price Card")——**已确认跑过**,用户截图测试过真实价目数据正常显示、也确认过背景图去掉后的新版样式

**Supabase 后台配置(非 SQL,这次新增,确认已经做完)**:custom SMTP 接了 Resend(域名 `hereforads.com` 已验证)、Magic Link 邮件模板换成了 `token_hash` 格式、Redirect URLs 加了 `/auth/confirm`。

**还没处理 / 下一步**:
- **没有自动化内容审核**——发布免审核之后,事后监督完全靠 `/admin/listings` 的 Remove + 举报,这是这轮明确的范围控制,不是漏做,但如果滥用情况变严重需要重新评估
- **多平台打包价("套餐价")没做**——用户在讨论 ad_type 时提过,这次明确排除在范围外,继续保持"一个 listing 一个投放位",卖家想多平台卖就多发几条(现成的 Duplicate 功能)
- **Price Card 没有拖拽排序**——`sort_order` 就是加入顺序,想调整目前得删了重加
- **Terms of Service 那条"虚假/侵权内容责任由发布者承担"的新增措辞,还没给律师看过**——上一轮(9-18)"Terms 没给律师看过"这条提醒还在,这次又加了新内容,风险点没有变小
- ~~Price 卡片背景图相关代码/文案是否清干净~~——写完这条小结后又跑了一次全仓库 `grep price_card_image`,确认除了 README/本文件的说明性文字,代码里没有任何残留引用,这条可以划掉

## 2026-09-23 费用、取消与退款 · 第 1 批(分支 `claude/ecstatic-bohr-khjqnu`)

- 做了:固定费率 12% + 4% + 固定部分(`src/lib/fees.ts`)、放款带 `source_transaction` + 幂等、cron 接受 GET + `vercel.json` 每小时、订单写入全部改走 service_role、webhook 核对实付金额、付款后 24 小时免费取消。细节和 SQL 见 README"费用、取消与退款规则 → 实现进度 → 第 1 批"。
- 产品负责人本批的回答:旧订单都是测试数据,统一按新规则;Vercel 是 Pro;最低价按 USD 0.99 的等值;金额对不上不做自动退款,复杂退款流程以后再完善。
- **待确认**:CAD/AUD/SGD/HKD/JPY 的固定手续费和最低价是按汇率取的等值整数,产品负责人还没确认具体金额。
- **需要人工做**:Supabase 执行 README 里的 3 段 SQL;Stripe 平台账户提现改手动;Vercel 加 `CRON_SECRET`。
- **没验证的**:这个会话没有 `STRIPE_SECRET_KEY`、也连不上 Supabase,Stripe 测试卡流程没有实际跑过,只做了 `npm run lint`、`npm run build` 和费率计算的本地核对(GBP 100 → 到手 83.80)。README 里写了测试卡的手动测试步骤。

## 2026-09-24 测试反馈修复(分支 `claude/ecstatic-bohr-khjqnu`)

- 线上访客结账 500:日志显示 Stripe 报 "Invalid API Key provided: eyJhbGci…",Vercel Production 的 `STRIPE_SECRET_KEY` 被误填成了 Supabase key(配置问题,已告知产品负责人改回 `sk_test_…`)。代码侧加了兜底,结账出错不再整页崩溃。
- 新增订单邮件通知(Resend API)、订单存买家邮箱、结账前两个必勾项(条款 + 14 天取消权)、英文文件上传按钮。细节、SQL、新环境变量(`RESEND_API_KEY`、`EMAIL_FROM`)见 README"测试反馈修复(2026-09-24)"。
- 没验证的:这个环境连不上 Supabase/Stripe/Resend,只跑了 lint + build。


## 2026-09-24 当天后续(交接给下一个对话)

已合并进 main:PR #40(My listings 封面图/Upload new ad、购买入口 登录/注册/访客 三选一、登录后接回购买)、#41(订单邮件、买家邮箱、结账勾选条款、英文上传按钮、结账出错兜底)、#42(Stripe 付款带卖家信息、admin 订单页按卖家筛选)、#43(`/admin/finance` 平台账本、新卖家每周打款、最低价约 USD 1)。本条对应的 PR:Sales 页分标签 + 日历预订规则。

**线上配置状态 / 待人工确认**:
- Production 的 `STRIPE_SECRET_KEY` 曾被误填成 Supabase key(导致结账 500),产品负责人已知悉要改回 `sk_test_…`。
- 需要执行的 SQL:README"测试反馈修复(2026-09-24)"(buyer_email 等)、"平台记账"(payments 的 settlement 列)。
- `RESEND_API_KEY` 要加到 Vercel;邮件进垃圾箱要加 DMARC(见 README 同一节)。
- 第 1 批测试清单(README"实现进度 → 第 1 批")里测试 5(交付→确认→放款)、7(cron)、8(平台手动提现)还没反馈结果。

**下一步(产品负责人已定)**:
1. 写代码实现 README"日历按天预订"一节(规则已定,3 个实现细节写代码前再问)。
2. 继续"费用、取消与退款"的后续批次(第 4 条其余几行、第 4a/5/6/7 条)。
3. 待确认:CAD/AUD/SGD/HKD/JPY 的固定手续费金额;Terms 加 "All fees are exclusive of VAT"。

## 2026-09-24 日历按天预订 · 第 1 批(分支 `claude/adoring-dijkstra-idwhhf`)

- 产品负责人确认的实现细节(已写进 README"日历按天预订"一节):40% 放款前必须交上线链接(开始日当天起可交,之后照旧 3 天确认期);按天最少预订默认 7 天、可设 1–90,单次最多 90 天;买家不能提前确认放款;按周/按月是套餐价、按整周/30 天一段订;统一英国时间;开始日期最远 60 天后;24 小时免费取消在取消那一刻判断;中途撤下的比例退款跟"费用、取消与退款"第 6 条一起做。
- 做了:发布开关 + 最少天数、详情页日历选择器、按数量计价下单、数据库函数 `create_booking_order` 防日期重叠(未付款占用 36 分钟,Stripe 付款链接 31 分钟失效)、开始前 24 小时内不能免费取消、Sales/Purchases/邮件显示日期。放款过渡:日历订单整笔压到结束 3 天后,买家不能提前确认。
- **需要人工做**:先在 Supabase 执行 README"日历按天预订 → 实现进度 → 第 1 批"的 SQL,再合并部署。
- **没验证的**:这个环境连不上 Supabase/Stripe,只跑了 lint + build 和日期函数的本地核对(英国夏令时/冬令时切换日的 00:00 换算正确)。
- 下一步:第 2 批分两次放款(40% / 60%)。

## 2026-09-24 交付链接自动补 https://(PR #45 合并之后)

- 产品负责人测试反馈:交付时填 `youtube.com/shorts/…` 报错。改成服务端自动补 `https://`(`src/lib/url.ts`),交付链接、社交账号链接、个人网站三处共用;交付链接只接受 http/https。无 SQL。
- 同一个 PR 追加:卖家交付后、放款前可以修改交付链接;每次修改买家 3 天确认期重新计并邮件通知买家,旧链接记进 `listing_order_proof_changes`(产品负责人确认的 3 条规则见 README"卖家修改交付链接")。**要先执行 README 里的 SQL 再合并。** cron 自动放款时加了 `delivered_at` 二次核对。没连 Supabase 实测,只跑了 lint + build。

## 2026-09-24 订单号与订单查询(分支 `claude/order-numbers`)

- 产品负责人测试反馈:guest 确认邮件没有订单号/卖家/订单详情,"View your order" 打开的是登录页,guest 没有密码进不去。确认的做法:订单号连续编号从 HFA-000118 开始;查订单要订单号 + 邮箱都对上;不单独发 invoice。
- 做了:订单只读页 `/orders/<view_token>`(邮件按钮指向这里,免登录)、`/orders/find`、登录页免密码登录链接、所有订单邮件带订单号和详情表、Sales/Purchases/管理员订单页显示订单号(管理员可搜索)、Stripe 描述带订单号。细节和 SQL 见 README"订单号与订单查询"。
- **要先执行 README 里的 SQL 再合并。** 没连 Supabase/Resend 实测,只跑了 lint + build 和订单号解析的本地核对。

## 2026-09-24 Guest 登录与设置密码(分支 `claude/guest-login`)

- 产品负责人测试反馈:guest 下单同时收到 "Confirm your email";订单页要登录链接也是确认邮件;链接打开是 localhost;guest 没密码不知道怎么登录。确认的做法:免密码登录(链接 + 6 位验证码),登录后提醒设密码。
- 做了:guest 建号改成 `admin.createUser`(已确认、不发邮件);登录页验证码登录、按钮改名;`/dashboard/password` 设/改密码 + Dashboard 顶部提醒;注册遇到已有账号的提示;`/auth/confirm` 兼容旧 guest 账号的 `code` 链接。
- **要人工做**:Supabase Site URL 改成正式域名、Redirect URLs、Magic link 模板加验证码、执行 `current_user_has_password()` 的 SQL(见 README"Guest 登录与设置密码")。localhost 问题是配置问题,不是代码。
- 没实测:这个环境连不上 Supabase,只跑了 lint + build。

## 2026-09-24 手机排版(分支 `claude/mobile-nav`)

- 产品负责人手机测试:顶部导航挤、"Ad spaces"/"Log in" 换成两行。改成手机上导航收进汉堡菜单(Ad spaces / Publishers / Find an order),外面只留 Log in 或头像;桌面端不变。
- 顺带修:Dashboard 在手机上左侧栏把正文挤成一条 → 手机上改成顶部一排可横向滑动的标签;发布表单的 价格/币种/计价单位 手机上从 3 列改成 2 列。
- 验证:lint + build;用 Playwright 按 375px 宽截图看了首页、菜单展开、登录页,1280px 看了桌面端。Dashboard 需要登录,这个环境连不上 Supabase,没截到图。

## 2026-09-24 切 live 前安全核查 · 第 1 批(分支 `claude/charming-hawking-xs94gl`)

- 先做了全站只读核查,报告发给了产品负责人(23 项,分 3 批修)。这个会话的 Supabase MCP 连不上 HereForAds 的项目,数据库实际权限状态靠产品负责人跑核对 SQL 回传。
- 产品负责人确认的规则:拒付/Stripe 后台退款/封号都用"暂停放款"标记(`listing_orders.payout_hold`),不改订单状态;拒付赢了不自动放款、管理员解除;已放款后的拒付由管理员手动撤回转账;解封不自动解除暂停;结账只收卡;老表 `orders`/`ad_spaces` 收回权限不删数据;管理后台新增 "Disputes & holds" 页面。
- 做了:买家联系方式/view_token 改列级权限(卖家读不到);`is_verified`/`is_featured`/`is_banned` 等敏感列 insert/update 都收回(**发现 README 之前那几条 `revoke update (列)` 在表级权限还在时不生效**,这次按"收回整表 + 逐列授权"重做);webhook 幂等 + 出错返回 500 + 拒付/退款事件;免费取消的退款报错不再盲目还原订单;开放重定向;封号暂停放款并禁止新下单。细节和 SQL 见 README"安全核查 · 第 1 批"。
- **要人工做**:先执行 README 里的 SQL(第 0 步先查 payments 有没有重复行);Vercel 加 `ADMIN_ALERT_EMAIL`;Stripe webhook 加勾 `charge.dispute.created`、`charge.dispute.closed`、`charge.refunded`。
- 没实测:连不上 Supabase/Stripe,只跑了 lint + build + npm audit。
- 下一批:限流 + Cloudflare Turnstile(产品负责人已同意方案和额度)。

## 2026-09-25 安全核查第 1 批上线验证 + 第 2、3 批交接

- PR #50 已合并,SQL 已执行并核对(列级权限生效)。测试卡验证了:拒付自动暂停放款、Accept dispute 后订单取消、放款金额正确(USD 83.75 / GBP 25.00)。
- 产品负责人在 Stripe 开了 USD/EUR/GBP 多币种余额;Adaptive Pricing(买家选本国货币付)经验证不影响我们的金额核对和放款,保留。美元转给只有英镑账户的卖家时由卖家那边换汇(约 2%,卖家承担)。
- **下一步:新对话从 README"安全核查 · 第 1 批上线后的验证结果 + 第 2、3 批交接"开始做第 2 批(限流 + Turnstile)**,规则和额度都已确认;第 3 批里标"先问"的三项(币种缩减、默认币种提示、"Paid out" 改名)实现前再问产品负责人。

## 2026-09-25 安全核查 · 第 2 批:限流 + Turnstile(分支 `claude/wonderful-sagan-i5bufm`)

- 产品负责人确认:Stripe webhook 已勾 `charge.dispute.closed`、`charge.refunded`;Vercel 已加 `ADMIN_ALERT_EMAIL`(第 1 批的手动项全部完成)。
- 做了:Postgres 限流表 `rate_limits` + `rate_limit_hit()`/`purge_rate_limits()`(只存 IP/邮箱的 HMAC,出错放行);发登录链接、验证码登录、找订单、guest 下单、联系表单按交接表的额度限流;Turnstile 组件 + 服务端校验;注册/密码登录/发登录链接把 token 交给 Supabase CAPTCHA;日历未付款占用同一买家/同一 IP 最多 2 个(改了 `create_booking_order`,新增 `listing_orders.hold_ip_hash`);联系表单改走 service_role 并收回 anon insert。细节、SQL、手动步骤见 README"安全核查 · 第 2 批"。
- 跟交接文档不同的一处:Supabase 的 `/verify`(`verifyOtp`)不校验 CAPTCHA(查了 supabase/auth 源码 `internal/api/api.go`),所以验证码登录改成我们服务端校验 Turnstile。
- **要人工做**(顺序不能乱):Cloudflare 建 Turnstile widget → Vercel 加 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`、`RATE_LIMIT_SALT` → 合并部署 → 执行 SQL → 手动测 → **最后**才开 Supabase CAPTCHA。
- 验证:lint + build + npm audit;SQL 在本地 Postgres 16(简化表结构)跑过两遍,核对了限流计数、权限、占用上限、日期重叠;本地 dev 验证了没有 token 时服务端拒绝、限流表连不上时放行。这个沙箱连不上 Cloudflare 和 Supabase,Turnstile 组件的真实渲染和 Supabase CAPTCHA 没有实测。

## 2026-09-25 第 2 批测试反馈(同分支,PR #52 合并之后的跟进)

- 产品负责人实测:联系表单第 6 条被拦(第一次 8 条没拦是跨整点)、登录链接/验证码、订单页登录链接、guest 下单、密码登录都正常。日历(B8)、找订单(B3)还没测;Supabase CAPTCHA 还没开。
- 按反馈改:登录链接每邮箱 3→5 次/小时 + 显示剩余次数和重置时间;限流提示带"几点以后再试";验证码输错显示剩余次数;"6-digit code" 文案改掉(实际 8 位);`/auth/confirm` 链接失效但已登录时直接进 Purchases。无 SQL。见 README"第 2 批测试反馈"。
- 待产品负责人回答:后台新留言邮件通知 / Contact 未读红点 / 总览页未读数和今日新增用户(已读怎么算、"今日"按英国时间、邮件频率);是否把 `/auth/confirm` 改成"点按钮才登录"防邮箱安全扫描预先点开链接。

## 2026-09-25 后台留言提醒 + 登录链接防邮箱扫描(同分支,PR #53 合并之后)

- 产品负责人确认:打开 `/admin/contact` 即全部已读;"今日"按英国时间 0 点;每条留言立刻发邮件。另外要求处理 Hotmail/Outlook 安全扫描提前用掉登录链接的问题。
- 做了:留言邮件发 `ADMIN_ALERT_EMAIL`(Reply-To 留言人);`contact_messages.read_at` + 后台导航未读红点 + "New" 标签;总览页 "N new" / "+N today";`/auth/confirm` → `/auth/continue` 点按钮才登录。细节和 SQL 见 README"后台留言提醒 + 登录链接防邮箱扫描"。
- **要人工做**:先执行 README 里的 SQL(`read_at` 列),再合并部署。
- 验证:lint + build + npm audit;本地 dev 验证了 `/auth/confirm` 转到按钮页、点按钮后无效 token 回登录页。后台页面需要登录 + 数据库,没实测。

## 2026-09-25 联系页提交后只留感谢语

- 产品负责人测试反馈:`/contact` 提交成功后,上面的 "Questions, feedback, or something not working?…" 说明不需要,只留 "Thanks — …"。说明文字挪进 `ContactForm`(`intro` 参数),提交成功后跟表单一起隐藏。无 SQL。

## 2026-09-25 后台留言可删除

- 产品负责人要求:`/admin/contact` 每条留言加 "Delete" 按钮(点了先弹确认框),删除没用的留言。直接删除、不可恢复,只有管理员能操作(`deleteContactMessageAction`,service_role)。无 SQL。

## 2026-09-25 改日期立刻释放未付款占用

- 产品负责人测试 B8 反馈:进了付款页想改日期,自己的占用挡住自己 36 分钟。做了:Stripe "返回"(cancel_url → `/api/checkout/cancelled`)和同一买家在同一条广告重新下单时,先作废旧付款链接再释放日期;回到广告页自动带回刚才选的日期。只有买家本人/同 IP 能释放,付款链接作废不了就不释放。新列 `listing_orders.checkout_session_id`,**先执行 README"改日期:立刻释放未付款的日历占用"的 SQL 再合并**。
- 产品负责人问了"订单查询加手机号",还没定(见对话里的建议)。
- B3 找订单已测通过;第 2 批测试只剩阶段 C(开 Supabase CAPTCHA)。

## 2026-09-25 第 2 批验证完成

- 产品负责人实测:阶段 C(开启 Supabase CAPTCHA 后登录/注册/登录链接/验证码/Google 登录/guest 下单)正常。第 2 批(限流 + Turnstile)全部验证通过,Supabase CAPTCHA 已开启。
- 产品负责人决定不做:订单查询加手机号、"把名下订单发到邮箱"。用户靠订单邮件或登录后的 Purchases 找订单,有问题走联系表单。已记进 README"第 2 批测试反馈"。
- 下一步:第 3 批(README 交接一节的表格);其中标"先问"的三项(币种缩减、默认币种提示、"Paid out" 改名)实现前要问产品负责人。另外待做:Stripe cancel_url 之外的 `checkout.session.expired` 事件处理(第 3 批第 10 条)。
## 2026-09-25 安全核查 · 第 3 批(分支 `claude/wonderful-sagan-i5bufm`)

- 产品负责人决定:币种/开户国家**暂不缩减**(等有用户再看);同意默认币种 + 换汇提示;同意 "Paid out" → "Released to seller"。
- 做了:付款时日期冲突触发器 + 自动退款 + `checkout.session.expired`;上传按文件头白名单 + 10MB + bucket 限制;安全响应头 + CSP Report-Only(`/api/csp-report` 记日志);私信规则(服务端 + RLS)、收件人只能改 read_at;会话页 UUID 校验;密码 8 位 + 数字/大小写;existing_media 前缀校验;guest 成功页改 session_id + 打码邮箱;`server-only`;URL http/https 约束;默认币种 + 换汇说明;状态改名。细节见 README"安全核查 · 第 3 批"。
- **要人工做**:执行 README 里的两段 SQL;Supabase 密码规则 + Secure password change;Stripe webhook 加勾 `checkout.session.expired`。
- 验证:lint + build + npm audit;SQL 在本地 Postgres 16(简化表结构)跑过两遍,测了触发器冲突/不冲突、私信策略四种情况、read_at 列权限、URL 约束。连不上 Supabase/Stripe,上传、私信、guest 成功页没实测。
