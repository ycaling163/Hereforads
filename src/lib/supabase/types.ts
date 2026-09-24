import type {
  AdType,
  ListingCategory,
  ListingOrderStatus,
  ListingStatus,
  PricingUnit,
  SocialPlatform,
  UserRole,
} from "./enums";

export interface Profile {
  id: string;
  role: UserRole;
  display_name: string | null;
  // Optional pretty-URL slug for /[username] (e.g. "7smile-linda" ->
  // hereforads.com/7smile-linda), an alternative to the /sellers/[id] link
  // for sharing off-platform. Lowercased and validated in
  // src/lib/username.ts before it ever reaches the DB. Null until the user
  // sets one on /dashboard/profile. Added 2026-09-18, see README.
  username: string | null;
  // MVP v2 新增字段,见 README 里的 schema 迁移说明。老账号这三个字段读出来是 null,
  // 代表还没走过新流程 —— country 未填、stripe_onboarded 视为 false。
  country: string | null;
  stripe_connect_account_id: string | null;
  stripe_onboarded: boolean;
  // 管理员封禁,只有 service_role(管理员操作的 server action)能改,普通用户改不了
  // 自己这一列(数据库层面 revoke 掉了 authenticated 的 UPDATE 权限,不是只靠前端隐藏)。
  is_banned: boolean;
  created_at: string;
  updated_at: string;
}

