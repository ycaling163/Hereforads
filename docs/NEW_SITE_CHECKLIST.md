# 新站点上线清单

把这套代码复制成一个新站点(比如"活动预订")时,按这个顺序做。每一步做完打个勾。
写于 2026-09-25,对应 HereForAds 当时的代码和配置;各家后台的菜单名以后可能会改,找不到时按关键词搜。

> **只改品牌、不改业务**:这份清单只负责"换个名字、换一套账号跑起来"。业务规则(按场次预订、名额、
> 退款规则等)要改的话是另一件事,先在 README 里写清楚决定再动代码。

需要准备的账号:GitHub、Supabase、Stripe、Vercel(Pro,每小时一次的定时任务需要 Pro)、
Cloudflare(域名 DNS + Turnstile)、Resend(发邮件)、Google Cloud(Google 登录,可选)。

---

## 0. 先想好这几个值

| 项目 | HereForAds 的值 | 新站点 |
|---|---|---|
| 站名 | HereForAds | |
| 正式域名 | https://hereforads.com | |
| 发件地址 | hello@hereforads.com | |
| 管理员收提醒的邮箱 | (Vercel 里的 `ADMIN_ALERT_EMAIL`) | |
| 订单号前缀 | HFA- | |
| Stripe 对账单描述 | HEREFORADS | |

---

## 1. GitHub:新建仓库

1. GitHub → **New repository** → 选 **Private**,名字随意,**不要**勾 README/.gitignore。
2. 用 **Import repository**(新建页面顶部的 "Import a repository" 链接)把 HereForAds 仓库导进来;
   或者本地 `git clone` 老仓库,`git remote set-url origin <新仓库地址>`,`git push -u origin main`。
   - **不要用 Fork**:Fork 跟原仓库绑在一起(PR 默认开回原仓库、不能改成私有等)。
3. 在新仓库里改代码(下面第 2 步),提交到 `main`。

## 2. 代码里要改的地方

1. **`src/config/site.ts`**:站名、域名、标语、描述、logo 尺寸、图标主色和文字、默认发件地址、
   订单号前缀、费率、托管天数、免费取消时限、日历规则。**所有品牌字样都在这里**,页面、邮件、
   条款默认文案都从这里读。
2. **`public/logo.png`**:换成新 logo(页头和分享图都用它),然后把 `site.ts` 里 `logo` 的宽高改成
   新图片的实际尺寸。
3. **`src/app/favicon.ico`**:换成新图标(浏览器标签页图标;`icon.tsx`/`apple-icon.tsx` 会按
   `site.ts` 的颜色和文字自动生成)。
4. **页面文案**:首页(`src/app/page.tsx`)、`/publishers/join` 等页面的介绍文字是写在页面里的
   英文文案,按新业务改写。
5. **`src/lib/legalPageDefaults.ts`**:条款/隐私政策的默认文案(站名会自动替换,但内容是按
   广告位市场写的,要按新业务重写,最好请律师看)。
6. 可选:`src/lib/supabase/enums.ts` 里的类目、广告类型等选项是 HereForAds 业务专用的,
   新业务不同的话要跟数据库枚举(`supabase/migrations/*_types.sql`)一起改。

改完本地跑 `npm run lint`、`npm run build` 确认没错。

## 3. Supabase:建项目、建库

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**,区域选离用户近的
   (HereForAds 用的是 London / eu-west-2),数据库密码存进密码管理器。
2. **建库**:左侧 **SQL Editor** → New query,**按文件名顺序**把 `supabase/migrations/` 里的 6 个
   文件逐个粘进去运行(`..._types` → `..._tables` → `..._functions` → `..._rls_policies` →
   `..._grants` → `..._storage`)。每个都应该显示 Success。
   - ⚠️ **这些迁移只能在新建的空项目上跑**,不要在 HereForAds 线上库跑。
3. **核对**:SQL Editor 里运行 `supabase/scripts/export_schema.sql`,Download CSV,连同老项目
   的导出一起交给开发对比(应该只有预期内的差别)。
