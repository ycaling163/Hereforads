"use client";

import { useEffect, useRef, useState } from "react";
import { MediaPreview, PlayBadge } from "@/components/MediaPreview";
import { compressImage } from "@/lib/compressImage";
import {
  MAX_LISTING_MEDIA,
  MAX_NEW_MEDIA_BYTES_PER_SAVE,
  isVideoUrl,
} from "@/lib/listingMedia";

type MediaItem =
  | { kind: "existing"; key: string; url: string }
  | { kind: "new"; key: string; file: File; preview: string };

const labelClass = "text-sm font-medium text-zinc-700";
const actionButtonClass =
  "rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-700 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-zinc-900 disabled:opacity-40";

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
 * - media_order:最终顺序(见 orderListingMedia)。
 *
 * 新文件用一个单独的"添加"input 选,选完就追加进列表、再清空那个 input——原生的
 * multiple file input 每次重新选择都会把上次选的覆盖掉,之前"先选两张图、再选一个视频"
 * 最后只剩视频,就是这个原因。
 */
export function ListingMediaManager({
  initialUrls,
  hint,
}: {
  initialUrls: string[];
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

  // 卸载时释放本地预览用的 blob URL。
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        if (item.kind === "new") URL.revokeObjectURL(item.preview);
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

    setOptimizing(true);
    try {
      const accepted = await Promise.all(picked.map(compressImage));
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

  function remove(key: string) {
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target?.kind === "new") URL.revokeObjectURL(target.preview);
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
  const order = items.map((item) =>
    item.kind === "existing" ? `e:${item.url}` : `n:${newIndex++}`
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
          The first one is the cover. Photos are resized for the web automatically; keep videos short (MP4, WebM or MOV).
        </p>
      </div>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}

      <input type="hidden" name="media_order" value={JSON.stringify(order)} />
      {items.map((item) =>
        item.kind === "existing" ? (
          <input key={item.key} type="hidden" name="existing_media" value={item.url} />
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
            item.kind === "existing"
              ? isVideoUrl(item.url)
              : item.file.type.startsWith("video/");
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
              {video && <PlayBadge />}

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
                {item.kind === "new" && (
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
        accept="image/*,video/*"
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
