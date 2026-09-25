import "server-only";
import Stripe from "stripe";

// 单例,避免每次 import 都重新解析 API 版本/建连接。这个 key 是 secret key,
// 只应该在服务端文件(Server Action、Route Handler)里 import 这个模块。
//
// 故意不写成 `new Stripe(process.env.STRIPE_SECRET_KEY!)` 直接赋值——Next.js
// build 时的"Collecting page data"阶段会静态 import 每个 route/action 模块一遍,
// 这一步就会执行到这行代码,如果那时候 STRIPE_SECRET_KEY 在构建环境里还没生效
// (环境变量配错范围、没重新部署等),会直接把整个 Vercel 构建炸掉——连跟 Stripe
// 完全无关的页面都发布不出去(2026-09-17 在 Vercel 上真的炸过两次,见 WORKLOG.md)。
// 改成用 Proxy 惰性初始化:只有第一次真正调用 `stripe.xxx(...)` 时才会去读
// 环境变量、建 Stripe 客户端,build 阶段的静态 import 不会触发这一步。
let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY 未配置,无法调用 Stripe(见 .env.example / README)"
      );
    }
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripeClient()[prop as keyof Stripe];
  },
});

// Stripe Connect 开户/回调链接、Checkout 的 success/cancel url 都要拼绝对 URL。
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  // 本地开发没配这个变量时兜底,生产环境应该始终显式配置。
  return "http://localhost:3000";
}
