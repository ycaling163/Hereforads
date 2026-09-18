// Prefixes a social handle with "@" for display, e.g. "7smilelinda" ->
// "@7smilelinda". Leaves it alone if the seller already typed the "@"
// themselves, so we never end up with "@@handle".
export function formatHandle(handle: string): string {
  return handle.startsWith("@") ? handle : `@${handle}`;
}

// Coerces whatever comes back from the database into a follower count we can
// render. Supabase returns a numeric column as a JS number, but this project
// has a documented history of the live `social_accounts.follower_count`
// column drifting from its intended `integer` type to `text` (see README) —
// when that happens the value arrives as the *string* "22000", and a strict
// `typeof x === "number"` check would silently treat a real count as
// missing. Accepting both keeps the display correct either way.
export function toFollowerCount(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

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
