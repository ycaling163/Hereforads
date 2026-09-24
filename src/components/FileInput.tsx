"use client";

import { useEffect, useRef, useState } from "react";

// 浏览器原生的 <input type="file"> 按钮文字跟着系统语言走(中文系统显示"选择文件 /
// 未选择任何文件"),站点是英文的,所以把原生控件藏起来,换成自己的英文按钮。
// 表单提交时仍然是这个 input 本身带文件,服务端 action 不用改。
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
        onChange={(event) =>
          setFileNames(Array.from(event.target.files ?? []).map((file) => file.name))
        }
      />
      <span className="min-w-0 truncate text-xs text-zinc-500">
        {fileNames.length === 0
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
