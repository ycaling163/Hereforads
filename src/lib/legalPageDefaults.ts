// 兜底内容:管理员还没在 /admin/pages 里编辑过、或者 site_pages 表还没建(见 README
// "站内页面内容管理"一节的 SQL)之前,/terms、/privacy 用这份内容渲染,保证这次改动
// 上线时页面不会突然变空白。跟 README 里那条 insert 语句的种子数据是同一份文案,
// 后台第一次打开编辑页看到的也是这份内容。
import { SITE } from "@/config/site";

// 富文本内容存的是纯语义标签,不带 class(sanitize-html 会把 class/style 都剥掉,
// Tailwind 也没法扫到数据库里的字符串生成对应样式),所以样式统一挂在这层外壳的
// 子元素选择器上,terms/privacy 两个页面共用同一份。
export const LEGAL_CONTENT_CLASSNAME =
  "mt-8 text-sm leading-6 text-zinc-700 [&>*]:mt-4 [&>*:first-child]:mt-0 [&>h2]:mt-8 [&>h2:first-child]:mt-0 [&>h2]:text-base [&>h2]:font-semibold [&>h2]:text-zinc-900 [&>ul]:list-disc [&>ul]:space-y-1 [&>ul]:pl-5 [&_strong]:font-semibold [&_a]:text-zinc-900 [&_a]:underline";

export const DEFAULT_TERMS_TITLE = "Terms of Service";

export const DEFAULT_TERMS_HTML = `<p><em>Draft — this page summarizes the platform rules we’ve settled on so far. It hasn’t been reviewed by a lawyer yet and shouldn’t be treated as final legal terms until it has.</em></p>
<h2>1. What ${SITE.name} is</h2>
<p>${SITE.name} is a marketplace where publishers list ad placements (a spot on a social account, website, or other digital space) and buyers pay to advertise there. We provide the listing, payment, and messaging tools — we don’t create, sell, or manage ad inventory ourselves, and we don’t guarantee the performance or results of any ad placement.</p>
<h2>2. Payments and escrow</h2>
<p>Payments are processed through Stripe. When you buy a listing, your payment is held in escrow until the publisher marks the order as delivered and you confirm receipt — or a fixed number of days pass after delivery with no response, at which point funds are released automatically. Publishers must complete Stripe’s identity verification (KYC) before they can publish a live listing.</p>
<p>${SITE.name} charges a platform commission on completed transactions, deducted from the publisher’s payout alongside Stripe’s own processing fees.</p>
<h2>3. What we don’t review or guarantee</h2>
<p>Listings go live as soon as a publisher submits them — we don’t pre-review or vet listings for ad performance, business outcomes, or the accuracy of what a publisher claims about their own account or content. We can remove listings or suspend accounts after the fact (including in response to reports), but publishing a listing doesn’t mean we’ve certified anything about it.</p>
<p>When publishing a listing, a publisher confirms that they own the account or have explicit authorization to run ads on it, and that the content is original and not subject to any copyright or other dispute. <strong>The publisher is solely responsible for any legal claims — including copyright, trademark, or fraud claims — arising from false, unauthorized, or infringing content in their listing.</strong> We don’t independently verify these confirmations before a listing goes live.</p>
<h2>4. Staying on-platform</h2>
<p>Escrow protection, payment security, and any dispute assistance we offer only cover transactions completed through ${SITE.name} checkout. If you and another user agree to pay or deliver outside the platform, that transaction isn’t protected by us in any way — we strongly recommend keeping the full transaction on ${SITE.name}.</p>
<h2>5. Disputes and refunds</h2>
<p>We don’t arbitrate disagreements about ad content or quality. If a payment itself is disputed (for example, a Stripe chargeback or fraud claim), that’s handled through Stripe’s dispute process. Contact us using the form below if you run into a problem and we’ll help where we can.</p>
<h2>6. Account suspension</h2>
<p>We can suspend or ban accounts that violate these terms, commit fraud, or otherwise abuse the platform. Banned accounts lose access immediately.</p>
<h2>7. Availability</h2>
<p>${SITE.name} is only available where our payment processor (Stripe) supports payouts — this currently excludes mainland China.</p>
<h2>8. Contact</h2>
<p>Questions about these terms? Use the contact form in the footer of any page.</p>`;

export const DEFAULT_PRIVACY_TITLE = "Privacy Policy";

export const DEFAULT_PRIVACY_HTML = `<p><em>Draft — this page describes what we actually collect and how it’s actually used today. It hasn’t been reviewed by a lawyer yet and shouldn’t be treated as final legal terms until it has.</em></p>
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
<p>Questions about this policy? Use the contact form in the footer of any page.</p>`;
