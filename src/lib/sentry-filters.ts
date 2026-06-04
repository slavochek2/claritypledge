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
