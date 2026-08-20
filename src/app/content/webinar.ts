/**
 * @file webinar.ts
 * @description Single source of truth for the free live webinar (P937).
 *
 * The landing hero CTA, the bottom CTA, the route-aware nav CTA, and the /offers page
 * all read from here. The date line is now DB-driven (P958) — the founder schedules events
 * in the events DB and the landing page reflects them automatically.
 *
 * NOTE — FOUNDER DECISION still pending:
 *   WEBINAR_REGISTER_URL — the real recurring-event registration link.
 * The placeholder URL routes to the in-app NextWebinarRedirect at /events/experiment
 * (P957), which looks up the next upcoming DB event. Swap for the real link when ready.
 */

export const WEBINAR_REGISTER_URL = '/events/experiment';

/** True when the registration URL is still the in-app placeholder (drives `Link` vs `<a>`). */
export const WEBINAR_URL_IS_PLACEHOLDER = WEBINAR_REGISTER_URL.startsWith('/');

/** Settled CTA label across all surfaces (renamed from "Join a free webinar" 2026-06-22 — see decisions.md). */
export const WEBINAR_CTA_LABEL = 'Join the next Clarity Experiment';

/**
 * First Clarity Champions batch start — Oct 1 2026, 00:00 ICT (UTC+7). Every subsequent
 * batch starts BATCH_CADENCE_DAYS later, forever — this is the one fixed point the
 * rolling schedule anchors to, never a value to hardcode again (P1087; the prior single
 * hardcoded COHORT_ENROLLMENT_CLOSES_ISO rendered a permanent "expired" state from
 * September once its one deadline passed).
 */
export const FIRST_BATCH_START_ISO = '2026-10-01T00:00:00+07:00';

/** Batches start together every 45 days (P1087 — decisions.md 2026-08-19 [product]). */
export const BATCH_CADENCE_DAYS = 45;

/**
 * Resolves to the next batch start on or after `now` — always in the future (or exactly
 * `now`), never expired. Before the anchor, the anchor itself is next. On or after it,
 * advances by whole cadence steps until the result is >= now.
 */
export function getNextBatchStartISO(now: Date = new Date()): string {
  const anchorMs = new Date(FIRST_BATCH_START_ISO).getTime();
  const nowMs = now.getTime();
  if (nowMs <= anchorMs) return FIRST_BATCH_START_ISO;

  const cadenceMs = BATCH_CADENCE_DAYS * 24 * 60 * 60 * 1000;
  const cyclesElapsed = Math.ceil((nowMs - anchorMs) / cadenceMs);
  return new Date(anchorMs + cyclesElapsed * cadenceMs).toISOString();
}
