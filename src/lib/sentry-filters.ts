// P882: Stack-frame-based Sentry event filtering.
// Some noise can't be matched by ignoreErrors (message-based): the PWA
// service-worker registration rejection has the message literally "Rejected" —
// the serviceWorker context only appears in stack frames. ignoreErrors stays
// for message-matchable noise; this beforeSend filter handles frame-matchable noise.
import { addBreadcrumb } from "@sentry/react";
import type { ErrorEvent, EventHint } from "@sentry/react";
import { NetworkBlipError } from "@/lib/network-blip";

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
 * (Supabase SDK, browser extensions, injected in-app-browser SDKs),
 * not from our app. If you see false positives, prefer a frame-based
 * beforeSend filter over loosening a pattern here.
 */
export const IGNORED_ERROR_PATTERNS: RegExp[] = [
  // IndexedDB errors from the Supabase SDK (Safari private mode, disk quota, iOS)
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
  // /events/* link is opened from a chat (JAVASCRIPT-REACT-2C, -2M, -2K, -2B,
  // -2V, -2T — the last two carry the SDK's shortened "invoking post:" wording
  // rather than "invoking postEvent", same injected source, zero app frames).
  // We ship no Telegram package and call no postEvent.
  /Error invoking post(Event)?:/i,
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

/**
 * P990: drop a network blip that a service call site re-threw.
 *
 * `logDbError` suppresses blips, but the call sites re-throw them wrapped in a
 * new Error, which reached Sentry through the global handler under a different
 * message (JAVASCRIPT-REACT-28 suppressed / -29 reported — same underlying event).
 *
 * Keys on the TYPE our code assigned, never on the message. That distinction is
 * the whole point (P883, decisions.md 2026-06-05): a broad /Load failed/ message
 * filter would also drop a genuine error that merely contains that text, and it
 * could not reach the 5 sites whose thrown message never interpolates
 * `error.message` at all.
 *
 * Reads `hint.originalException` — the LIVE thrown object, by reference. Do not
 * key on `event.exception`: that is the serialized view, and the class is gone
 * from it. Verified against @sentry/core 10.27.0, where beforeSend runs upstream
 * of envelope construction and global-handler / ErrorBoundary captures both pass
 * the original error through as `originalException`.
 */
export function dropNetworkBlipRethrow(
  event: ErrorEvent,
  hint?: EventHint
): ErrorEvent | null {
  return hint?.originalException instanceof NetworkBlipError ? null : event;
}

/**
 * Origins that only browser-extension code can occupy. Our bundle is always
 * served from https://claritypledge.com/assets/*, so a frame at one of these
 * is extension code by construction — no app build can produce one.
 *
 * `ext:` and `<name:bootstrap>` come from extensions that ship a Deno-style
 * runtime and label their injected frames with a custom scheme rather than
 * chrome-extension:// (JAVASCRIPT-REACT-2P: `ext:core/01_core.js`,
 * `<obscura:bootstrap>`).
 */
const EXTENSION_ORIGIN_PATTERNS = [
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-web-extension:\/\//i,
  /^ext:/i,
  /^<[a-z0-9_-]+:bootstrap>/i,
];

function isExtensionFrame(frame: { filename?: string; abs_path?: string }): boolean {
  const location = frame.filename ?? frame.abs_path ?? "";
  return EXTENSION_ORIGIN_PATTERNS.some((pattern) => pattern.test(location));
}

/**
 * P1011: drop errors THROWN BY browser-extension code (JAVASCRIPT-REACT-2P —
 * "Cannot read properties of undefined (reading 'prototype')", whose stack is
 * entirely `ext:core/01_core.js` / `<obscura:bootstrap>` frames).
 *
 * Not message-matchable: the message is a bare TypeError string that a real app
 * bug could produce verbatim, so `ignoreErrors` is the wrong mechanism — hence a
 * frame filter, per the file header's own guidance.
 *
 * Keys on the LAST frame of the LAST value. Two deliberate narrowings, each
 * chosen so the filter cannot hide an application bug:
 *
 * - Last FRAME, not any frame. `stripSentryFramesAndReverse` (@sentry/core
 *   utils/stacktrace) reverses the parsed stack so the throw site is last, so
 *   this asks "did extension code throw?" rather than "did extension code appear
 *   anywhere?". An extension that monkey-patches fetch or setTimeout sits
 *   mid-stack on genuine app errors; keying on any frame would drop those.
 *   Not "zero app frames" either — Sentry's own instrumentation wrappers live in
 *   our bundle and appear in the observed extension stack, so that never fires.
 *
 * - Last VALUE, not any value. `exception.values` holds one entry per link in an
 *   Error.cause chain, most recent last. Keying on any value would discard an
 *   app-level `new Error(msg, { cause: extensionErr })` — whose own stack is
 *   app frames and IS real signal — along with its cause.
 *
 * Known gap: `stripSentryFramesAndReverse` truncates to STACKTRACE_FRAME_LIMIT
 * AFTER reversing, keeping the oldest frames. On a stack deeper than that limit
 * the last frame is mid-stack, not the throw site, and this filter no-ops — it
 * fails toward reporting, which is the safe direction.
 *
 * Emits a breadcrumb on every drop (the `noteSuppression` convention from
 * app/data/db-error-logger.ts): a breadcrumb creates no issue but rides along
 * with the NEXT captured error, so an over-suppression mistake stays discoverable.
 */
export function dropBrowserExtensionNoise(
  event: ErrorEvent
): ErrorEvent | null {
  const values = event.exception?.values ?? [];
  if (values.length === 0) return event;

  const frames = values[values.length - 1].stacktrace?.frames ?? [];
  if (frames.length === 0) return event;

  const throwSite = frames[frames.length - 1];
  if (!isExtensionFrame(throwSite)) return event;

  addBreadcrumb({
    category: "sentry-event-suppressed",
    level: "info",
    data: {
      reason: "extension-frame",
      origin: throwSite.filename ?? throwSite.abs_path,
      type: values[values.length - 1].type,
    },
  });

  return null;
}

/**
 * The single `beforeSend` wired into Sentry.init — Sentry accepts exactly one,
 * so the filters are composed here rather than replacing one another.
 * Returns null as soon as any filter drops the event.
 */
export function sentryBeforeSend(
  event: ErrorEvent,
  hint?: EventHint
): ErrorEvent | null {
  const afterSwFilter = dropServiceWorkerRegistrationNoise(event);
  if (!afterSwFilter) return null;

  const afterExtensionFilter = dropBrowserExtensionNoise(afterSwFilter);
  if (!afterExtensionFilter) return null;

  return dropNetworkBlipRethrow(afterExtensionFilter, hint);
}
