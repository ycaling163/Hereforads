// 赞助商展示(README"赞助商展示"一节):买家自愿在广告页展示的品牌名 + 一个链接,
// 以及卖家给没被预订的日子设的自选展示(house ads)。这里是前后端共用的规则。

export const SPONSOR_NAME_MAX = 60;
export const SPONSOR_URL_MAX = 300;
export const MAX_HOUSE_ADS = 5;

/** 付款成功、可以展示的订单状态;待付款和已取消的不展示。 */
export const SPONSOR_VISIBLE_STATUSES = [
  "paid_in_escrow",
  "delivered",
  "confirmed",
  "released",
  "expired_auto_confirmed",
] as const;

/** 因退款、拒付暂停放款的订单不展示(被封卖家那种暂停不影响买家)。 */
export const SPONSOR_BLOCKING_HOLDS = ["refund", "dispute"] as const;

export function normalizeSponsorName(raw: string): { name: string } | { error: string } {
  // 去掉控制字符和多余空白;展示时 React 会转义,这里只管长度和内容干净。
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return { error: "Please enter a brand name" };
  if (name.length > SPONSOR_NAME_MAX) {
    return { error: `Brand name can be at most ${SPONSOR_NAME_MAX} characters` };
  }
  return { name };
}

/**
 * 只接受一个普通的 http(s) 网址:没写协议的补 https://;拒绝其它协议(javascript:、
 * data: 等)、带用户名密码的、IP 地址和 localhost、没有点的主机名。
 */
export function normalizeSponsorUrl(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim();
  const invalid = { error: "Please enter one valid website or social media link" };
  if (!trimmed || /\s/.test(trimmed)) return invalid;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return invalid;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.startsWith("[")
  ) {
    return invalid;
  }
  const url = parsed.toString();
  if (url.length > SPONSOR_URL_MAX) {
    return { error: `Link can be at most ${SPONSOR_URL_MAX} characters` };
  }
  return { url };
}

/**
 * 链接旁边显示的"要去哪":域名去掉 www.,社交账号这类带第一段路径(instagram.com/zara)。
 * 让人点之前就看得到目的地。
 */
export function sponsorLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const first = parsed.pathname.split("/").filter(Boolean)[0];
    const label = first ? `${host}/${first}` : host;
    return label.length > 40 ? `${label.slice(0, 39)}…` : label;
  } catch {
    return "";
  }
}

/** 按日期从卖家的自选展示里挑一条:同一条广告同一天结果固定,刷新不会变。 */
export function pickHouseAd<T>(ads: T[], listingId: string, date: string): T | null {
  if (ads.length === 0) return null;
  let hash = 0;
  for (const char of `${listingId}:${date}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return ads[hash % ads.length];
}

export interface SponsorFields {
  sponsor_name: string;
  sponsor_url: string | null;
  sponsor_public: true;
}

/**
 * 付款页的可选项:勾了"公开展示"才处理,品牌名必填、链接可选(填了就必须是合法的一个链接)。
 * 没勾返回 null(订单上什么都不存)。
 */
export function parseSponsorFields(
  formData: FormData
): { fields: SponsorFields | null } | { error: string } {
  if (formData.get("sponsor_public") !== "on") return { fields: null };
  const name = normalizeSponsorName(String(formData.get("sponsor_name") ?? ""));
  if ("error" in name) return name;
  const rawUrl = String(formData.get("sponsor_url") ?? "").trim();
  let url: string | null = null;
  if (rawUrl) {
    const normalized = normalizeSponsorUrl(rawUrl);
    if ("error" in normalized) return normalized;
    url = normalized.url;
  }
  return { fields: { sponsor_name: name.name, sponsor_url: url, sponsor_public: true } };
}
