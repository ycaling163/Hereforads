"use client";

import { useActionState } from "react";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS } from "@/lib/supabase/enums";
import type { SocialAccount } from "@/lib/supabase/types";
import { SocialAccountRow } from "./SocialAccountRow";
import { addSocialAccountAction, type SocialAccountFormState } from "./actions";

const initialState: SocialAccountFormState = {};

const inputClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900";
const labelClass = "text-sm font-medium text-zinc-700";

export function SocialAccountsManager({
  accounts,
}: {
  accounts: SocialAccount[];
}) {
  const [state, formAction, pending] = useActionState(
    addSocialAccountAction,
    initialState
  );

  return (
    <div className="flex flex-col gap-6">
      {accounts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => (
            <SocialAccountRow key={account.id} account={account} />
          ))}
        </ul>
      )}

      <form
        action={formAction}
        className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-200 p-4"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="platform" className={labelClass}>
            平台
          </label>
          <select
            id="platform"
            name="platform"
            required
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              请选择
            </option>
            {SOCIAL_PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {SOCIAL_PLATFORM_LABELS[platform]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="handle" className={labelClass}>
            账号名(选填)
          </label>
          <input id="handle" name="handle" type="text" className={inputClass} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor="url" className={labelClass}>
            主页链接(选填,小红书等没有链接的平台可以只填账号名)
          </label>
          <input id="url" name="url" type="url" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="follower_count" className={labelClass}>
            粉丝数(选填)
          </label>
          <input
            id="follower_count"
            name="follower_count"
            type="number"
            min="0"
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          {state.error && (
            <p className="mb-2 text-sm text-red-600">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            {pending ? "添加中..." : "+ 添加社交账号"}
          </button>
        </div>
      </form>
    </div>
  );
}
