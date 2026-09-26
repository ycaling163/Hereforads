// 上传前在浏览器里压缩图片(产品负责人 2026-09-26:只需要常规网站的清晰度)。
// 长边缩到 MAX_EDGE 以内、重新编码成 WebP(浏览器不支持就用 JPEG),通常一张手机照片
// 从 3–8MB 降到几百 KB,页面加载更快,也不容易撞上请求体大小上限。
//
// 不处理的情况,原文件照传:视频、GIF(会丢动画)、已经很小且尺寸不大的图、浏览器解码
// 失败的格式(比如部分浏览器不认 HEIC,交给服务端按原规则校验)、压完反而更大的。

const MAX_EDGE = 1920;
const QUALITY = 0.82;
const SKIP_BELOW_BYTES = 300 * 1024;

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  let bitmap: ImageBitmap;
  try {
    // createImageBitmap 默认按 EXIF 方向摆正,手机竖拍的照片不会被转横。
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SKIP_BELOW_BYTES) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // 老版本 Safari 不支持编码 WebP,会悄悄返回 PNG——那就改用 JPEG。
    let blob = await toBlob(canvas, "image/webp");
    if (!blob || blob.type !== "image/webp") {
      blob = await toBlob(canvas, "image/jpeg");
    }
    if (!blob || blob.size >= file.size) return file;

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const name = `${file.name.replace(/\.[^.]*$/, "") || "image"}.${ext}`;
    return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
