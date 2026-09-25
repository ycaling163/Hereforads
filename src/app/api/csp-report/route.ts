// CSP Report-Only 的违规报告(见 next.config.ts)。只记日志,方便上线后在 Vercel Logs 里
// 搜 "CSP violation" 看有没有被误伤的资源,确认没问题再把 CSP 改成强制。
export async function POST(request: Request) {
  const body = (await request.text()).slice(0, 2000);
  console.warn("CSP violation:", body);
  return new Response(null, { status: 204 });
}
