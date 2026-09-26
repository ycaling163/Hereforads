import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/config/site";
import { MAX_LISTING_MEDIA } from "@/lib/listingMedia";
import { deleteUnusedMedia } from "@/lib/mediaCleanup";
import { isOwnStorageUrl } from "@/lib/uploads";

/**
 * 删掉编辑页里直传到 Storage、但最后没用上的广告视频(见 ListingMediaManager):用户在
 * 网格里点了删除,或者没保存就离开了页面。
 *
 * 只收当前登录用户 `{userId}/listings/` 下的文件;deleteUnusedMedia 删之前会查一遍还有
 * 没有广告在用——所以保存成功后页面卸载时发来的请求什么也不会删。
 * 用 route handler 而不是 Server Action,是因为关页面时要用 fetch keepalive 发出去。
 */
export async function POST(request: Request) {
  // 只接受本站页面发来的请求(浏览器跨站请求一定带 Origin)。
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let urls: unknown;
  try {
    urls = ((await request.json()) as { urls?: unknown }).urls;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!Array.isArray(urls)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const candidates = urls
    .slice(0, MAX_LISTING_MEDIA)
    .filter(
      (url): url is string =>
        typeof url === "string" &&
        isOwnStorageUrl(url, MEDIA_BUCKET, user.id) &&
        url.includes(`/${user.id}/listings/`)
    );
  const deleted = await deleteUnusedMedia(user.id, candidates);
  return NextResponse.json({ deleted });
}
