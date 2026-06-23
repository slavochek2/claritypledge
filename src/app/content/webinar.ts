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
 * Public enrollment deadline for the founding cohort — Aug 31 2026, 23:59 ICT (UTC+7).
 * Drives the live countdown on the Co-Founder Program card; once this instant passes
 * the countdown degrades to a static "enrollment closed" line.
 * Decided 2026-06-19: public deadline is the forcing function (decisions.md).
 */
export const COHORT_ENROLLMENT_CLOSES_ISO = '2026-08-31T23:59:00+07:00';
