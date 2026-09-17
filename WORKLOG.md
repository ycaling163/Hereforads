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
