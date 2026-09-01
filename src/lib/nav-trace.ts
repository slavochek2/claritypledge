/**
 * P1197: Navigation trace.
 *
 * Records every URL change — `pushState`, `replaceState`, `popstate`, `hashchange` —
 * with a high-resolution timestamp and the stack that caused it, so a navigation the
 * user did not ask for names its own origin instead of being guessed at.
 *
 * Opt in with `?navtrace=1` on the URL that starts the session.
 *
 * ## Two deliberate deviations from the `?dev-recording=1` pattern (P809)
 *
 * 1. **This flag is NOT gated on `import.meta.env.PROD`.** Every other debug param in
 *    this codebase (`?debugUpload`, `?debugRounds`, `?skipMicCheck`, `?dev-recording`)
 *    no-ops in prod on purpose. P1197 does not reproduce locally — six constructed
 *    harness scenarios failed to trigger it — so a dev-only gate would make this
 *    instrument useless in the only environment where the bug exists. The safety
 *    argument is different in kind here: this instrument itself writes to the console
 *    and nowhere else — no network egress, no storage.
 *
 *    That is NOT the same as saying whatever reaches the console stays there. LogRocket
 *    and Sentry are both live on this page (`main.tsx:15-60`) and both capture console
 *    output, so a value printed here can leave the browser through tooling this page
 *    already loads. Every URL this module logs is therefore reduced to its path by
 *    `redactUrl()` before printing — every one, not only the clicked link. Several
 *    in-app routes carry live access tokens in their querystring, and P488 already
 *    strips those from the address bar to prevent exactly this leak.
 *
 *    A path segment that is itself an identifier (a session code) still appears, and is
 *    already visible to whoever is looking at that screen.
 *
 * 2. **The flag is latched at install, not re-read per call.** `isDevRecordingActive()`
 *    re-reads `window.location.search` on each invocation, which is correct for its use.
 *    It would be fatal here: the app drops `?navtrace=1` from the URL on its first
 *    navigation, and that first navigation is the event under investigation. Read once,
 *    at boot, before anything can navigate.
 */

const PREFIX = '[navtrace]';

/** Set once by `installNavTrace()`. Module-level so the patches close over it. */
let installed = false;

/**
 * True iff the document was loaded with `?navtrace=1`.
 *
 * Call this only at install time — see deviation (2) above. After the first
 * navigation the querystring no longer carries the flag.
 */
export function isNavTraceRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('navtrace') === '1';
  } catch {
    return false;
  }
}

/**
 * The last real user click, and when it happened.
 *
 * The stack alone cannot carry the answer in production: the build uses
 * `sourcemap: 'hidden'` (vite.config.ts:96) so maps exist for Sentry but are not
 * served to the browser, and minified frames read as `at ye (index-abc123.js:42:1337)`.
 * A frame name like `handleClick` is exactly what distinguishes "the user navigated"
 * from "something redirected the user" — and it is exactly what minification destroys.
 *
 * So the gesture is recorded directly instead of inferred from a name. Every trace
 * line carries how long ago the user last clicked and what they clicked, which is the
 * literal question P1197 asks: did the click register, or did a redirect fire on its own?
 */
let lastClick: { at: number; target: string } | null = null;

/**
 * A URL reduced to its path, with the presence of a query or hash noted but never
 * their contents.
 *
 * WHICH url was navigated to is the entire diagnostic value of this instrument. The
 * params are not, and several in-app navigations carry live access tokens in them:
 * `letter-reading-page.tsx:726` and `letters-section.tsx:171` navigate to
 * `/letter/<id>?token=<per-recipient token>`, and three agreement routes navigate to
 * `/agreements/<id>/accept?token=<invitation token>`. P488 already established that a
 * token sitting in a URL is a leak worth code to prevent — `accept-agreement-page.tsx:153`
 * strips it from the address bar for exactly that reason. Printing it to the console
 * would reintroduce what that fix removed.
 *
 * `?…` is kept as a marker so the trace still shows that params were present — losing
 * that would hide a real difference between two otherwise identical-looking navigations.
 */
