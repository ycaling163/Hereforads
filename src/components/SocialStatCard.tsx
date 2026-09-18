import type { SocialAccount } from "@/lib/supabase/types";
import { formatFollowerCount, formatHandle } from "@/lib/format";
import { SocialPlatformIcon } from "@/components/SocialPlatformIcon";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/supabase/enums";

// Row-style stat for the seller profile page's "Social reach" list — icon,
// handle, and follower count (when known) on the right. The icon already
// identifies the platform, so we don't also spell out "YouTube"/"Xiaohongshu"
// as a text label — only falling back to the platform name when an account
// has no handle on file. No count on file just means the row has no number,
// not a dead "—" placeholder. The whole row links out to the account when a
// profile URL is on file.
export function SocialStatCard({ account }: { account: SocialAccount }) {
  const followers =
    typeof account.follower_count === "number"
      ? formatFollowerCount(account.follower_count)
      : null;

  const content = (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 transition-colors group-hover:border-zinc-300">
      <SocialPlatformIcon platform={account.platform} className="h-6 w-6" />
      <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">
        {account.handle
          ? formatHandle(account.handle)
          : SOCIAL_PLATFORM_LABELS[account.platform] ?? account.platform}
      </span>
      {followers && (
        <span className="shrink-0 text-sm font-semibold text-zinc-900">
          {followers} followers
        </span>
      )}
    </div>
  );

  if (account.url) {
    return (
      <a
        href={account.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        {content}
      </a>
    );
  }

  return <div className="group">{content}</div>;
}
