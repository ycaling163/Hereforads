import Stripe from "stripe";

// 单例,避免每次 import 都重新解析 API 版本/建连接。这个 key 是 secret key,
// 只应该在服务端文件(Server Action、Route Handler)里 import 这个模块。
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe Connect 开户/回调链接、Checkout 的 success/cancel url 都要拼绝对 URL。
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  // 本地开发没配这个变量时兜底,生产环境应该始终显式配置。
  return "http://localhost:3000";
}
