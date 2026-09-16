"use client";

import { useActionState, useState } from "react";
import { ConfirmSubmitForm } from "@/components/ConfirmSubmitForm";
import { SocialAccountBadge } from "@/components/SocialAccountBadge";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS } from "@/lib/supabase/enums";
import type { SocialAccount } from "@/lib/supabase/types";
import {
  deleteSocialAccountAction,
  updateSocialAccountAction,
  type SocialAccountFormState,
} from "./actions";

const initialState: SocialAccountFormState = {};

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function SocialAccountRow({ account }: { account: SocialAccount }) {
  const [isEditing, setIsEditing] = useState(false);
  const updateAction = updateSocialAccountAction.bind(null, account.id);
  const [state, formAction, pending] = useActionState(
    updateAction,
    initialState
  );

  if (!isEditing) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <SocialAccountBadge account={account} />
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-900"
          >
            编辑
          </button>
          <ConfirmSubmitForm
            action={deleteSocialAccountAction.bind(null, account.id)}
            confirmMessage="确定要删除这个社交账号吗?"
            label="删除"
            className="text-xs text-zinc-400 transition-colors hover:text-red-600"
          />
        </span>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-300 p-4">
      <form action={formAction} className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`platform-${account.id}`} className={labelClass}>
            平台
          </label>
          <select
            id={`platform-${account.id}`}
            name="platform"
            required
            defaultValue={account.platform}
            className={inputClass}
          >
            {SOCIAL_PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {SOCIAL_PLATFORM_LABELS[platform]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`handle-${account.id}`} className={labelClass}>
            账号名(选填)
          </label>
          <input
            id={`handle-${account.id}`}
            name="handle"
            type="text"
            defaultValue={account.handle ?? ""}
            className={inputClass}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor={`url-${account.id}`} className={labelClass}>
            主页链接(选填,小红书等没有链接的平台可以只填账号名)
          </label>
          <input
            id={`url-${account.id}`}
            name="url"
            type="url"
            defaultValue={account.url ?? ""}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`follower_count-${account.id}`} className={labelClass}>
            粉丝数(选填)
          </label>
          <input
            id={`follower_count-${account.id}`}
            name="follower_count"
            type="number"
            min="0"
            defaultValue={account.follower_count ?? ""}
            className={inputClass}
          />
        </div>
        <div className="col-span-2 flex items-center gap-3">
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            {pending ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            取消
          </button>
        </div>
      </form>
    </li>
  );
}
