/**
 * @file webinar.ts
 * @description Single source of truth for the free live webinar (P937).
 *
 * One recurring webinar (Thursdays, 15:30 Chiang Mai / ICT). The landing hero CTA,
 * the bottom CTA, the route-aware nav CTA, and the /offers page all read from here,
 * so the founder updates the registration link and next-session date in ONE place.
 *
 * NOTE — two FOUNDER DECISIONS still pending (see features/p937…):
 *   1. WEBINAR_REGISTER_URL — the real recurring-event registration link.
 *   2. (CTA label is settled: "Join a free webinar".)
 * The placeholder URL routes to the in-app /events list so no dead link ships; swap
 * it for the real link when ready.
 */

/**
 * [FOUNDER DECISION: registration URL] — the recurring webinar's registration link.
 * Until set, points at the in-app events list (no dead link). Replace with the real
 * URL (Luma / Zoom / event page) when the founder provides it.
 */
export const WEBINAR_REGISTER_URL = '/events/webinar';

/** True when the registration URL is still the in-app placeholder (drives `Link` vs `<a>`). */
export const WEBINAR_URL_IS_PLACEHOLDER = WEBINAR_REGISTER_URL.startsWith('/');

/** Settled CTA label across all surfaces. */
export const WEBINAR_CTA_LABEL = 'Join a free webinar';

/**
 * Next session as a timezone-anchored ISO instant: Thu Jun 25 2026, 15:30 ICT (UTC+7).
 * Rendered in the visitor's own timezone via `formatLocalDateTime`. The founder updates
 * this to the next occurrence as the recurring series advances.
 */
export const WEBINAR_NEXT_ISO = '2026-06-25T15:30:00+07:00';

/**
 * [FOUNDER DECISION: cohort enrollment deadline] — when the (first) founding cohort's
 * registration closes. Set to late-night Jul 19 2026 Chiang Mai (ICT, UTC+7) per the
 * founder's recollection — CONFIRM the exact date/time. Drives the live countdown on
 * the Co-Founder Program card; once this instant passes the countdown degrades to a
 * static "enrollment closed" line. Cohort itself starts roughly one week later.
 */
export const COHORT_ENROLLMENT_CLOSES_ISO = '2026-07-19T23:59:00+07:00';
