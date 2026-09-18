import type { SocialAccount } from "@/lib/supabase/types";
import { formatFollowerCount } from "@/lib/format";
import { SocialPlatformIcon } from "@/components/SocialPlatformIcon";

// Compact icon + follower-count pairing for tight spaces (listing cards, the
// seller box on a listing's detail page). The icon alone already identifies
// the platform, so no follower count just means a bare icon — not a
// redundant "Instagram"/"YouTube" label next to it.
export function SocialStatChip({ account }: { account: SocialAccount }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
      <SocialPlatformIcon platform={account.platform} />
      {typeof account.follower_count === "number" &&
        formatFollowerCount(account.follower_count)}
    </span>
  );
}
