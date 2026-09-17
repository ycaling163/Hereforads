import Stripe from "stripe";

let stripeClient: Stripe | null = null;

// 惰性初始化 + 单例:避免在没配置 STRIPE_SECRET_KEY 的环境(比如还没接支付的
// 本地/预览分支)里,一 import 这个文件就直接崩溃。
export function getStripe(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY 未配置,无法调用 Stripe(见 .env.example / README 支付章节)"
    );
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  // 本地开发没配这个变量时兜底,生产环境应该始终显式配置。
  return "http://localhost:3000";
}
