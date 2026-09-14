import { createBrowserClient } from "@supabase/ssr";

// Not using a generated `Database` generic here: this project's Supabase
// schema is hand-inspected (see lib/supabase/types.ts), not codegen'd, so
// the tables are typed at the call site instead of via the client generic.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
