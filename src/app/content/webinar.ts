/**
 * @file webinar.ts
 * @description Single source of truth for the free live webinar (P937).
 *
 * One recurring webinar (biweekly Thursdays, 15:30 Chiang Mai / ICT). The landing hero CTA,
 * the bottom CTA, the route-aware nav CTA, and the /offers page all read from here,
 * so the founder updates the registration link and next-session date in ONE place.
 *
 * NOTE — two FOUNDER DECISIONS still pending (see features/p937…):
 *   1. WEBINAR_REGISTER_URL — the real recurring-event registration link.
 *   2. (CTA label is settled: "Join the next Clarity Experiment".)
 * The placeholder URL routes to the in-app /events list so no dead link ships; swap
 * it for the real link when ready.
 */

/**
 * Registration URL — routes to the in-app NextWebinarRedirect (/events/webinar),
 * which looks up the next upcoming DB webinar and forwards there. This is the
 * settled mechanism (no external Luma/Zoom link needed).
 */
export const WEBINAR_REGISTER_URL = '/events/webinar';

/** True when the registration URL is still the in-app placeholder (drives `Link` vs `<a>`). */
export const WEBINAR_URL_IS_PLACEHOLDER = WEBINAR_REGISTER_URL.startsWith('/');

/** Settled CTA label across all surfaces (renamed from "Join a free webinar" 2026-06-22 — see decisions.md). */
export const WEBINAR_CTA_LABEL = 'Join the next Clarity Experiment';

/**
 * Next session as a timezone-anchored ISO instant: Thu Jun 25 2026, 15:30 ICT (UTC+7).
 * Rendered in the visitor's own timezone via `formatLocalDateTime`. The founder updates
 * this to the next occurrence as the recurring series advances.
 */
export const WEBINAR_NEXT_ISO = '2026-07-02T15:30:00+07:00';

/**
 * Public enrollment deadline for the founding cohort — Aug 31 2026, 23:59 ICT (UTC+7).
 * Drives the live countdown on the Co-Founder Program card; once this instant passes
 * the countdown degrades to a static "enrollment closed" line.
 * Decided 2026-06-19: public deadline is the forcing function (decisions.md).
 */
export const COHORT_ENROLLMENT_CLOSES_ISO = '2026-08-31T23:59:00+07:00';
