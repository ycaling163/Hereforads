import { HiOutlineGlobeAlt } from "react-icons/hi2";
import type { SocialAccount } from "@/lib/supabase/types";
import { formatFollowerCount, toFollowerCount } from "@/lib/format";
import { SocialPlatformIcon } from "@/components/SocialPlatformIcon";

// Compact icon + follower-count pairing for tight spaces (listing cards, the
// seller box on a listing's detail page). The icon alone already identifies
// the platform, so no follower count just means a bare icon — not a
// redundant "Instagram"/"YouTube" label next to it.
export function SocialStatChip({ account }: { account: SocialAccount }) {
  const followers = toFollowerCount(account.follower_count);
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
      <SocialPlatformIcon platform={account.platform} />
      {followers !== null && formatFollowerCount(followers)}
    </span>
  );
}

// Same visual language for a listing placed on the seller's own website
// rather than a specific social account — there's no platform icon or
// follower count for that, just a plain "Website" label.
export function WebsiteStatChip() {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
      <HiOutlineGlobeAlt className="h-4 w-4 shrink-0 text-zinc-500" />
      Website
    </span>
  );
}
