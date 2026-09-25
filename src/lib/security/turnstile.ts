/**
 * Cloudflare Turnstile 服务端校验(安全核查第 2 批,见 README"安全核查 · 第 2 批")。
 *
 * 同一个 token 只能验证一次,所以每个入口只选一边校验:
 * - 发登录链接、注册、密码登录:token 作为 captchaToken 交给 Supabase Auth 校验
 *   (Supabase 后台开了 CAPTCHA 之后),我们这边不校验;
 * - 验证码登录(Supabase 的 /verify 接口不校验 CAPTCHA)、guest 下单、/orders/find、
 *   联系表单:我们调 siteverify 校验。
 */

/** 前端 Turnstile 组件把 token 写进表单的这个隐藏字段(Cloudflare 默认字段名)。 */
export const TURNSTILE_FIELD = "cf-turnstile-response";

const SECRET = process.env.TURNSTILE_SECRET_KEY;
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
let warnedMissingSecret = false;

export const TURNSTILE_FAILED_MESSAGE =
  "Please complete the security check above and try again.";

export function turnstileToken(formData: FormData): string {
  return String(formData.get(TURNSTILE_FIELD) ?? "").trim();
}

/**
 * 给交给 Supabase 校验的入口用:页面上有 Turnstile(配了 site key)却没拿到 token,
 * 就别去调 Supabase 了(Supabase 发登录链接的接口先扣限流额度再校验 CAPTCHA,
 * 空 token 的请求也会占全站共用的额度)。
 */
export function missingSupabaseCaptcha(token: string): boolean {
  return !!SITE_KEY && !token;
}

/**
 * 我们自己校验的入口用。没配 TURNSTILE_SECRET_KEY(本地开发)时跳过并记日志;
 * Cloudflare 接口本身出错(网络、5xx)时放行并记日志,跟限流一样 fail-open——
 * token 无效、过期、重复使用则一律拒绝。
 */
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!SECRET) {
    if (!warnedMissingSecret) {
      console.error("TURNSTILE_SECRET_KEY is not set — Turnstile verification is skipped");
      warnedMissingSecret = true;
    }
    return true;
  }
  if (!token || token.length > 2048) return false;

  const body = new URLSearchParams({ secret: SECRET, response: token });
  if (ip) body.set("remoteip", ip);

  let res: Response;
  try {
    res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error("Turnstile siteverify unreachable, allowing:", err);
    return true;
  }
  if (!res.ok) {
    console.error(`Turnstile siteverify returned ${res.status}, allowing`);
    return true;
  }

  const result = (await res.json().catch(() => null)) as
    | { success?: boolean; "error-codes"?: string[] }
    | null;
  if (result?.success) return true;

  const codes = result?.["error-codes"] ?? [];
  // internal-error 是 Cloudflare 那边的问题,不是访客的问题。
  if (codes.includes("internal-error")) {
    console.error("Turnstile siteverify internal-error, allowing");
    return true;
  }
  // secret 配错了会让所有人都过不去,日志里要一眼看出来。
  if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
    console.error("Turnstile secret key is invalid — check TURNSTILE_SECRET_KEY");
  }
  return false;
}
