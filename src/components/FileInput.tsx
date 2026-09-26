"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/compressImage";

// 浏览器原生的 <input type="file"> 按钮文字跟着系统语言走(中文系统显示"选择文件 /
// 未选择任何文件"),站点是英文的,所以把原生控件藏起来,换成自己的英文按钮。
// 表单提交时仍然是这个 input 本身带文件,服务端 action 不用改。
// 只收图片的 input(头像、横幅、私信图片)选完会先在浏览器里压缩成网页清晰度
// (src/lib/compressImage.ts),再换回这个 input 里提交。
export function FileInput({
  id,
  name,
  accept,
  multiple,
  buttonLabel = multiple ? "Choose files" : "Choose file",
}: {
  id: string;
  name: string;
  accept?: string;
  multiple?: boolean;
  buttonLabel?: string;
}) {
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [optimizing, setOptimizing] = useState(false);
  const compress = accept === "image/*";

  async function handleChange(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []);
    setFileNames(files.map((file) => file.name));
    if (!compress || files.length === 0) return;
    setOptimizing(true);
    try {
      const compressed = await Promise.all(files.map(compressImage));
      // 压缩期间用户可能又换了文件,只在还是同一批的时候替换。
      if (input.files?.[0] !== files[0]) return;
      const transfer = new DataTransfer();
      compressed.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
    } finally {
      setOptimizing(false);
    }
  }
  const inputRef = useRef<HTMLInputElement>(null);

  // React 19 的 form action 提交成功后会自动 reset 表单,文件被清空,文件名也跟着清。
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => setFileNames([]);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor={id}
        className="cursor-pointer rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-900"
      >
        {buttonLabel}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => handleChange(event.currentTarget)}
      />
      <span className="min-w-0 truncate text-xs text-zinc-500">
        {optimizing
          ? "Optimizing…"
          : fileNames.length === 0
          ? multiple
            ? "No files chosen"
            : "No file chosen"
          : fileNames.length === 1
            ? fileNames[0]
            : `${fileNames.length} files chosen`}
      </span>
    </div>
  );
}