4. **Settings → API**:记下 Project URL、`anon` key、`service_role` key(第 6 步 Vercel 要用)。
5. **Authentication → URL Configuration**:
   - Site URL = `https://新域名`(不是 localhost);
   - Redirect URLs 加 `https://新域名/auth/callback` 和 `https://新域名/auth/confirm`
     (本地开发再加 `http://localhost:3000/auth/callback`、`http://localhost:3000/auth/confirm`)。
6. **Authentication → Emails → SMTP Settings**(做完第 8 步 Resend 之后):打开 custom SMTP,
   Sender email = 发件地址,Host `smtp.resend.com`,Port `465`,Username `resend`,
   Password = Resend 的 API Key。
7. **Authentication → Emails → "Magic link or OTP" 模板**(开了 custom SMTP 才能改),正文换成
   (把站名换掉):

   ```html
   <h2>Your 站名 sign-in link</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard/purchases">Log in to 站名</a></p>
   <p>Or enter this code on the login page: <strong>{{ .Token }}</strong></p>
   <p>The link and code expire in 1 hour. If you didn't ask for this, you can ignore this email.</p>
   ```

   "Confirm sign up"、"Invite user"、"Change email address"、"Reset password" 模板**保持默认
   `{{ .ConfirmationURL }}` 不动**(注册确认依赖这个格式)。
8. **Authentication → Sign In / Providers → Email**:Minimum password length `8`;Password
   requirements 选 "Lowercase, uppercase letters and digits";打开 **Secure password change**。
9. **Google 登录**(可选):Google Cloud Console 建 OAuth Client(Web),Authorized redirect URI 填
   Supabase 在 **Authentication → Providers → Google** 页面上显示的 Callback URL;把 Client ID/Secret
   填回 Supabase 并启用。不做的话把 `src/components/OAuthButtons.tsx` 的 Google 按钮去掉。
10. **CAPTCHA 最后再开**:见第 9 步。

## 4. Stripe:Connect 平台

先在测试环境(Sandbox)配一遍、跑通,再切 live。**Sandbox 和 live 的 API key、webhook 是两套,
各配各的**(HereForAds 踩过坑:webhook 配错 sandbox,订单一直卡在"待支付",见 README 顶部)。

1. 新建 Stripe 账户(或在已有账户里新建一个 account),Business 资料按实际填。
2. **Connect**:启用 Connect,平台类型选 marketplace,用 **Express** 账户;Connect 设置里关掉
   Express 账户的 Instant Payouts 和"卖家自己改打款计划",打开 debit negative balances。
3. **Developers → API keys**:记下 Secret key(`sk_test_...` / `sk_live_...`)。
4. **Developers → Webhooks → Add destination**:
   - Endpoint URL:`https://新域名/api/stripe/webhook`;
   - 勾 **"Listen to events on Connected accounts"** 也要收(`account.updated` 来自卖家的 Connect 账户);
   - 事件**手动在 All events 里搜着勾**(不要用默认推荐的 "Accounts v2"):
     `checkout.session.completed`、`checkout.session.expired`、经典 `account.updated`、
     `charge.dispute.created`、`charge.dispute.closed`、`charge.refunded`;
   - 创建后记下 Signing secret(`whsec_...`)。
5. **Settings → Branding**:logo、颜色;**Public details** 里对账单描述(statement descriptor)填新站名。
6. 切 live 前:平台提现改手动;Balance 开需要的币种;Radar 默认规则 + 高风险交易要求 3DS;
   用一笔小额真实订单走通"付款 → 放款 → 退款"。(完整清单见 README"切 live 前产品负责人要手动做的")

## 5. Cloudflare:域名和 Turnstile

1. 域名 nameserver 指向 Cloudflare。
2. **DNS**:按 Vercel **Settings → Domains** 页面给的值加记录(HereForAds 是根域名 A 记录
   `76.76.21.21` + `www` 的 CNAME);**都设成灰色云朵(DNS only)**,跟 HereForAds 一样,
   让 Vercel 自己管证书。
3. **Turnstile → Add widget**:名字填新站名;Hostnames 加新域名(要让 Vercel 预览地址也能登录,
   再加 `vercel.app`);Mode 选 **Managed**,Pre-clearance 选 No。记下 Site Key 和 Secret Key。

## 6. Vercel:部署

