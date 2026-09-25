import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * 只给服务端 webhook 用(比如 Stripe webhook)—— 用 service_role key,
 * 绕过 RLS 直接写 payments/listing_orders/profiles。这个 key 是高权限密钥,
 * 千万不能带 NEXT_PUBLIC_ 前缀,不能出现在任何会打进浏览器端 bundle 的代码里。
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
