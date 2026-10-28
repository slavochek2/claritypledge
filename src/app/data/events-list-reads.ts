/**
 * @file events-list-reads.ts
 * @description The reads behind the events LIST, kept out of events-service-real.ts (over its size
 * limit: new code goes here). Two things live here:
 *  - the attendee-count batch both list reads share (one request for every listed event);
 *  - the viewer's own RSVPs for those same events (P1586: one request, not one per event).
 */
import type { EventWithHost } from '@/app/types';
import { supabase } from '@/lib/supabase';
import { throwDbError } from './db-error-logger';

/** P1586: opt-in for a list read whose caller must tell a failed read from an empty list. */
export interface EventsListReadOptions {
  /** Reject on a database error instead of resolving to `[]`. Default false: every other caller
   *  (the next-webinar hero, the close page, the per-org lookup) keeps its swallow-to-empty behaviour. */
  throwOnError?: boolean;
}

/**
 * Fill `attendeeCount` and `hostHasRsvp` on `events` from ONE batched read. A failed count read leaves
 * both unset (the list still renders), exactly as before this moved out of the service.
 */
export async function attachAttendeeCounts(events: EventWithHost[]): Promise<void> {
  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return;
  // P1366: `profile_id` rides along ONLY to tell whether the host has an RSVP row of their
  // own (a display input for `displayGoingCount`). The count itself is unchanged: every row.
  const { data: rsvpCounts } = await supabase
    .from('event_rsvps')
    .select('event_id, profile_id')
    .in('event_id', eventIds);
  if (!rsvpCounts) return;

  const countMap = rsvpCounts.reduce((acc, rsvp) => {
    acc[rsvp.event_id] = (acc[rsvp.event_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  events.forEach((event) => {
    event.attendeeCount = countMap[event.id] || 0;
    event.hostHasRsvp = rsvpCounts.some(
      (rsvp) => rsvp.event_id === event.id && rsvp.profile_id === event.hostId,
    );
  });
}

/**
 * P1586: which of `eventIds` the viewer has an RSVP for, in one request. REJECTS on a database error:
 * the list shows a mark only for ids this returns, so a failed read must not look like "not going".
 */
export async function fetchViewerRsvpEventIds(eventIds: string[], profileId: string): Promise<string[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from('event_rsvps')
    .select('event_id')
    .eq('profile_id', profileId)
    .in('event_id', eventIds);
  if (error) throwDbError('getViewerRsvps', error, 'Your registrations could not be loaded');
  return (data ?? []).map((row) => row.event_id);
}