export interface SellerProfile {
  user_id: string;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  // 创作者自己的内容领域(比如"手工/创作类博主"),跟 Listing.categories(这个
  // 广告位愿意接哪些品牌类目的广告)是两个独立概念,不要混用。加之前读出来是 undefined。
  content_categories: ListingCategory[];
  // 卖家自己的网站/媒体主页(跟 social_accounts 分开——那是具体的社交平台账号,
  // 这个是没有固定平台归属的个人站点)。只在 /sellers/[id] 个人主页展示,不上
  // 列表卡片/listing 详情页侧栏,那两处空间紧、买家更关心的是平台粉丝数。
  // 加之前读出来是 undefined。
  website_url: string | null;
  // 个人主页顶部的横幅图,只在 /sellers/[id] 展示。加之前读出来是 undefined。
  banner_url: string | null;
  // Stripe Connect(Express 账户)相关字段,加之前读出来是 undefined。
  // 见 README 支付章节的 SQL。
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SocialAccount {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  handle: string | null;
  url: string;
  follower_count: number | null;
  created_at: string;
}

// 个人主页的价目表(2026-09-19 加,见 README"Price Card"一节)——一行是
// "广告类型(复用 listings 那个固定的 ad_type 枚举)+ 平台(自由文本,可选,前端
// 给一份常见平台下拉,选 Other 才需要自己打字,见 PRICE_CARD_PLATFORM_OPTIONS)
// + 起价(金额+币种,展示的时候前面加 "From")+ 备注(可选,自由文本,比如"最终
// 价格取决于需求")"。卖家不用自己想怎么写文案。纯展示用,跟买家实际下单的
// listing 完全独立,不代表真的有这么一条 listing 在卖。
export interface PriceCardItem {
  id: string;
  seller_id: string;
  ad_type: AdType;
  // 可选——如果这条价目跟平台无关(比如报价本身就是通用的),不强制选。
  platform: string | null;
  price_amount: number;
  price_currency: string;
  // 可选备注,比如"最终价格取决于需求,具体细节请私信"。
  note: string | null;
  sort_order: number;
  created_at: string;
}

/**
 * MVP v2 新模型("HereForAds MVP 产品方案"文档)—— 对应 listings/orders/payments/messages 四张表。
 */

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  categories: ListingCategory[];
  price_amount: number;
  price_currency: string;
  pricing_unit: PricingUnit;
  media_urls: string[];
  status: ListingStatus;
  // 管理员"推荐/置顶",跟 status 一样只有 service_role(管理员操作)能改。
  is_featured: boolean;
  // 这条 listing 具体是在卖家哪一个社交账号上投放的(2026-09-18 加)。跟
  // seller_profiles 展示的"这个卖家所有社交账号"是两回事——买家在广告网格/详情
  // 页只应该看到这一条广告实际会投放的那一个平台,不然会误以为花一份钱能在
  // 卖家的全部社交媒体同时投放,容易产生纠纷。发布时二选一,互斥:
  // social_account_id 指定具体账号,或者 is_website_placement=true 表示投放在
  // 卖家自己的网站(seller_profiles.website_url)。两个都是 falsy 就是"未指定
  // /其他",发布表单里叫 "Other"(旧数据、没有走过新发布表单的 listing 也会是
  // 这个状态)。加之前读出来是 undefined。
  social_account_id: string | null;
  is_website_placement: boolean;
  // 固定的广告类型模板(2026-09-19 加,见 README"广告类型"一节),跟 categories
  // (接哪些品牌类目)是两个独立维度。这个字段上线前发布的老 listing 是 null,
  // 前端按"Other/未指定"处理,不强制补录。
  ad_type: AdType | null;
  // 发布时两个必勾选框的留痕(2026-09-19 加,见 README"发布免审核 + KYC 后置"
  // 一节)——卖家勾了才能提交,勾选那一刻的时间戳存这两列,作为"卖家当时确认过
  // 这些"的记录。只在创建时问一次,编辑不会重新要求勾选,所以这两列不代表"最近
  // 一次编辑时";这个改动之前发布的老 listing 是 null。
  rights_attested_at: string | null;
  terms_accepted_at: string | null;
  // 日历按天预订(2026-09-24 加,见 README"日历按天预订"一节):只有按天/周/月计价的
  // listing 能开。开了之后买家下单要选开始日期 + 天数/周数/月数,已被预订的日期不能选。
  // min_booking_days 只对按天计价有意义(1–90,默认 7),按周/按月最少就是 1 周/1 个月。
  // 加之前读出来是 undefined,按没开处理。
  booking_enabled: boolean;
  min_booking_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface ListingOrder {
  id: string;
  // 订单号(2026-09-24 加,见 README"订单号与订单查询"):序列自增,从 118 开始,
  // 展示成 HFA-000118(formatOrderNumber)。
  order_number: number;
  // 订单专属只读链接 /orders/<view_token> 用的随机值,只放在买家邮件里,不登录也能看订单。
  view_token: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  currency: string;
  status: ListingOrderStatus;
  proof_url: string | null;
  // 日历预订的订单才有(见 README"日历按天预订"):start_date/end_date 是英国时间的
  // 日期,end_date 是展示的最后一天(含当天);booking_units 是订了几天/几周/几个月
  // (单位看 listing 的 pricing_unit),amount = 单价 × booking_units。
  // hold_expires_at:还没付款时日期占用到什么时候,过了这个时间(Stripe 付款链接也
  // 已失效)日期自动释放给别人。一次性交付的订单这几列都是 null。
  start_date: string | null;
  end_date: string | null;
  booking_units: number | null;
  hold_expires_at: string | null;
  // Guest 结账(不注册)时,买家没有走过任何表单留下联系方式——这三列是
  // webhook 从 Stripe Checkout 的 customer_details 里顺手抄一份存底(2026-09-19
  // 加,见 README"Guest 结账"一节)。登录买家走的是老流程,没开
  // billing_address_collection/phone_number_collection,这三列读出来是 null。
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_address: string | null;
  // 2026-09-24 加:下单时存买家邮箱(guest/登录买家都有),以及结账前两个必勾项
  // 的勾选时间(同意条款、要求立即开始服务并知悉失去 14 天取消权)。
  buyer_email: string | null;
  terms_accepted_at: string | null;
  immediate_start_consent_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  confirmed_at: string | null;
  // 取消(2026-09-23 加,见 README"费用、取消与退款规则"):目前只有付款后 24 小时内
  // 的免费取消(cancel_reason = 'free_24h'),cancelled_by 是发起取消的买家或卖家。
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
}

// 卖家交付后修改交付链接的记录(2026-09-24 加,见 README"卖家修改交付链接")。只由数据库
// 函数 update_order_proof_url 写入,买卖双方能读自己订单的记录。
export interface ListingOrderProofChange {
  id: string;
  order_id: string;
  old_proof_url: string | null;
  new_proof_url: string;
  changed_by: string;
  changed_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  // 2026-09-23 起是固定费率(src/lib/fees.ts),三列都在付款时由 webhook 写好,
  // 金额都是订单币种:
  // - platform_fee_amount:Service fee(12%)
  // - stripe_fee_amount:向卖家收的 Payment processing fee(4% + 固定部分)。列名是
  //   历史遗留,**不是** Stripe 实际扣的手续费(那笔由平台承担,不存在这里)
  // - net_amount:卖家到手金额
  platform_fee_amount: number | null;
  stripe_fee_amount: number | null;
  net_amount: number | null;
  stripe_refund_id: string | null;
  // 2026-09-24 加,平台记账用(见 /admin/finance):平台 Stripe 余额的实际入账
  // (结算币种,一般 GBP)、Stripe 实际扣的手续费,以及放款时实际转给卖家的金额。
  settlement_currency: string | null;
  settlement_amount: number | null;
  stripe_actual_fee: number | null;
  transfer_amount: number | null;
  transfer_currency: string | null;
  status: string;
  created_at: string;
}

// 绑在某个 listing 下的一对一消息串,不做群聊。
export interface ListingMessage {
  id: string;
  listing_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  // 收件人打开这条会话时才会补上这个时间戳,null 就是未读。加之前读出来是 undefined。
  read_at: string | null;
  // 消息可以只发图片、不写文字(这时 body 是空字符串),用来在沟通交付细节时
  // 直接甩参考图/效果图。加之前读出来是 undefined。
  image_url: string | null;
  created_at: string;
}

// /terms、/privacy 的正文,管理员在 /admin/pages/[slug] 用富文本编辑器改。
// content_html 存的是 sanitize-html 清洗过的 HTML(只保留 p/h2/ul/a 这类语义标签,
// 不含 class/style),前台渲染前不需要再处理。见 README"站内页面内容管理"一节。
export interface SitePage {
  slug: "terms" | "privacy";
  title: string;
  content_html: string;
  updated_at: string;
  updated_by: string | null;
}
