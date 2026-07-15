// P882: Stack-frame-based Sentry event filtering.
// Some noise can't be matched by ignoreErrors (message-based): the PWA
// service-worker registration rejection has the message literally "Rejected" —
// the serviceWorker context only appears in stack frames. ignoreErrors stays
// for message-matchable noise; this beforeSend filter handles frame-matchable noise.
import type { ErrorEvent } from "@sentry/react";

// Frame markers for the vite-plugin-pwa generated registration script and the
// automation-harness wrapper observed in prod events (JAVASCRIPT-REACT-19).
const SW_FRAME_PATTERNS = [/\/registerSW\.js/i, /serviceWorker\.register/i];

/**
 * Message patterns passed to Sentry.init's `ignoreErrors`. Lives here (rather
 * than inline in main.tsx) so `isIgnoredMessage` can assert the list's behaviour
 * in a unit test — main.tsx is an entry point with side effects and is not
 * importable from a test.
 *
 * These are intentionally broad: the errors originate from third-party code
 * (Supabase SDK, LogRocket, browser extensions, injected in-app-browser SDKs),
 * not from our app. If you see false positives, prefer a frame-based
 * beforeSend filter over loosening a pattern here.
 */
export const IGNORED_ERROR_PATTERNS: RegExp[] = [
  // IndexedDB errors from Supabase/LogRocket SDKs (Safari private mode, disk quota, iOS)
  // These are storage fallback errors in third-party SDKs, not bugs in our code
  /indexedDB\.open/i,
  /Internal error opening backing store/i,
  // Browser extensions (like JSON-LD parsers) that fail on pages without structured data
  // Stack traces show extension:// origins, not our code
  /@context.*toLowerCase/i,
  // Service worker registration failures in unsupported browsers or private browsing
  // PWA is progressive enhancement; these failures are expected and harmless
  /Rejected.*serviceWorker/i,
  /serviceWorker.*register/i,
  // Browser extension noise (Office/Outlook safe-links, password managers):
  // injected scripts fail with "Object Not Found Matching Id:N, MethodName:update".
  // Originates from extension://, not our code.
  /Object Not Found Matching Id/i,

  // P988 — code injected into the page by the HOST browser, not shipped by us.
  // Every observed event has zero application frames: the only entries are
  // Sentry's own instrumentation wrappers plus an <anonymous> frame, with
  // mechanism auto.browser.browserapierrors.setTimeout.
  //
  // Telegram Mini Apps SDK: injected by Telegram's in-app browser when an
  // /events/* link is opened from a chat (JAVASCRIPT-REACT-2C, -2M, -2K, -2B).
  // We ship no Telegram package and call no postEvent.
  /Error invoking postEvent/i,
  // A browser extension calling the WebExtension messaging API, which page
  // scripts cannot reach (JAVASCRIPT-REACT-2N).
  /Invalid call to runtime\.sendMessage/i,
  // The bare throw from the same injected Telegram SDK. ANCHORED deliberately:
  // "Method not found" is a generic JSON-RPC-style string, so an unanchored
  // pattern would swallow a real error that merely ends with it (e.g. a future
  // dependency's "DB error in getFoo: Method not found"). Verified absent from
  // our source: grep -rn "Method not found" src/ supabase/ → no hits.
  /^Method not found$/,
];

/**
 * True when `message` matches any `ignoreErrors` pattern — i.e. Sentry would
 * drop an event carrying it. Mirrors Sentry's own substring/regex semantics
 * closely enough to gate the pattern list in tests.
 */
export function isIgnoredMessage(message: string): boolean {
  return IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Drop unhandled-rejection noise from PWA service-worker registration.
 * SW registration failure is a harmless progressive-enhancement no-op
 * (bots, automation harnesses, some private-browsing modes); recording it
 * keeps a Sentry issue perpetually unresolved with 0 users impacted.
 *
 * Returns null (drop) when any exception stack frame references
 * /registerSW.js or serviceWorker.register; otherwise returns the event.
 */
export function dropServiceWorkerRegistrationNoise(
  event: ErrorEvent
): ErrorEvent | null {
  const frames =
    event.exception?.values?.flatMap(
      (value) => value.stacktrace?.frames ?? []
    ) ?? [];

  const isSwRegistrationFrame = frames.some((frame) =>
    SW_FRAME_PATTERNS.some(
      (pattern) =>
        pattern.test(frame.filename ?? "") ||
        pattern.test(frame.abs_path ?? "") ||
        pattern.test(frame.function ?? "")
    )
  );

  return isSwRegistrationFrame ? null : event;
}
