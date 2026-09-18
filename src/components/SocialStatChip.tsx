import type { SocialAccount } from "@/lib/supabase/types";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/supabase/enums";
import { formatFollowerCount } from "@/lib/format";
import { SocialPlatformIcon } from "@/components/SocialPlatformIcon";

// Compact icon + follower-count pairing for tight spaces (listing cards, the
// seller box on a listing's detail page). Falls back to the platform name
// when a seller hasn't filled in a follower count yet, so the account still
// shows up instead of disappearing entirely.
export function SocialStatChip({ account }: { account: SocialAccount }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
      <SocialPlatformIcon platform={account.platform} />
      {typeof account.follower_count === "number"
        ? formatFollowerCount(account.follower_count)
        : SOCIAL_PLATFORM_LABELS[account.platform] ?? account.platform}
    </span>
  );
}
