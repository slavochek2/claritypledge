/**
 * @file event-flow-row.ts
 * @description P1529: the two columns that decide an event's flow, as read from `events` and as the app holds them.
 * P1675 R6: also the two hike-question switches (absent means asked), so events-service-real.ts (over the size limit) does not grow.
 */
import { isAsked } from './hike-answer-model';

export interface EventFlowRow {
  series_slug?: string | null;
  flow?: string | null;
  hike_asks_transport?: boolean | null; // P1675 R6
  hike_asks_help?: boolean | null;
}

export function eventFlowFields(row: EventFlowRow): {
  seriesSlug?: string;
  flow: string | null;
  hikeAsksTransport: boolean;
  hikeAsksHelp: boolean;
} {
  return {
    seriesSlug: row.series_slug ?? undefined,
    flow: row.flow ?? null,
    hikeAsksTransport: isAsked(row.hike_asks_transport), // P1675 R6: absent means asked
    hikeAsksHelp: isAsked(row.hike_asks_help),
  };
}
