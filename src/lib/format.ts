// Abbreviates follower counts, e.g. 1234 -> "1.2K", 1250000 -> "1.3M".
export function formatFollowerCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `${count}`;
}
