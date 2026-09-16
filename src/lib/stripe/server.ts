import Stripe from "stripe";

// 单例,避免每次 import 都重新解析 API 版本/建连接。这个 key 是 secret key,
// 只应该在服务端文件(Server Action、Route Handler)里 import 这个模块。
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
