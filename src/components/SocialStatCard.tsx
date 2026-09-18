import type { SocialAccount } from "@/lib/supabase/types";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/supabase/enums";
import { formatFollowerCount } from "@/lib/format";
import { SocialPlatformIcon } from "@/components/SocialPlatformIcon";

// Bigger stat tile for the seller profile page — icon, headline follower
// count, and platform + handle underneath. The whole tile links out to the
// account when a profile URL is on file.
export function SocialStatCard({ account }: { account: SocialAccount }) {
  const followers =
    typeof account.follower_count === "number"
      ? formatFollowerCount(account.follower_count)
      : null;

  const content = (
    <div className="flex h-full flex-col items-center gap-1 rounded-2xl border border-zinc-200 px-5 py-4 text-center transition-colors group-hover:border-zinc-300">
      <SocialPlatformIcon platform={account.platform} className="h-6 w-6" />
      <span className="mt-1.5 text-xl font-semibold text-zinc-900">
        {followers ?? "—"}
      </span>
      <span className="text-xs text-zinc-500">
        {followers ? "Followers" : "No follower count yet"}
      </span>
      <span className="mt-1 truncate text-xs font-medium text-zinc-400">
        {SOCIAL_PLATFORM_LABELS[account.platform] ?? account.platform}
        {account.handle ? ` · ${account.handle}` : ""}
      </span>
    </div>
  );

  if (account.url) {
    return (
      <a href={account.url} target="_blank" rel="noopener noreferrer" className="group">
        {content}
      </a>
    );
  }

  return <div className="group">{content}</div>;
}
