import type { SocialAccount } from "@/lib/supabase/types";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/supabase/enums";

export function SocialLinks({ accounts }: { accounts: SocialAccount[] }) {
  if (accounts.length === 0) {
    return <p className="text-sm text-zinc-500">暂无社交账号</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {accounts.map((account) => (
        <li key={account.id}>
          <a
            href={account.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-2.5 text-sm transition-colors hover:border-zinc-400 hover:bg-zinc-50"
          >
            <span className="font-medium text-zinc-900">
              {SOCIAL_PLATFORM_LABELS[account.platform] ?? account.platform}
            </span>
            <span className="text-zinc-500">
              {account.handle ?? account.url}
              {typeof account.follower_count === "number" && (
                <span className="ml-2 text-zinc-400">
                  {account.follower_count.toLocaleString()} 粉丝
                </span>
              )}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
