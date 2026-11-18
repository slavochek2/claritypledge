/**
 * @file event-flow-row.ts
 * @description P1529: the two columns that decide an event's flow, as read from `events` and as the app holds them.
 * P1675 R18: also the hike's before-the-seat preset (absent means all), so events-service-real.ts (over the size limit) does not grow.
 */
import { hikeRegistrationOf, type HikeRegistration } from './hike-answer-model';

export interface EventFlowRow {
  series_slug?: string | null;
  flow?: string | null;
  hike_registration?: string | null; // P1675 R18
}

export function eventFlowFields(row: EventFlowRow): {
  seriesSlug?: string;
  flow: string | null;
  hikeRegistration: HikeRegistration;
} {
  return {
    seriesSlug: row.series_slug ?? undefined,
    flow: row.flow ?? null,
    hikeRegistration: hikeRegistrationOf({ hikeRegistration: row.hike_registration }), // P1675 R18: absent means all
  };
}