1. **Add New → Project**,选第 1 步的 GitHub 仓库,Framework 自动识别为 Next.js。
2. **Settings → Environment Variables**(Production 和 Preview 都勾;标 **Sensitive** 的是密钥,
   千万不要加 `NEXT_PUBLIC_` 前缀):

   | 变量 | 值 | 类型 |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | 普通 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` key | 普通 |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key | **Sensitive** |
   | `NEXT_PUBLIC_SITE_URL` | `https://新域名`(Preview 环境可以不填) | 普通 |
   | `STRIPE_SECRET_KEY` | `sk_test_...`,切 live 时 Production 换成 `sk_live_...` | **Sensitive** |
   | `STRIPE_WEBHOOK_SECRET` | 第 4 步的 `whsec_...`(跟上面的 key 同一个环境) | **Sensitive** |
   | `CRON_SECRET` | 随机字符串,至少 32 位(`openssl rand -hex 32`) | **Sensitive** |
   | `RESEND_API_KEY` | Resend 的 API Key | **Sensitive** |
   | `EMAIL_FROM` | 可选,比如 `站名 <hello@新域名>`;不填用 `site.ts` 里的 | 普通 |
   | `ADMIN_ALERT_EMAIL` | 管理员收提醒的邮箱(拒付、新留言等) | 普通 |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile Site Key | 普通 |
   | `TURNSTILE_SECRET_KEY` | Turnstile Secret Key | **Sensitive** |
   | `RATE_LIMIT_SALT` | 随机 64 位十六进制(`openssl rand -hex 32`) | **Sensitive** |

3. **Settings → Domains**:加新域名和 `www`,按提示核对第 5 步的 DNS。
4. 部署。环境变量是部署之后才加的话,要 **Redeploy** 一次才生效。
5. **Settings → Cron Jobs**:能看到 `/api/cron/auto-confirm` 每小时一次(来自仓库里的
   `vercel.json`),手动 Run 一次应返回 200。
6. **Settings → Deployment Protection**:给 Preview 部署开保护。

## 7. Resend:发信域名

1. Resend → **Domains → Add domain**,填新域名(或 `mail.新域名` 这类子域名)。
2. 把 Resend 给的 SPF、DKIM、Return-Path 记录加到 Cloudflare DNS(灰色云朵),等都显示 Verified。
3. DMARC:先加 `p=none`,观察两周没问题再收紧。
4. **API Keys → Create**,填到 Vercel 的 `RESEND_API_KEY` 和第 3 步 Supabase 的 SMTP Password。

## 8. 第一个管理员

1. 在新站点上正常注册一个账号(用自己的邮箱)。
2. Supabase → **Authentication → Users** 找到这个账号,复制它的 User UID。
3. SQL Editor 运行(把 UID 换掉):

   ```sql
   insert into public.admins (user_id) values ('这里填 User UID');
   ```

4. 刷新页面,右上角头像菜单里应该出现 Admin 入口,`/admin` 能打开。

## 9. 测一遍,再开 CAPTCHA

1. 用 Stripe 测试卡 `4242 4242 4242 4242` 走一遍:注册 → 连 Stripe 收款 → 发布 → 另一个账号购买
   → 卖家标记交付 → 买家确认 → 放款;guest(不登录)下单、收订单邮件、点邮件里的登录链接;
   联系表单(管理员邮箱收到提醒);找订单(`/orders/find`)。
2. 都正常后,Supabase → **Authentication → Attack Protection** → 打开 **Enable Captcha protection**,
   Provider 选 **Turnstile by Cloudflare**,Captcha secret 填 Turnstile Secret Key。
3. 马上再测:密码登录、注册、发登录链接、验证码登录、Google 登录。万一全部失败,先关掉这个开关
   (立刻恢复),再找开发。
4. 在 [securityheaders.com](https://securityheaders.com) 测新域名,应为 A(CSP 显示缺失是因为
   现在是 Report-Only,预期内)。

## 10. 上线前

- `/terms`、`/privacy` 按新业务改写并请律师看,在 `/admin/pages` 里编辑。
- 会计:VAT、HMRC 数字平台申报等(按新业务所在地)。
- Stripe 切 live:见第 4 步第 6 条和 README"切 live 前产品负责人要手动做的"。
