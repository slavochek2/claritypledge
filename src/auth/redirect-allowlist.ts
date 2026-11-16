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
 *
 * P1692: a target is accepted only when it is already in resolved form under an allowed root.
 * Resolved form means the router and the browser's address parser would both leave its path
 * exactly as written: no `.` or `..` segment (a percent-encoded dot counts as a dot), no empty
 * segment, no control character, nothing the parser reshapes. Only the path is read (up to the
 * first `?` or `#`), and nothing is decoded: an address neither of them changes is accepted.
 * `/topics` and `/compare` joined the roots (topics-page, topic-parts and compare-page send
 * people back to them).
 *
 * Two checks share one rule and differ only in their roots:
 *   - isSafeRedirectPath: every reader, including the sign-in landing page;
 *   - isSafeReturnPath: the already-signed-in bounce on the sign-in and sign-up pages. It also
 *     accepts RETURN_ONLY_PREFIXES, the pages whose sign-in prompt sends their own address
 *     (anon-position-cta on the feed and stake pages). The landing page does not honour those,
 *     so where a new member lands after sign-in is unchanged.
 */

export const ALLOWED_REDIRECT_PREFIXES = ['/events', '/settings', '/me', '/p', '/about', '/pledgers', '/manifesto', '/live', '/agreements', '/create', '/point', '/chat', '/letter', '/letters', '/artifacts', '/org', '/groups', '/sessions', '/docs', '/transcribe', '/story', '/connect', '/topics', '/compare'];

/** Accepted only by isSafeReturnPath (see the header). */
export const RETURN_ONLY_PREFIXES = ['/feed', '/stake'];

/** Entry pages: never a redirect target, for either check. */
export const ENTRY_PAGE_ROOTS = ['/auth', '/login', '/signup', '/sign-pledge'];

const ROOT_RE = /^\/[a-z-]+$/;
for (const root of [...ALLOWED_REDIRECT_PREFIXES, ...RETURN_ONLY_PREFIXES]) {
  // A root with a trailing slash silently matches nothing but itself — refuse to load one.
  if (!ROOT_RE.test(root)) throw new Error(`ALLOWED_REDIRECT_PREFIXES: malformed root ${JSON.stringify(root)}`);
  if (ENTRY_PAGE_ROOTS.includes(root)) throw new Error(`ALLOWED_REDIRECT_PREFIXES: an entry page can never be a root: ${JSON.stringify(root)}`);
}

/** A `.` or `..` segment as the browser's address parser reads it: a percent-encoded dot counts as a dot. */
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;
// eslint-disable-next-line no-control-regex -- control characters are exactly what this refuses
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const PARSER_BASE = 'https://same.invalid';

/** True when neither the router nor the browser would rewrite the path of this target. */
function isTypedAsItLands(path: string): boolean {
  // The browser drops tabs and newlines from an address before reading it.
  if (CONTROL_CHARACTER.test(path)) return false;
  const segments = (path.split(/[?#]/, 1)[0] ?? '').split('/');
  for (const [i, segment] of segments.entries()) {
    if (i === 0) continue; // the empty string before the leading slash
    if (DOT_SEGMENT.test(segment)) return false;
    // An empty segment that is not the trailing slash: the router collapses `//`, the browser keeps it.
    if (segment === '' && i < segments.length - 1) return false;
  }
  // Anything else the browser's own parser reshapes (for example a trailing space that turns into `..`).
  try {
    const parsed = new URL(path, PARSER_BASE);
    return parsed.origin === PARSER_BASE && parsed.pathname.split('/').length === segments.length;
  } catch {
    return false;
  }
}

function isSafePathUnder(path: string | null | undefined, roots: readonly string[]): path is string {
  if (!path) return false;
  if (!path.startsWith('/')) return false;
  // Second char `/` or `\` → protocol-relative once the router normalises backslashes.
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  // Any backslash anywhere: the router rewrites `\` → `/`, so the prefix check below would
  // be run on a different string than the one the browser navigates to.
  if (path.includes('\\')) return false;
  if (!isTypedAsItLands(path)) return false;
  return roots.some((root) => {
    if (path === root) return true;
    if (!path.startsWith(root)) return false;
    // segment boundary: the char right after the root must end the first segment
    const next = path.charAt(root.length);
    return next === '/' || next === '?' || next === '#';
  });
}

export function isSafeRedirectPath(path: string | null | undefined): path is string {
  return isSafePathUnder(path, ALLOWED_REDIRECT_PREFIXES);
}

/** A target read off the page address, checked where it is read: the target itself, or null when it is refused. */
export function safeRedirectOrNull(path: string | null | undefined): string | null {
  return isSafeRedirectPath(path) ? path : null;
}

const RETURN_PREFIXES = [...ALLOWED_REDIRECT_PREFIXES, ...RETURN_ONLY_PREFIXES];

/** For the already-signed-in bounce on the sign-in and sign-up pages only (see the header). */
export function isSafeReturnPath(path: string | null | undefined): path is string {
  return isSafePathUnder(path, RETURN_PREFIXES);
}
