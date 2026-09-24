import { createServiceClient } from "@/lib/supabase/service";

// 订单通知邮件,走 Resend 的 HTTP API(跟 Supabase 发登录/验证邮件用的是同一个
// Resend 账号和已验证的 hereforads.com 域名,见 README"订单邮件通知"一节)。
// 环境变量:RESEND_API_KEY(必填,没配就只打日志不发)、EMAIL_FROM(可选)。
// 发信失败只记日志、从不抛异常——邮件是通知,不能让它把付款/取消流程搞挂。

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const FROM = process.env.EMAIL_FROM ?? "HereForAds <hello@hereforads.com>";

export function siteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailContent {
  subject: string;
  // 纯文本段落;每段会转义后包进 <p>,同时拼成纯文本版本(纯文本版本能降低进垃圾箱的概率)。
  paragraphs: string[];
  // 订单详情(订单号、广告、卖家……),渲染成两列表格,放在正文段落后面。
  details?: [string, string][];
  cta?: { label: string; path: string };
}

export async function sendEmail(to: string | null | undefined, content: EmailContent) {
  if (!to) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set, skipping email:", content.subject);
    return;
  }

  const ctaUrl = content.cta ? siteUrl(content.cta.path) : null;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#18181b;max-width:560px">
${content.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
${
  content.details && content.details.length > 0
    ? `<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">${content.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 12px 6px 0;color:#71717a;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;color:#18181b">${escapeHtml(value)}</td></tr>`
        )
        .join("")}</table>`
    : ""
}
${
  content.cta && ctaUrl
    ? `<p><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none">${escapeHtml(content.cta.label)}</a></p>`
    : ""
}
<p style="color:#71717a;font-size:13px">HereForAds · ${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}</p>
</div>`;
  const text = [
    ...content.paragraphs,
    ...(content.details && content.details.length > 0
      ? [content.details.map(([label, value]) => `${label}: ${value}`).join("\n")]
      : []),
    ...(content.cta && ctaUrl ? [`${content.cta.label}: ${ctaUrl}`] : []),
    "HereForAds",
  ].join("\n\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject: content.subject, html, text }),
    });
    if (!res.ok) {
      console.error("Resend send failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Resend send error:", err);
  }
}

/** 用 service_role 从 auth.users 查邮箱(guest 也是真实账号,见"Guest 结账")。 */
export async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await createServiceClient().auth.admin.getUserById(userId);
  if (error) {
    console.error("Failed to look up user email:", userId, error.message);
    return null;
  }
  return data.user?.email ?? null;
}

/**
 * 给管理员发告警(拒付、Stripe 后台退款、放款被挡下等需要人工处理的事)。收件人是
 * 环境变量 ADMIN_ALERT_EMAIL;没配的话只打日志。按钮默认指向 /admin/holds。
 */
export async function sendAdminAlert(
  subject: string,
  paragraphs: string[],
  details?: [string, string][]
) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to) {
    console.warn("ADMIN_ALERT_EMAIL not set, admin alert not emailed:", subject, paragraphs);
    return;
  }
  await sendEmail(to, {
    subject: `[HereForAds admin] ${subject}`,
    paragraphs,
    details,
    cta: { label: "Open disputes & holds", path: "/admin/holds" },
  });
}
