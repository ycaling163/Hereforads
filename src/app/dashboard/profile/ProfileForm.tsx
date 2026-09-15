"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileFormState } from "./actions";

const initialState: ProfileFormState = {};

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function ProfileForm({
  initialDisplayName,
  initialBio,
  initialAvatarUrl,
}: {
  initialDisplayName: string;
  initialBio: string;
  initialAvatarUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-zinc-400">
          {initialAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={initialAvatarUrl}
              alt="头像"
              className="h-full w-full object-cover"
            />
          ) : (
            "无"
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="avatar" className={labelClass}>
            更换头像(选填)
          </label>
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/*"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="display_name" className={labelClass}>
          昵称
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          defaultValue={initialDisplayName}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className={labelClass}>
          卖家简介
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={initialBio}
          placeholder="介绍一下你自己和你的空间,提升买家信任度"
          className={inputClass}
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">已保存。</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 self-start rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "保存中..." : "保存资料"}
      </button>
    </form>
  );
}
