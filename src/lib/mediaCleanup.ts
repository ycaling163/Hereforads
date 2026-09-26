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
 * 删除失败只记日志、不抛异常:清理文件不能让用户的保存/删除操作失败。返回实际删掉的文件数。
 */
// 老的 ad_spaces 日历预订流程(2026-09-17 下线,表结构见 supabase/legacy/)在线上还留着表,
// 里面的图片也在同一个 bucket。新站点没有这些表——查询报"表不存在"就当没有引用,其它错误照常
// 当成"查不清楚",一个都不删。
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

async function legacyReferences(
  service: ReturnType<typeof createServiceClient>,
  candidates: string[]
): Promise<string[] | { error: string }> {
  const results = await Promise.all([
    service.from("ad_spaces").select("photo_urls").overlaps("photo_urls", candidates),
    service.from("campaigns").select("creative_url").in("creative_url", candidates),
    service.from("proof_uploads").select("media_url").in("media_url", candidates),
  ]);
  const urls: string[] = [];
  for (const { data, error } of results) {
    if (error) {
      if (MISSING_TABLE_CODES.has(error.code)) continue;
      return { error: error.message };
    }
    for (const row of (data ?? []) as Record<string, string | string[] | null>[]) {
      for (const value of Object.values(row)) {
        if (Array.isArray(value)) urls.push(...value);
        else if (value) urls.push(value);
      }
    }
  }
  return urls;
}

export async function deleteUnusedMedia(
  userId: string,
  urls: (string | null | undefined)[]
): Promise<number> {
  const candidates = [
    ...new Set(urls.filter((url): url is string => !!url && isOwnStorageUrl(url, MEDIA_BUCKET, userId))),
  ];
  if (candidates.length === 0) return 0;

  try {
    const service = createServiceClient();
    const [legacy, listings, avatars, banners, priceCards, messages, proofs, proofHistoryOld, proofHistoryNew] = await Promise.all([
      legacyReferences(service, candidates),
      service.from("listings").select("media_urls").overlaps("media_urls", candidates),
      service.from("seller_profiles").select("avatar_url").in("avatar_url", candidates),
      service.from("seller_profiles").select("banner_url").in("banner_url", candidates),
      service.from("seller_profiles").select("price_card_image_url").in("price_card_image_url", candidates),
      service.from("listing_messages").select("image_url").in("image_url", candidates),
      // 交付凭证是卖家填的链接,理论上可能贴的就是站内文件,也算"在用"。
      service.from("listing_orders").select("proof_url").in("proof_url", candidates),
      service.from("listing_order_proof_changes").select("old_proof_url").in("old_proof_url", candidates),
      service.from("listing_order_proof_changes").select("new_proof_url").in("new_proof_url", candidates),
    ]);
    const failed = [
      listings, avatars, banners, priceCards, messages, proofs, proofHistoryOld, proofHistoryNew,
    ].find((result) => result.error);
    if (!Array.isArray(legacy)) {
      console.error("Media cleanup skipped, legacy reference check failed:", legacy.error);
      return 0;
    }
    if (failed?.error) {
      // 查不清楚还有没有人在用,就一个都不删。
      console.error("Media cleanup skipped, reference check failed:", failed.error.message);
      return 0;
    }

    const stillUsed = new Set<string>([
      ...legacy,
      ...(listings.data ?? []).flatMap((row) => row.media_urls as string[]),
      ...(avatars.data ?? []).map((row) => row.avatar_url as string),
      ...(banners.data ?? []).map((row) => row.banner_url as string),
      ...(priceCards.data ?? []).map((row) => row.price_card_image_url as string),
      ...(messages.data ?? []).map((row) => row.image_url as string),
      ...(proofs.data ?? []).map((row) => row.proof_url as string),
      ...(proofHistoryOld.data ?? []).map((row) => row.old_proof_url as string),
      ...(proofHistoryNew.data ?? []).map((row) => row.new_proof_url as string),
    ]);
    const paths = candidates
      .filter((url) => !stillUsed.has(url))
      .map((url) => storagePathFromPublicUrl(url, MEDIA_BUCKET))
      .filter((path): path is string => path !== null && path.startsWith(`${userId}/`));
    if (paths.length === 0) return 0;

    const { data: removed, error } = await service.storage.from(MEDIA_BUCKET).remove(paths);
    if (error) {
      console.error("Media cleanup failed:", error.message);
      return 0;
    }
    return removed?.length ?? 0;
  } catch (err) {
    console.error("Media cleanup failed:", err);
    return 0;
  }
}
