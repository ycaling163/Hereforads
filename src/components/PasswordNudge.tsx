"use client";

import { useState } from "react";
import Link from "next/link";

export const PASSWORD_NUDGE_COOKIE = "hfa_pw_nudge_dismissed";

// 免密码登录进来、还没设密码的用户,Dashboard 顶部的提醒(见 README"Guest 登录与设置
// 密码")。"Not now" 7 天内不再提醒。
export function PasswordNudge() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>
        You signed in with an email link. Set a password so you can log in faster next time.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/password"
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
        >
          Set a password
        </Link>
        <button
          type="button"
          onClick={() => {
            document.cookie = `${PASSWORD_NUDGE_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
            setHidden(true);
          }}
          className="text-xs text-amber-800 underline"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
