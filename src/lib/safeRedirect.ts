// Whitelists a "where to send the user after auth" path coming from a query
// param / hidden form field. Only a same-site relative path is allowed
// ("/dashboard/new-listing") — anything else (a bare "//evil.com" or an
// absolute "https://..." URL, both of which browsers/redirect() will happily
// follow off-site) falls back to the default instead of becoming an open
// redirect.
export function safeRedirectPath(path: string | null | undefined, fallback: string): string {
  if (!path) return fallback;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
