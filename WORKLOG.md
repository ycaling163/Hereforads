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
