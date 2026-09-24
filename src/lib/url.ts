// 卖家填链接时常常只写 "youtube.com/shorts/…" 或 "www.example.com",不带 https://。
// 浏览器自带的 type="url" 校验会直接拒绝这种写法,所以表单用普通文本框,由这里补上
// https:// 再校验。只接受 http/https(挡住 javascript: 之类的链接,这些链接会被
// 渲染成买家/访客能点的 <a href>),域名里必须有点(挡住随手打的一个词)。
export function normalizeWebUrl(raw: string): { value: string } | { error: string } {
  const trimmed = raw.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".")) {
      return { value: url.toString() };
    }
  } catch {
    // 落到下面统一报错
  }
  return { error: "Please enter a valid link, e.g. youtube.com/shorts/…" };
}
