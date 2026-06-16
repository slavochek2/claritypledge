import type { EventWithHost } from '@/app/types';

export const WEBINAR_SERIES = {
  TITLE_PREFIX: "I've Lost Co-Founders",
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
