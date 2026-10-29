/**
 * Fields of `Event` (./index.ts) that say which series and which organising group an event belongs to. Kept in this
 * sibling module so index.ts, which is over the size limit (P1566 quality ratchet), does not grow.
 */
export interface EventGroupFields {
  /** P1403: series key (e.g. 'social-hike'). Selects the hike layout — never the title. Read-only. */
  seriesSlug?: string;
  /** P1542 round 10b: the organising group's id (null: no group). Read-only; undefined where a read did not carry it. */
  orgId?: string | null;
}
