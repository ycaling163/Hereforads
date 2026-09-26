// 广告媒体(listings.media_urls)的共用规则,前后端都用:第一张是封面;图片和视频混在同一个
// 数组里,按扩展名区分(上传时扩展名由文件头判断得出,见 src/lib/uploads.ts)。

/** 一条广告最多几个媒体文件(图片 + 视频合计)。 */
export const MAX_LISTING_MEDIA = 10;

/**
 * 一次保存里新上传文件的合计大小上限。Server Action 请求体上限是 10MB(next.config.ts),
 * 表单其它字段也占一点,留点余量;超了请求会直接被拒,所以前端提前提示。
 */
export const MAX_NEW_MEDIA_BYTES_PER_SAVE = 9.5 * 1024 * 1024;

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXTENSIONS.test(url);
}

/**
 * 编辑表单里提交的顺序(隐藏字段 media_order,JSON 字符串数组):
 * - `"e:<url>"`:保留的已有文件;
 * - `"n:<i>"`:这次新上传的第 i 个文件(按 formData 里 media 的顺序)。
 * 按它拼出最终的 media_urls。只认 keptUrls(已经校验过是本人 bucket 里的文件)和本次上传
 * 结果,其它一律忽略;没被 order 提到的文件按原顺序补在最后,保证不会丢。
 */
export function orderListingMedia(
  rawOrder: FormDataEntryValue | null,
  keptUrls: string[],
  uploadedUrls: string[]
): string[] {
  let order: unknown = null;
  if (typeof rawOrder === "string" && rawOrder) {
    try {
      order = JSON.parse(rawOrder);
    } catch {
      order = null;
    }
  }

  const kept = new Set(keptUrls);
  const result: string[] = [];
  const push = (url: string | undefined) => {
    if (url && !result.includes(url)) result.push(url);
  };

  if (Array.isArray(order)) {
    for (const token of order) {
      if (typeof token !== "string") continue;
      if (token.startsWith("e:")) {
        const url = token.slice(2);
        if (kept.has(url)) push(url);
      } else if (token.startsWith("n:")) {
        const index = Number(token.slice(2));
        if (Number.isInteger(index) && index >= 0) push(uploadedUrls[index]);
      }
    }
  }
  keptUrls.forEach(push);
  uploadedUrls.forEach(push);
  return result;
}
