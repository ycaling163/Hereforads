import { SOCIAL_PLATFORM_LABELS } from "@/lib/supabase/enums";
import type { SocialAccount } from "@/lib/supabase/types";

// 有链接的平台(YouTube/Instagram/X 等)直接给一个跳转按钮,不把长链接铺满整行;
// 没有链接的平台(比如小红书,分享链接不常用)就还是显示账号名文字。
export function SocialAccountBadge({ account }: { account: SocialAccount }) {
  return (
    <>
      <span className="font-medium text-zinc-900">
        {SOCIAL_PLATFORM_LABELS[account.platform] ?? account.platform}
      </span>
      {account.handle && (
        <span className="text-zinc-500">{account.handle}</span>
      )}
      {account.url && (
        <a
          href={account.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-900 hover:text-zinc-900"
        >
          访问主页
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-3 w-3"
            aria-hidden="true"
          >
            <path
              d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10M9 2h5v5M13.5 2.5 7 9"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      )}
      {typeof account.follower_count === "number" && (
        <span className="text-zinc-400">
          {account.follower_count.toLocaleString()} 粉丝
        </span>
      )}
    </>
  );
}
