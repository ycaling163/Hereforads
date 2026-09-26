import { NextResponse } from "next/server";
import { MEDIA_BUCKET } from "@/config/site";
import { deleteUnusedMedia } from "@/lib/mediaCleanup";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 每天清理一次 Storage 里没人用的文件(见根目录 vercel.json),兜住实时清理漏掉的情况:
 * 直传的视频上传完没保存就关了浏览器、清理请求没发出去、以前没做清理时留下的旧文件等。
 *
 * 只看代码写入过的几个文件夹 `{userId}/{listings|messages|avatar|banner|price-card}/`,只处理
 * 创建超过 24 小时的文件(给正在编辑、还没保存的表单留足时间)。是否在用由
 * deleteUnusedMedia 查数据库决定——广告、头像、横幅、价目表图、私信图片、交付凭证、
 * 老 ad_spaces 流程的表里只要有一处引用就不删。
 *
 * 跟 auto-confirm 一样要求 Authorization: Bearer $CRON_SECRET。
 */
// price-card 是已下线的价目表背景图功能用过的文件夹。
const FOLDERS = ["listings", "messages", "avatar", "banner", "price-card"] as const;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
// deleteUnusedMedia 用 .in() 查引用,URL 放在查询串里,一次别塞太多。
const CHUNK_SIZE = 50;

type StorageClient = ReturnType<typeof createServiceClient>["storage"];

async function listAll(storage: StorageClient, prefix: string) {
  const entries: { name: string; id: string | null; created_at: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await storage
      .from(MEDIA_BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
    entries.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return entries;
  }
}

async function handle(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = Date.now() - MIN_AGE_MS;
  let scanned = 0;
  let deleted = 0;

  try {
    // 顶层都是用户文件夹(list 返回的文件夹条目 id 为 null)。
    const userFolders = (await listAll(service.storage, "")).filter((entry) => entry.id === null);
    for (const { name: userId } of userFolders) {
      const oldUrls: string[] = [];
      for (const folder of FOLDERS) {
        const files = await listAll(service.storage, `${userId}/${folder}`);
        for (const file of files) {
          if (file.id === null || !file.created_at) continue;
          if (new Date(file.created_at).getTime() > cutoff) continue;
          oldUrls.push(
            service.storage.from(MEDIA_BUCKET).getPublicUrl(`${userId}/${folder}/${file.name}`).data
              .publicUrl
          );
        }
      }
      scanned += oldUrls.length;
      for (let i = 0; i < oldUrls.length; i += CHUNK_SIZE) {
        deleted += await deleteUnusedMedia(userId, oldUrls.slice(i, i + CHUNK_SIZE));
      }
    }
  } catch (err) {
    console.error("Media cleanup cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error", scanned, deleted },
      { status: 500 }
    );
  }

  console.log(`Media cleanup cron: scanned ${scanned} old files, deleted ${deleted}`);
  return NextResponse.json({ scanned, deleted });
}

export const GET = handle;
export const POST = handle;
