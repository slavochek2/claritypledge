/**
 * @file event-flow-row.ts
 * @description P1529: the two columns that decide an event's flow, as read from `events` and as the app holds them.
 */
export interface EventFlowRow {
  series_slug?: string | null;
  flow?: string | null;
}

export function eventFlowFields(row: EventFlowRow): { seriesSlug?: string; flow: string | null } {
  return { seriesSlug: row.series_slug ?? undefined, flow: row.flow ?? null };
}
