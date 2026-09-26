import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "@/config/site";
import { deleteUnusedMedia } from "@/lib/mediaCleanup";
import { checkUpload } from "@/lib/uploads";

/**
 * 发布/编辑广告时,把表单里的新图片逐个校验并传到 `{userId}/listings/`。中途任何一个
 * 失败,就把这次已经传上去的删掉再返回错误,不在 Storage 里留下没人用的文件。
 */
export async function uploadListingFiles(
  supabase: SupabaseClient,
  userId: string,
  files: File[]
): Promise<{ urls: string[] } | { error: string }> {
  const urls: string[] = [];
  const fail = async (error: string) => {
    await deleteUnusedMedia(userId, urls);
    return { error };
  };
  try {
    for (const file of files) {
      const checked = await checkUpload(file, "listing_media");
      if (!checked.ok) return fail(checked.error);

      const path = `${userId}/listings/${randomUUID()}.${checked.ext}`;
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: checked.contentType });
      if (error) return fail(`Media upload failed: ${error.message}`);

      urls.push(supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl);
    }
  } catch (err) {
    return fail(`Media upload failed: ${err instanceof Error ? err.message : "unknown error"}`);
  }
  return { urls };
}
