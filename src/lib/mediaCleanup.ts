import "server-only";
import { MEDIA_BUCKET } from "@/config/site";
import { createServiceClient } from "@/lib/supabase/service";
import { storagePathFromPublicUrl } from "@/lib/storage";
import { isOwnStorageUrl } from "@/lib/uploads";

/**
 * 删掉用户不再用到的媒体文件(删广告、编辑广告时去掉图片、换头像/横幅)。调用方要在
 * 数据库已经改好之后再调,保证不会出现"记录还指着一个已删掉的文件"。
 *
 * - 只删这个用户自己文件夹(`{userId}/...`)下的文件,别人的文件和外部链接一律跳过;
 * - 删之前查一遍还有没有别的地方在用——"复制广告"会让两条广告共用同一批文件,
 *   另外头像、横幅、价目表图片、私信图片也都在同一个 bucket——还在用的留着;
 * - 用 service_role 删:storage 没给用户开 delete 权限(见 README"安全复查")。
 *
 * 删除失败只记日志、不抛异常:清理文件不能让用户的保存/删除操作失败。
 */
export async function deleteUnusedMedia(userId: string, urls: (string | null | undefined)[]) {
  const candidates = [
    ...new Set(urls.filter((url): url is string => !!url && isOwnStorageUrl(url, MEDIA_BUCKET, userId))),
  ];
  if (candidates.length === 0) return;

  try {
    const service = createServiceClient();
    const [listings, avatars, banners, priceCards, messages] = await Promise.all([
      service.from("listings").select("media_urls").overlaps("media_urls", candidates),
      service.from("seller_profiles").select("avatar_url").in("avatar_url", candidates),
      service.from("seller_profiles").select("banner_url").in("banner_url", candidates),
      service.from("seller_profiles").select("price_card_image_url").in("price_card_image_url", candidates),
      service.from("listing_messages").select("image_url").in("image_url", candidates),
    ]);
    const failed = [listings, avatars, banners, priceCards, messages].find((result) => result.error);
    if (failed?.error) {
      // 查不清楚还有没有人在用,就一个都不删。
      console.error("Media cleanup skipped, reference check failed:", failed.error.message);
      return;
    }

    const stillUsed = new Set<string>([
      ...(listings.data ?? []).flatMap((row) => row.media_urls as string[]),
      ...(avatars.data ?? []).map((row) => row.avatar_url as string),
      ...(banners.data ?? []).map((row) => row.banner_url as string),
      ...(priceCards.data ?? []).map((row) => row.price_card_image_url as string),
      ...(messages.data ?? []).map((row) => row.image_url as string),
    ]);
    const paths = candidates
      .filter((url) => !stillUsed.has(url))
      .map((url) => storagePathFromPublicUrl(url, MEDIA_BUCKET))
      .filter((path): path is string => path !== null && path.startsWith(`${userId}/`));
    if (paths.length === 0) return;

    const { error } = await service.storage.from(MEDIA_BUCKET).remove(paths);
    if (error) console.error("Media cleanup failed:", error.message);
  } catch (err) {
    console.error("Media cleanup failed:", err);
  }
}
