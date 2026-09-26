/**
 * 上传文件校验(安全核查第 3 批第 12 条):只认白名单里的图片/视频,按文件头(魔数)判断真实
 * 类型,不信浏览器传来的 Content-Type 和文件名;扩展名、上传时的 contentType 都由判断出的
 * 类型决定。防止往公开 bucket 传 HTML/SVG 之类的文件做钓鱼页。
 *
 * Storage bucket 本身也设了 allowed_mime_types / file_size_limit(见 README 第 3 批的 SQL),
 * 挡住绕过我们服务端、直接拿用户 session 调 Storage API 的上传。
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type UploadKind = "image" | "listing_media";

interface Detected {
  contentType: string;
  ext: string;
  video: boolean;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function detect(bytes: Uint8Array): Detected | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", ext: "jpg", video: false };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", ext: "png", video: false };
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return { contentType: "image/gif", ext: "gif", video: false };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { contentType: "image/webp", ext: "webp", video: false };
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { contentType: "video/webm", ext: "webm", video: true };
  }
  if (ascii(bytes, 4, 4) === "ftyp") {
    // QuickTime(.mov)的品牌是 "qt  ",其余 ISO 媒体(mp4/m4v/iPhone 的 hevc 等)按 mp4 处理。
    return ascii(bytes, 8, 4) === "qt  "
      ? { contentType: "video/quicktime", ext: "mov", video: true }
      : { contentType: "video/mp4", ext: "mp4", video: true };
  }
  return null;
}

export type CheckedUpload =
  | { ok: true; file: File; contentType: string; ext: string }
  | { ok: false; error: string };

export async function checkUpload(file: File, kind: UploadKind): Promise<CheckedUpload> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `"${file.name}" is larger than 10 MB` };
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detect(head);
  const allowed = detected && (kind === "listing_media" || !detected.video);
  if (!detected || !allowed) {
    return {
      ok: false,
      error:
        kind === "listing_media"
          ? `"${file.name}" isn't a supported file — use JPG, PNG, WebP, GIF, MP4, WebM or MOV`
          : `"${file.name}" isn't a supported image — use JPG, PNG, WebP or GIF`,
    };
  }
  return { ok: true, file, contentType: detected.contentType, ext: detected.ext };
}

/** 广告媒体里"沿用已有文件"的 URL,只认这个用户自己在 bucket 里的文件(第 3 批第 20 条)。 */
export function isOwnStorageUrl(url: string, bucket: string, userId: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return false;
  return url.startsWith(`${base}/storage/v1/object/public/${bucket}/${userId}/`) && !url.includes("..");
}

/**
 * 浏览器直传到 Storage 的广告视频(绕开 Server Action / Vercel 约 4.5MB 的请求体上限,见
 * ListingMediaManager):保存时服务端再按文件头确认一次它真的是允许的视频,不信客户端。
 * 只接受这个用户 `{userId}/listings/` 下的文件。
 */
export async function verifyDirectVideoUpload(
  url: string,
  bucket: string,
  userId: string
): Promise<boolean> {
  if (!isOwnStorageUrl(url, bucket, userId) || !url.includes(`/${userId}/listings/`)) {
    return false;
  }
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-15" }, cache: "no-store" });
    if (!response.ok) return false;
    const head = new Uint8Array(await response.arrayBuffer()).slice(0, 16);
    return detect(head)?.video === true;
  } catch {
    return false;
  }
}
