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

// Parses what a seller types into the follower count field — plain numbers
// ("25000"), comma-grouped ("25,000") and K/M shorthand ("25k", "1.2m") all
// resolve to an integer. Returns null for anything else (including empty
// input), so callers can tell "not provided" apart from "invalid".
export function parseFollowerCount(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase().replace(/,/g, "");
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  const result = Math.round(value * multiplier);

  return result >= 0 ? result : null;
}
