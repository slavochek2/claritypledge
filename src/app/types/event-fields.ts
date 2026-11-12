/**
 * Fields of `Event` (./index.ts) that say which series and which organising group an event belongs to, and whether it is hidden. Kept in this
 * sibling module so index.ts, which is over the size limit (P1566 quality ratchet), does not grow.
 */
export interface EventGroupFields {
  /** P1403: series key (e.g. 'social-hike'). Selects the hike layout — never the title. Read-only. */
  seriesSlug?: string;
  /** P1529 D8: the host's per-event flow choice; null/absent = the series decides. Read through `eventFlow`, never directly. */
  flow?: string | null;
  /** P1542 round 10b: the organising group's id (null: no group). Read-only; undefined where a read did not carry it. */
  orgId?: string | null;
  /** P1603: a hidden event: not in any global list, readable only by its host, the registered, and whoever holds the link. */
  isHidden?: boolean;
  /** P1529 E1: where the Clarity Canvas is made: 'before' (a preparation step at home) or 'at_event' (together at the event, default). */
  canvasTiming?: CanvasTiming;
}

export type CanvasTiming = 'before' | 'at_event';
export const DEFAULT_CANVAS_TIMING: CanvasTiming = 'at_event';

/** The column's value as the app holds it; anything unknown reads as the default. */
export function canvasTimingOf(raw: string | null | undefined): CanvasTiming {
  return raw === 'before' ? 'before' : DEFAULT_CANVAS_TIMING;
}
