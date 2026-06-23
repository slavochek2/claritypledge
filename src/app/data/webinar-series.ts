import type { EventWithHost } from '@/app/types';

export const WEBINAR_SERIES = {
  TITLE_PREFIX: "Clarity Experiment #",
  TITLE: "Clarity Experiment #1: I've Lost Co-Founders. Here's How to Keep Yours.",
  HOST_ID: 'a99042ef-e740-446a-8734-389c8589cc17',
  SERIES_PARAM: 'lost-cofounders',
} as const;

export function filterWebinarSeries(events: EventWithHost[]): EventWithHost[] {
  return events.filter(
    e =>
      e.title.startsWith(WEBINAR_SERIES.TITLE_PREFIX) &&
      e.hostId === WEBINAR_SERIES.HOST_ID
  );
}

/** Returns the next strictly-future Clarity Experiment event, or null if none exists.
 *  Uses `datetime > now` (not the 5h grace window) so a started/over event is never
 *  shown as "upcoming" and the landing date always matches the CTA redirect target. */
export function getNextUpcomingWebinar(events: EventWithHost[]): EventWithHost | null {
  const now = new Date();
  return filterWebinarSeries(events).find(e => new Date(e.datetime) > now) ?? null;
}
