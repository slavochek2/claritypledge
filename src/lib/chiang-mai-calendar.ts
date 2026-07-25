/**
 * Single source of the Chiang Mai community Google Calendar embed (P906/P909).
 *
 * Extracted from chiang-mai-page.tsx (P1010) so both the standalone /cm page and
 * the /org/cm Events tab reference the SAME calendar ID + embed URL builder — no
 * duplication of the calendar identity. Kept as a plain module (not a component
 * file) so importing these constants never degrades component HMR.
 */

export const CALENDAR_ID =
  "9b457378eacead57b6d504bb9bba5f57b9d0194eb8d8dc153663c8a274e0c2fd@group.calendar.google.com";

export function buildEmbedUrl(mode: "WEEK" | "AGENDA"): string {
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(
    CALENDAR_ID,
  )}&ctz=Asia%2FBangkok&mode=${mode}&showTitle=0&showPrint=0&showCalendars=0&showTz=0`;
}

export const SUBSCRIBE_URL = `https://calendar.google.com/calendar/u/0?cid=${btoa(CALENDAR_ID)}`;
