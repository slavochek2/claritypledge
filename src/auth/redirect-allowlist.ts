/**
 * Post-auth redirect allowlist (P1223 — hardened for the backslash open-redirect form).
 *
 * The callback page navigates to a caller-supplied path after sign-in. `navigate()` in
 * react-router treats `\` as `/` when resolving (GHSA-wrjc-x8rr-h8h6), so `/\evil.com` and
 * `\\evil.com` resolve to protocol-relative URLs exactly like `//evil.com`
 * (GHSA-2j2x-hqr9-3h42). A path is accepted only when it is a single-slash-rooted path with no
 * backslash anywhere AND it matches one of the allowlisted prefixes.
 */

export const ALLOWED_REDIRECT_PREFIXES = ['/events', '/settings', '/me', '/p/', '/about', '/pledgers', '/manifesto', '/live', '/agreements', '/create', '/point/', '/chat', '/letter', '/org', '/groups'];

export function isSafeRedirectPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith('/')) return false;
  // Second char `/` or `\` → protocol-relative once the router normalises backslashes.
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  // Any backslash anywhere: the router rewrites `\` → `/`, so the prefix check below would
  // be run on a different string than the one the browser navigates to.
  if (path.includes('\\')) return false;
  return ALLOWED_REDIRECT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?'),
  );
}
