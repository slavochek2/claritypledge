/**
 * Post-auth redirect allowlist (P1223 — hardened for the backslash open-redirect form, and
 * reconciled against every `?redirect=` producer in src/).
 *
 * The callback page navigates to a caller-supplied path after sign-in. `navigate()` in
 * react-router treats `\` as `/` when resolving (GHSA-wrjc-x8rr-h8h6), so `/\evil.com` and
 * `\\evil.com` resolve to protocol-relative URLs exactly like `//evil.com`
 * (GHSA-2j2x-hqr9-3h42). A path is accepted only when it is a single-slash-rooted path with no
 * backslash anywhere AND its first segment is one of the allowlisted roots.
 *
 * Roots are written WITHOUT a trailing slash and matched on a segment boundary: `/p` admits
 * `/p` and `/p/alice` but not `/pledgers` (that has its own entry). The previous list carried
 * `/p/` and `/point/` with the slash, which could only ever match themselves literally and
 * sent every `/point/<id>` redirect to the fallback — the Codex review of P1223 caught it.
 *
 * Reconciled against producers (`grep -rn "redirect=" src`): /events (rsvp, room gate),
 * /docs, /me (calibration), /letters, /sessions, /live (join-via-link, returnTo), /letter
 * (confirm, results, overview, reading), /agreements (accept?token=), /org + /groups (join),
 * /create (story create returnUrl), /transcribe (room join), plus the intent redirects from
 * auth-gate-utils (/point, /p, /chat). Entry/auth pages (/login, /signup, /auth,
 * /sign-pledge) are deliberately NOT roots — redirecting back into them loops.
 *
 * '/org' is kept although App.tsx redirects it to /groups: this check runs on the redirect
 * target BEFORE the router's OrgLegacyRedirect renders (P1193).
 */

export const ALLOWED_REDIRECT_PREFIXES = ['/events', '/settings', '/me', '/p', '/about', '/pledgers', '/manifesto', '/live', '/agreements', '/create', '/point', '/chat', '/letter', '/letters', '/org', '/groups', '/sessions', '/docs', '/transcribe', '/story'];

const ROOT_RE = /^\/[a-z-]+$/;
for (const root of ALLOWED_REDIRECT_PREFIXES) {
  // A root with a trailing slash silently matches nothing but itself — refuse to load one.
  if (!ROOT_RE.test(root)) throw new Error(`ALLOWED_REDIRECT_PREFIXES: malformed root ${JSON.stringify(root)}`);
}

export function isSafeRedirectPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith('/')) return false;
  // Second char `/` or `\` → protocol-relative once the router normalises backslashes.
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  // Any backslash anywhere: the router rewrites `\` → `/`, so the prefix check below would
  // be run on a different string than the one the browser navigates to.
  if (path.includes('\\')) return false;
  return ALLOWED_REDIRECT_PREFIXES.some((root) => {
    if (path === root) return true;
    if (!path.startsWith(root)) return false;
    // segment boundary: the char right after the root must end the first segment
    const next = path.charAt(root.length);
    return next === '/' || next === '?' || next === '#';
  });
}
