import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// 仅供服务端、无用户会话的场景使用(目前只有 Stripe webhook 一个调用方)。
// service_role key 会绕过所有 RLS 策略,绝不能在这个文件之外的地方 import,
// 更不能让它出现在任何 NEXT_PUBLIC_ 前缀的变量或客户端代码里。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 未配置,webhook 无法在没有用户会话的情况下更新订单状态(见 .env.example)"
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
