import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 应用层限流(安全核查第 2 批,见 README"安全核查 · 第 2 批")。
 *
 * Supabase Auth 自己的限流按请求 IP 算,而我们的 Auth 请求都从 Vercel 服务器发出,等于
 * 全站共用一个额度,所以在 server action 里先按访客 IP / 邮箱各算一次。计数存在
 * `rate_limits` 表(固定时间窗,数据库函数 `rate_limit_hit` 原子加一),只给 service_role
 * 用。表里只存 IP/邮箱的 HMAC-SHA256(盐 = 环境变量 RATE_LIMIT_SALT),不存明文。
 *
 * 出错放行(fail-open)并记日志:限流表挂了不能让所有人登录不了,Supabase 自己的限流
 * 还是第二道兜底。
 */

const SALT = process.env.RATE_LIMIT_SALT;
let warnedMissingSalt = false;

/** 访客 IP:Vercel 的 x-forwarded-for 第一个(Vercel 会覆盖客户端传来的值),没有就用 x-real-ip。 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || null;
}

/** IP/邮箱的加盐哈希。没配 RATE_LIMIT_SALT 时返回 null(不存未加盐的哈希),调用方跳过限流。 */
export function hashIdentifier(kind: "ip" | "email", value: string): string | null {
  if (!SALT) {
    if (!warnedMissingSalt) {
      console.error("RATE_LIMIT_SALT is not set — rate limiting is disabled");
      warnedMissingSalt = true;
    }
    return null;
  }
  return createHmac("sha256", SALT).update(`${kind}:${value.trim().toLowerCase()}`).digest("hex");
}

export interface RateLimitRule {
  /** 入口 + 维度,比如 "signin_link:ip"。同一个 bucket 的计数在各入口之间共享。 */
  bucket: string;
  kind: "ip" | "email";
  /** IP 或邮箱;null(比如本地开发拿不到 IP)时这一条不计。 */
  value: string | null | undefined;
  limit: number;
  windowSeconds: number;
}

/** 每条规则各加一次计数;任何一条超额就返回 false。出错的规则当成没超额。 */
export async function checkRateLimits(rules: RateLimitRule[]): Promise<boolean> {
  const results = await Promise.all(
    rules.map(async (rule) => {
      if (!rule.value) return true;
      const key = hashIdentifier(rule.kind, rule.value);
      if (!key) return true;
      try {
        const { data, error } = await createServiceClient().rpc("rate_limit_hit", {
          p_bucket: rule.bucket,
          p_key: key,
          p_limit: rule.limit,
          p_window_seconds: rule.windowSeconds,
        });
        if (error) {
          console.error(`Rate limit check failed (${rule.bucket}), allowing:`, error.message);
          return true;
        }
        if (data === false) {
          console.warn(`Rate limit exceeded: ${rule.bucket}`);
          return false;
        }
        return true;
      } catch (err) {
        console.error(`Rate limit check failed (${rule.bucket}), allowing:`, err);
        return true;
      }
    })
  );
  return results.every(Boolean);
}

const HOUR = 60 * 60;
const QUARTER_HOUR = 15 * 60;

// 额度(产品负责人 2026-09-24 同意,上线后看日志再调),见 README 第 2 批交接一节的表。
export const LIMITS = {
  signInLink: (ip: string | null, email: string) => [
    { bucket: "signin_link:ip", kind: "ip", value: ip, limit: 5, windowSeconds: HOUR },
    { bucket: "signin_link:email", kind: "email", value: email, limit: 3, windowSeconds: HOUR },
  ],
  verifyCode: (ip: string | null, email: string) => [
    { bucket: "verify_code:ip", kind: "ip", value: ip, limit: 10, windowSeconds: QUARTER_HOUR },
    { bucket: "verify_code:email", kind: "email", value: email, limit: 5, windowSeconds: QUARTER_HOUR },
  ],
  findOrder: (ip: string | null) => [
    { bucket: "find_order:ip", kind: "ip", value: ip, limit: 10, windowSeconds: HOUR },
  ],
  guestCheckout: (ip: string | null, email: string) => [
    { bucket: "guest_checkout:ip", kind: "ip", value: ip, limit: 10, windowSeconds: HOUR },
    { bucket: "guest_checkout:email", kind: "email", value: email, limit: 5, windowSeconds: HOUR },
  ],
  contact: (ip: string | null) => [
    { bucket: "contact:ip", kind: "ip", value: ip, limit: 5, windowSeconds: HOUR },
  ],
} satisfies Record<string, (...args: never[]) => RateLimitRule[]>;

export const RATE_LIMITED_MESSAGE = "Too many attempts — please wait a while and try again.";
