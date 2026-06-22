import type { EventWithHost } from '@/app/types';

export const WEBINAR_SERIES = {
  TITLE_PREFIX: "Clarity Experiment #",
  TITLE: "Clarity Experiment #1: I've Lost Co-Founders. Here's How to Keep Yours.",
  HOST_ID: 'a99042ef-e740-446a-8734-389c8589cc17',
  SERIES_PARAM: 'lost-cofounders',
} as const;

/**
 * Legacy title prefix — events seeded before the 2026-06-22 "webinar → Clarity Experiment"
 * rename (decisions.md). Matching accepts BOTH prefixes during the transition so already-seeded
 * "Live webinar #" rows still surface until they are renamed to "Clarity Experiment #" in prod.
 * REMOVE once no "Live webinar #" rows remain (run scripts/number-webinar-titles.ts to migrate).
 */
export const LEGACY_TITLE_PREFIX = "Live webinar #";

export function filterWebinarSeries(events: EventWithHost[]): EventWithHost[] {
  return events.filter(
    e =>
      (e.title.startsWith(WEBINAR_SERIES.TITLE_PREFIX) ||
        e.title.startsWith(LEGACY_TITLE_PREFIX)) &&
      e.hostId === WEBINAR_SERIES.HOST_ID
  );
}
