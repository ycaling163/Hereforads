import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed middleware.ts -> proxy.ts (same mechanism, new name).
// This keeps the Supabase auth session cookie fresh on every request so
// Server Components can reliably read the logged-in user.
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session if expired — required for Server Components.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 被封禁的账号:数据库那边 profiles.is_banned 是即时生效的(管理员一点封禁就是
  // true),但用户手上的 access token 在过期刷新之前(通常一小时内)本来就还有效——
  // 光靠 Supabase Auth 那个 ban_duration 挡不住这一小时的窗口,这里加一道每次请求都
  // 查一次 is_banned 的检查,发现被封就立刻登出、跳去一个说明页面,不用等 token 过期。
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_banned) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/banned";
      url.search = "";
      // signOut() 的 setAll 回调把清空会话的 Set-Cookie 写进了 supabaseResponse,
      // 这里要建一个新的 redirect 响应,不能直接把 supabaseResponse 的 cookie 丢掉,
      // 不然浏览器那边的登录 cookie 不会真的被清掉。
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