export function redactUrl(url: string | null | undefined): string {
  if (!url) return '(none)';
  const [path] = url.split(/[?#]/);
  const marker =
    (url.includes('?') ? '?…' : '') + (url.includes('#') ? '#…' : '');
  // Never fall back to the raw url when the path is empty — that would print the very
  // querystring this function exists to drop.
  return path + marker || '(none)';
}

/** The clicked link's path, or a marker when the click was not on a link. */
function clickTarget(href: string | null | undefined): string {
  if (!href) return '(non-link)';
  return redactUrl(href);
}

function gestureSummary(): string {
  const activation =
    typeof navigator !== 'undefined' && 'userActivation' in navigator
      ? ((navigator as Navigator & { userActivation?: { isActive: boolean } })
          .userActivation?.isActive ?? null)
      : null;
  const parts: string[] = [];
  if (lastClick) {
    const delta = (performance.now() - lastClick.at).toFixed(0);
    parts.push(`sinceClick=${delta}ms`);
    parts.push(`clicked=${lastClick.target}`);
  } else {
    parts.push('sinceClick=never');
  }
  if (activation !== null) parts.push(`activation=${activation}`);
  return `[${parts.join(' ')}]`;
}

/**
 * The call site that triggered a navigation, as a newline-joined stack.
 *
 * Drops the frames belonging to this module so the first line the reader sees is
 * the application code that actually navigated, not `installNavTrace`'s own patch.
 */
function callerStack(): string {
  const raw = new Error().stack;
  if (!raw) return '  (no stack available)';
  return raw
    .split('\n')
    .slice(1)
    .filter((line) => !line.includes('nav-trace'))
    .slice(0, 12)
    .join('\n');
}

function log(kind: string, to: string, extra?: string): void {
  const at = performance.now().toFixed(1);
  // eslint-disable-next-line no-console -- P1200: intentionally prod-active, opt-in via ?navtrace=1 (see file header: NOT DEV-gated on purpose), test-asserted (p1197-nav-trace.test.ts)
  console.log(
    `${PREFIX} ${at}ms ${kind} → ${to} ${gestureSummary()}${extra ? ` ${extra}` : ''}\n${callerStack()}`,
  );
}

/**
 * Patch the history API and start tracing, if `?navtrace=1` is present.
 *
 * Returns true if the trace was installed. Safe to call more than once — the
 * second call is a no-op, so the patches can never stack and double-log.
 *
 * MUST be called before `ReactDOM.createRoot`. The navigation this exists to
 * catch fires within the first seconds of boot; a trace installed after the app
 * mounts arrives too late to see it. (Measured on prod: hand-injecting the same
 * patch from DevTools landed at t=5673ms, well after the redirect had happened.)
 */
export function installNavTrace(): boolean {
  if (installed) return true;
  if (!isNavTraceRequested()) return false;
  installed = true;

  const nativePushState = window.history.pushState.bind(window.history);
  const nativeReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function patchedPushState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    log('pushState', url == null ? '(same url)' : redactUrl(String(url)));
    return nativePushState(data, unused, url);
  };

  window.history.replaceState = function patchedReplaceState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    log('replaceState', url == null ? '(same url)' : redactUrl(String(url)));
    return nativeReplaceState(data, unused, url);
  };

  // Capture phase, so the gesture is recorded even if a handler stops propagation.
  window.addEventListener(
    'click',
    (event) => {
      const el = event.target as Element | null;
      const anchor = el?.closest?.('a[href]');
      lastClick = {
        at: performance.now(),
        target: clickTarget(anchor?.getAttribute('href')),
      };
    },
    true,
  );

  window.addEventListener('popstate', () => {
    log('popstate', redactUrl(window.location.pathname + window.location.search));
  });

  window.addEventListener('hashchange', (event) => {
    log('hashchange', redactUrl((event as HashChangeEvent).newURL));
  });

  // eslint-disable-next-line no-console -- P1200: intentionally prod-active, opt-in via ?navtrace=1 (see file header: NOT DEV-gated on purpose), test-asserted (p1197-nav-trace.test.ts)
  console.log(
    `${PREFIX} installed at ${performance.now().toFixed(1)}ms — initial URL ${window.location.pathname}${window.location.search}`,
  );
  return true;
}

/** Test-only: forget that install happened, so a fresh install can be exercised. */
export function __resetNavTraceForTests(): void {
  installed = false;
  lastClick = null;
}
