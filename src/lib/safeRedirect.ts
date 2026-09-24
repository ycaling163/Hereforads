// Whitelists a "where to send the user after auth" path coming from a query
// param / hidden form field. Only a same-site relative path is allowed
// ("/dashboard/new-listing") — anything else (a bare "//evil.com" or an
// absolute "https://..." URL, both of which browsers/redirect() will happily
// follow off-site) falls back to the default instead of becoming an open
// redirect.
//
// 2026-09-24 安全核查:浏览器解析 URL 时会把 "\" 当成 "/"、并且删掉制表符/换行,
// 所以 "/\evil.com"、"/\t/evil.com" 都会变成 "//evil.com" 跳到站外。这里直接拒绝
// 反斜杠和控制字符,再用 URL 解析器确认解析结果仍然是本站。
const BASE = "https://hereforads.invalid";

export function safeRedirectPath(path: string | null | undefined, fallback: string): string {
  if (!path) return fallback;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return fallback;
  try {
    if (new URL(path, BASE).origin !== BASE) return fallback;
  } catch {
    return fallback;
  }
  return path;
}
