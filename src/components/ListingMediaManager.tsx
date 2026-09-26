"use client";

import { useEffect, useRef, useState } from "react";
import { MediaPreview, PlayBadge } from "@/components/MediaPreview";
import { compressImage } from "@/lib/compressImage";
import { createClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET } from "@/config/site";
import {
  MAX_LISTING_MEDIA,
  MAX_NEW_MEDIA_BYTES_PER_SAVE,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_LONG_EDGE,
  MAX_VIDEO_SECONDS,
  MAX_VIDEO_SHORT_EDGE,
  isVideoUrl,
} from "@/lib/listingMedia";

type MediaItem =
  | { kind: "existing"; key: string; url: string }
  | { kind: "new"; key: string; file: File; preview: string }
  // 视频不走表单提交,选完就直传 Storage(见下面 addVideo);上传完成后 url 才有值。
  | { kind: "video"; key: string; preview: string; url: string | null };

const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** 读视频的时长和分辨率;浏览器解不了(比如某些 HEVC 编码)就返回 null。 */
function readVideoInfo(file: File): Promise<{ seconds: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (info: { seconds: number; width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(info);
    };
    video.preload = "metadata";
    video.muted = true;
    const report = () =>
      done(
        video.videoWidth > 0
          ? { seconds: video.duration, width: video.videoWidth, height: video.videoHeight }
          : null
      );
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        report();
        return;
      }
      // 部分 WebM 文件头里没写时长(duration 是 Infinity),跳到末尾让浏览器算出来。
      video.ondurationchange = () => {
        if (Number.isFinite(video.duration)) report();
      };
      video.currentTime = Number.MAX_SAFE_INTEGER;
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

const labelClass = "text-sm font-medium text-zinc-700";
const actionButtonClass =
  "rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-700 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-zinc-900 disabled:opacity-40";

/** 删掉直传后没用上的视频(见 /api/media/discard);关页面时也能发出去。 */
function discardUploads(urls: string[]) {
  if (urls.length === 0) return;
  fetch("/api/media/discard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
    keepalive: true,
  }).catch(() => {
    // 删不掉也没关系,每天的定时清理(/api/cron/media-cleanup)会兜底。
  });
}

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 发布/编辑广告时的媒体管理:已上传的和这次新选的文件放在同一个网格里,每张都能看到、
 * 删除、设为封面(第一张就是封面)、左右调整顺序。
 *
 * 提交给 Server Action 的字段:
 * - existing_media:保留的已有文件 URL(多个);
 * - media:新文件,按网格里的先后顺序放进一个隐藏的 file input;
 * - direct_media:已经直传到 Storage 的视频 URL(服务端会再按文件头校验);
 * - media_order:最终顺序(见 orderListingMedia),直传的视频和已有文件一样用 `e:<url>`。
 *
 * 视频限制:10 秒以内、最高 1080p、单个不超过 25MB,在这里选文件时检查。视频不经过
 * Server Action 是因为 Vercel 函数请求体上限约 4.5MB,10 秒 1080p 的视频一般 10–20MB。
 *
 * 新文件用一个单独的"添加"input 选,选完就追加进列表、再清空那个 input——原生的
 * multiple file input 每次重新选择都会把上次选的覆盖掉,之前"先选两张图、再选一个视频"
 * 最后只剩视频,就是这个原因。
 */
