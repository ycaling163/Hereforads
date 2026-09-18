// Slugs that must never be assignable as a profile username — anything that
// is (or plausibly could become) a top-level static route in src/app. A
// static route always wins over the `[username]` catch-all at the same
// level, so a user who claimed one of these would end up with a "public
// link" that silently renders the wrong page instead of their profile.
export const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "banned",
  "contact",
  "dashboard",
  "listings",
  "login",
  "logout",
  "privacy",
  "publishers",
  "register",
  "sellers",
  "signup",
  "signin",
  "terms",
  // Reserved pre-emptively for likely future top-level pages, even though
  // nothing lives at these paths today.
  "about",
  "blog",
  "help",
  "pricing",
  "support",
  "faq",
  "home",
  "index",
  "app",
  "www",
  "mail",
  "ftp",
  "static",
  "assets",
  "images",
  "null",
  "undefined",
]);

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

// Validates and lowercases a username typed into the profile form. Returns
// `{ value: null }` for a blank input (the field is optional — clearing it
// is allowed), `{ error }` for anything that fails format/reserved-word
// checks, or `{ value }` with the normalized (lowercased) username.
// Uniqueness itself isn't checked here — that's a DB-level unique
// constraint the caller handles by catching a 23505 error, since checking
// first and inserting after would still race under concurrent submissions.
export function normalizeUsername(raw: string): { value: string | null } | { error: string } {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { value: null };

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      error:
        "Username must be 3-30 characters: lowercase letters, numbers, and hyphens only, no leading/trailing hyphen.",
    };
  }
  if (RESERVED_USERNAMES.has(trimmed)) {
    return { error: "This username is reserved — please choose another." };
  }

  return { value: trimmed };
}
