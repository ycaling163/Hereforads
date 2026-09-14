import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// See the note in lib/supabase/client.ts about why there's no `Database`
// generic here.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — safe to ignore because
            // the proxy (see proxy.ts) refreshes the session on every request.
          }
        },
      },
    }
  );
}