export function ListingMediaManager({
  initialUrls,
  userId,
  hint,
}: {
  initialUrls: string[];
  /** 直传视频的存放路径 `{userId}/listings/...`,跟 Storage 的 insert 策略对应。 */
  userId: string;
  hint?: string;
}) {
  const [items, setItems] = useState<MediaItem[]>(() =>
    initialUrls.map((url) => ({ kind: "existing", key: `e:${url}`, url }))
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const submitInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);

  const newItems = items.filter(
    (item): item is Extract<MediaItem, { kind: "new" }> => item.kind === "new"
  );
  const newBytes = newItems.reduce((sum, item) => sum + item.file.size, 0);
  const uploadingVideos = items.some((item) => item.kind === "video" && !item.url);
  const uploadingRef = useRef(uploadingVideos);
  const submittingRef = useRef(false);
  uploadingRef.current = uploadingVideos;

  // 把新文件(按网格顺序)同步进真正随表单提交的那个隐藏 input。
  useEffect(() => {
    itemsRef.current = items;
    syncSubmitInput();
  }, [items]);

  function syncSubmitInput() {
    const input = submitInputRef.current;
    if (!input) return;
    const transfer = new DataTransfer();
    for (const item of itemsRef.current) {
      if (item.kind === "new") transfer.items.add(item.file);
    }
    input.files = transfer.files;
  }

  // React 19 的 form action 提交完会 reset 表单(包括返回错误的时候),隐藏 input 里的
  // 文件会被清掉,但网格里还显示着——reset 之后重新塞回去,用户改完错误直接再点保存就行。
  useEffect(() => {
    const form = submitInputRef.current?.form;
    if (!form) return;
    const resync = () => setTimeout(syncSubmitInput, 0);
    form.addEventListener("reset", resync);
    return () => form.removeEventListener("reset", resync);
  }, []);

  // 视频还在上传时拦住提交,不然保存下来的广告会少一个视频。在 form 上用捕获阶段
  // 监听并停止传播,React 的 action 就不会执行。
  useEffect(() => {
    const form = submitInputRef.current?.form;
    if (!form) return;
    const guard = (event: SubmitEvent) => {
      if (!uploadingRef.current) {
        submittingRef.current = true;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setNotice("Please wait until the video finishes uploading, then save again.");
    };
    // 保存返回错误时 React 会 reset 表单,说明这次提交结束了。
    const settled = () => {
      submittingRef.current = false;
    };
    form.addEventListener("submit", guard, true);
    form.addEventListener("reset", settled);
    return () => {
      form.removeEventListener("submit", guard, true);
      form.removeEventListener("reset", settled);
    };
  }, []);

  // 没保存就离开(关标签页、跳到别的页面):把这次直传的视频删掉。保存成功后页面也会
  // 卸载、同样会发请求,但那时视频已经被广告引用,服务端查到在用就不会删。正在保存的
  // 时候不发,免得跟保存抢跑。
  useEffect(() => {
    const discardUnsaved = () => {
      if (submittingRef.current) return;
      discardUploads(
        itemsRef.current.flatMap((item) => (item.kind === "video" && item.url ? [item.url] : []))
      );
    };
    window.addEventListener("pagehide", discardUnsaved);
    return () => {
      window.removeEventListener("pagehide", discardUnsaved);
      discardUnsaved();
    };
  }, []);

  // 卸载时释放本地预览用的 blob URL。
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        if (item.kind !== "existing") URL.revokeObjectURL(item.preview);
      }
    },
    []
  );

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_LISTING_MEDIA - items.length;
    const picked = Array.from(files).slice(0, Math.max(room, 0));
    if (pickerRef.current) pickerRef.current.value = "";
    setNotice(
      picked.length < files.length
        ? `You can add up to ${MAX_LISTING_MEDIA} photos/videos per listing — ${
            files.length - picked.length
          } file(s) were skipped.`
        : null
    );
    if (picked.length === 0) return;

    picked.filter((file) => file.type.startsWith("video/")).forEach(addVideo);
    const images = picked.filter((file) => !file.type.startsWith("video/"));
    if (images.length === 0) return;

    setOptimizing(true);
    try {
      const accepted = await Promise.all(images.map(compressImage));
      setItems((current) => [
        ...current,
        ...accepted
          .slice(0, Math.max(MAX_LISTING_MEDIA - current.length, 0))
          .map((file) => ({
            kind: "new" as const,
            key: `n:${crypto.randomUUID()}`,
            file,
            preview: URL.createObjectURL(file),
          })),
      ]);
    } finally {
      setOptimizing(false);
    }
  }

  async function addVideo(file: File) {
    const fail = (message: string) =>
      setNotice((current) => (current ? `${current} ${message}` : message));

    const ext = VIDEO_EXT[file.type];
    if (!ext) {
      fail(`"${file.name}" isn't a supported video — please use MP4.`);
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      fail(`"${file.name}" is ${formatMb(file.size)} — videos can be up to ${formatMb(MAX_VIDEO_BYTES)}.`);
      return;
    }
    const info = await readVideoInfo(file);
    if (!info) {
      fail(`"${file.name}" can't be played in the browser — please export it as MP4 (H.264).`);
      return;
    }
    if (info.seconds > MAX_VIDEO_SECONDS + 0.5) {
      fail(`"${file.name}" is ${Math.round(info.seconds)}s long — videos can be up to ${MAX_VIDEO_SECONDS} seconds.`);
      return;
    }
    const longEdge = Math.max(info.width, info.height);
    const shortEdge = Math.min(info.width, info.height);
    if (longEdge > MAX_VIDEO_LONG_EDGE || shortEdge > MAX_VIDEO_SHORT_EDGE) {
      fail(`"${file.name}" is ${info.width}×${info.height} — videos can be up to 1080p.`);
      return;
    }

    if (itemsRef.current.length >= MAX_LISTING_MEDIA) {
      fail(`"${file.name}" was skipped — up to ${MAX_LISTING_MEDIA} photos/videos per listing.`);
      return;
    }
    const key = `v:${crypto.randomUUID()}`;
    const preview = URL.createObjectURL(file);
    const item: MediaItem = { kind: "video", key, preview, url: null };
    itemsRef.current = [...itemsRef.current, item];
    setItems((current) => [...current, item]);

    const supabase = createClient();
    const path = `${userId}/listings/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (error) {
      setItems((current) => current.filter((item) => item.key !== key));
      URL.revokeObjectURL(preview);
      fail(`"${file.name}" failed to upload: ${error.message}`);
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    // 上传过程中用户已经把它删了:文件刚落地,直接删掉。
    if (!itemsRef.current.some((item) => item.key === key)) {
      discardUploads([publicUrl]);
      return;
    }
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, url: publicUrl } : item))
    );
  }

  function remove(key: string) {
    const target = itemsRef.current.find((item) => item.key === key);
    if (target?.kind === "video" && target.url) discardUploads([target.url]);
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target && target.kind !== "existing") URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.key !== key);
    });
    setNotice(null);
  }

  function makeCover(key: string) {
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (!target) return current;
      return [target, ...current.filter((item) => item.key !== key)];
    });
  }

  function move(index: number, delta: -1 | 1) {
    setItems((current) => {
      const to = index + delta;
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  // media_order 里新文件用它在 media input 里的下标表示。
  let newIndex = 0;
  const order = items.flatMap((item) =>
    item.kind === "existing"
      ? [`e:${item.url}`]
      : item.kind === "video"
        ? item.url
          ? [`e:${item.url}`]
          : []
        : [`n:${newIndex++}`]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={labelClass}>
          Photos & videos{" "}
          <span className="font-normal text-zinc-500">
            ({items.length}/{MAX_LISTING_MEDIA})
          </span>
        </p>
        <p className="text-xs text-zinc-500">
          The first one is the cover. Photos are resized for the web automatically. Videos: MP4, up to {MAX_VIDEO_SECONDS} seconds, max 1080p.
        </p>
      </div>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}

      <input type="hidden" name="media_order" value={JSON.stringify(order)} />
      {items.map((item) =>
        item.kind === "existing" ? (
          <input key={item.key} type="hidden" name="existing_media" value={item.url} />
        ) : item.kind === "video" && item.url ? (
          <input key={item.key} type="hidden" name="direct_media" value={item.url} />
        ) : null
      )}
      <input
        ref={submitInputRef}
        type="file"
        name="media"
        multiple
        tabIndex={-1}
        aria-hidden
        className="hidden"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item, index) => {
          const url = item.kind === "existing" ? item.url : item.preview;
          const video =
            item.kind === "existing" ? isVideoUrl(item.url) : item.kind === "video";
          const uploading = item.kind === "video" && !item.url;
          return (
            <div
              key={item.key}
              className={`relative overflow-hidden rounded-lg border bg-zinc-100 ${
                index === 0 ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200"
              }`}
            >
              <MediaPreview
                url={url}
                isVideo={video}
                className="aspect-square w-full object-cover"
              />
              {video && !uploading && <PlayBadge />}
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-xs font-medium text-zinc-700">
                  Uploading…
                </span>
              )}

              <div className="absolute left-1.5 top-1.5 flex gap-1">
                {index === 0 ? (
                  <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white">
                    Cover
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeCover(item.key)}
                    className={actionButtonClass}
                  >
                    Set as cover
                  </button>
                )}
                {item.kind !== "existing" && (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
                    New
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => remove(item.key)}
                aria-label={`Remove ${video ? "video" : "image"} ${index + 1}`}
                title="Remove"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900/70 text-xs text-white transition-colors hover:bg-red-600"
              >
                ✕
              </button>

              {items.length > 1 && (
                <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Move earlier"
                    className={actionButtonClass}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    aria-label="Move later"
                    className={actionButtonClass}
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {items.length < MAX_LISTING_MEDIA && (
          <label
            htmlFor="media_picker"
            className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-zinc-500 transition-colors hover:border-zinc-900 hover:text-zinc-900"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-xs font-medium">Add photos / videos</span>
          </label>
        )}
      </div>
      <input
        ref={pickerRef}
        id="media_picker"
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm"
        multiple
        className="sr-only"
        onChange={(event) => addFiles(event.target.files)}
      />

      {optimizing && <p className="text-xs text-zinc-500">Optimizing images for the web…</p>}
      {notice && <p className="text-xs text-amber-700">{notice}</p>}
      {newBytes > MAX_NEW_MEDIA_BYTES_PER_SAVE && (
        <p className="text-xs text-red-600">
          New files add up to {formatMb(newBytes)} — one save can upload about{" "}
          {formatMb(MAX_NEW_MEDIA_BYTES_PER_SAVE)} in total. Save with fewer new files, then
          edit the listing again to add the rest.
        </p>
      )}
    </div>
  );
}
