/**
 * P1562: the event lists' shared parts, kept here so events-service-real.ts (over the P1566 size limit) does not grow.
 *
 *  - `attachRsvpCounts`: the "going" count and the host's own RSVP, one batched read for a list of events — the same
 *    code getUpcomingEvents and getPastEvents each carried.
 *  - `selectPastEventRows`: the past-events query getPastEvents made, unchanged.
 *  - `fetchViewerRsvpEventIds` (P1586): which listed events the viewer has an RSVP for, batched like the counts.
 *  - `fetchMyEvents` (P1698): the viewer's hosted and registered events, hidden included, for the My events tab.
 *  - `failListRead`: the opt-in failure report. By default a failed list read is logged and the list is empty (every
 *    existing caller); with `throwOnError` it throws, so a page can say "could not load" instead of "no events".
 */
import { supabase } from '@/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import type { EventWithHost } from '@/app/types';
import { logDbError, throwDbError } from './db-error-logger';

/** `signal`: the caller gave up (unmount, key change) — a follow-up read still waiting for a visible tab is dropped. */
export type ListReadOptions = { throwOnError?: boolean; signal?: AbortSignal };

/** Resolves true once the tab is visible (metered rule 3: a hidden tab makes no request); false when `signal` is or
 *  becomes aborted — checked up front and again at the moment the read would be permitted. */
export function untilVisible(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return Promise.resolve(true);
  return new Promise((resolve) => {
    function done(visible: boolean) {
      document.removeEventListener('visibilitychange', onChange);
      signal?.removeEventListener('abort', onAbort);
      resolve(visible && !signal?.aborted);
    }
    function onChange() { if (document.visibilityState !== 'hidden') done(true); }
    function onAbort() { done(false); }
    document.addEventListener('visibilitychange', onChange);
    signal?.addEventListener('abort', onAbort);
  });
}

const EVENT_WITH_HOST = `
  *,
  host:profiles!events_host_id_fkey (
    id,
    full_name:name,
    slug,
    headline:role,
    avatar_color,
    avatar_url,
    has_pledged,
    ears_count
  )
`;

/** Log a failed list read; with `throwOnError`, throw instead of letting the caller return an empty list. */
export function failListRead(context: string, error: PostgrestError, options?: ListReadOptions): void {
  if (options?.throwOnError) throwDbError(context, error, `${context} failed: ${error.message}`);
  logDbError(context, error);
}

/** Past events: completed, or cancelled/upcoming and past the grace cutoff; optionally one group's. */
export async function selectPastEventRows(graceCutoff: string, orgId?: string) {
  let query = supabase
    .from('events')
    .select(EVENT_WITH_HOST)
    .eq('is_hidden', false) // P1603: a global list never shows a hidden event, even one its viewer may read
    .or(`status.eq.completed,and(status.eq.cancelled,datetime.lt.${graceCutoff}),and(status.eq.upcoming,datetime.lt.${graceCutoff})`)
    .order('datetime', { ascending: false });
  // P1060: the org filter is conditional — omitting orgId adds no `.eq`, so the standalone list stays unfiltered.
  if (orgId) query = query.eq('org_id', orgId);
  return query;
}

/** P1366: `profile_id` rides along ONLY to tell whether the host has an RSVP row of their own (a display input for
 *  `displayGoingCount`). The count itself is unchanged: every row.
 *
 *  P1562 round 5: this follow-up read waits for a visible tab (the list read may have been sent while visible and the
 *  tab hidden since), and is dropped if the caller aborted meanwhile. A failed count read rejects with `throwOnError`;
 *  without it the events keep no counts, as before. */
const RSVP_BATCH = 100;

export async function attachRsvpCounts(events: EventWithHost[], options?: ListReadOptions): Promise<void> {
  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return;
  if (!(await untilVisible(options?.signal))) return;
  // Batched: one `in.(…)` over hundreds of ids exceeds the URL limit (HTTP 414).
  const reads = [];
  for (let i = 0; i < eventIds.length; i += RSVP_BATCH) {
    const read = supabase.from('event_rsvps').select('event_id, profile_id').in('event_id', eventIds.slice(i, i + RSVP_BATCH));
    reads.push(options?.signal ? read.abortSignal(options.signal) : read);
  }
  const results = await Promise.all(reads);
  // The caller gave up while the reads were out: their answers (or the abort errors) touch nothing.
  if (options?.signal?.aborted) return;
  const failed = results.find((r) => r.error);
  // Every failed read is logged; with throwOnError it throws instead (failListRead). Either way no partial counts.
  if (failed?.error) {
    failListRead('attachRsvpCounts', failed.error, options);
    return;
  }
  // One pass: the count per event, and which (event, person) pairs have a row — so the host's own row is a lookup.
  const countMap: Record<string, number> = {};
  const rsvpPairs = new Set<string>();
  for (const rsvp of results.flatMap((r) => r.data ?? [])) {
    countMap[rsvp.event_id] = (countMap[rsvp.event_id] || 0) + 1;
    rsvpPairs.add(`${rsvp.event_id}|${rsvp.profile_id}`);
  }
  events.forEach((event) => {
    event.attendeeCount = countMap[event.id] || 0;
    event.hostHasRsvp = rsvpPairs.has(`${event.id}|${event.hostId}`);
  });
}

/** P1698: the viewer's own events (hosted or registered, hidden ones included), split by the global lists' rules. */
export interface MyEvents {
  /** Status upcoming or cancelled and not before the grace cutoff (the Upcoming tab's rule), soonest first. */
  upcoming: EventWithHost[];
  /** Everything else (the Past tab's rule), most recent first. */
  past: EventWithHost[];
  /** The events the viewer registered for: registered means going, so these carry the Going mark. */
  registeredIds: string[];
}

const NO_MY_EVENTS: MyEvents = { upcoming: [], past: [], registeredIds: [] };

/**
 * P1698: the My events read. Two requests in parallel (hosted events; the viewer's RSVPs with their events embedded),
 * then the going counts through `attachRsvpCounts`, only when there is something to count. No `is_hidden` filter: RLS
 * returns a hidden event to its host and to the people registered for it, and to nobody else. `toEvent` is the
 * service's row mapper, passed in so this module does not import the service (no cycle).
 */
export async function fetchMyEvents<Row>(
  profileId: string,
  graceCutoff: string,
  toEvent: (row: Row) => EventWithHost,
  options?: ListReadOptions,
): Promise<MyEvents> {
  // Metered rule 3: no request from a hidden tab, none once the caller gave up (it drops this answer).
  if (!(await untilVisible(options?.signal))) return NO_MY_EVENTS;
  const hostedRead = supabase.from('events').select(EVENT_WITH_HOST).eq('host_id', profileId);
  const registeredRead = supabase.from('event_rsvps').select(`event:events!inner(${EVENT_WITH_HOST})`).eq('profile_id', profileId);
  const [hosted, registered] = await Promise.all([
    options?.signal ? hostedRead.abortSignal(options.signal) : hostedRead,
    options?.signal ? registeredRead.abortSignal(options.signal) : registeredRead,
  ]);
  if (options?.signal?.aborted) return NO_MY_EVENTS;
  const error = hosted.error ?? registered.error;
  if (error) {
    failListRead('getMyEvents', error, options);
    return NO_MY_EVENTS;
  }

  // One card per event: an event the viewer hosts AND registered for comes from the hosted read (Host wins the mark).
  const byId = new Map<string, EventWithHost>();
  for (const row of hosted.data as Row[]) {
    const event = toEvent(row);
    byId.set(event.id, event);
  }
  const registeredIds: string[] = [];
  // `!inner` embeds the one event an RSVP points at (an object; the array form is only how the client types it).
  for (const { event: raw } of registered.data as unknown as { event: Row | Row[] | null }[]) {
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) continue;
    const event = toEvent(row);
    registeredIds.push(event.id);
    if (!byId.has(event.id)) byId.set(event.id, event);
  }

  const events = [...byId.values()];
  await attachRsvpCounts(events, options);
  const cutoff = Date.parse(graceCutoff);
  const at = (event: EventWithHost) => Date.parse(event.datetime);
  const isUpcoming = (event: EventWithHost) =>
    (event.status === 'upcoming' || event.status === 'cancelled') && at(event) >= cutoff;
  return {
    upcoming: events.filter(isUpcoming).sort((a, b) => at(a) - at(b)),
    past: events.filter((event) => !isUpcoming(event)).sort((a, b) => at(b) - at(a)),
    registeredIds,
  };
}

/**
 * P1586: which of `eventIds` the viewer has an RSVP for, once the tab is visible, one request per RSVP_BATCH ids (a long list in one `in.(…)`
 * exceeds the URL limit). REJECTS on a database error: the list shows a mark only for ids this returns, so a failed
 * read must not look like "not going".
 */
export async function fetchViewerRsvpEventIds(eventIds: string[], profileId: string, options?: { signal?: AbortSignal }): Promise<string[]> {
  if (eventIds.length === 0) return [];
  // Metered rule 3, as attachRsvpCounts: no request from a hidden tab, none at all once the caller gave up (the
  // caller drops the answer; [] here is never shown).
  if (!(await untilVisible(options?.signal))) return [];
  const reads = [];
  for (let i = 0; i < eventIds.length; i += RSVP_BATCH) {
    const read = supabase.from('event_rsvps').select('event_id').eq('profile_id', profileId).in('event_id', eventIds.slice(i, i + RSVP_BATCH));
    reads.push(options?.signal ? read.abortSignal(options.signal) : read);
  }
  const results = await Promise.all(reads);
  if (options?.signal?.aborted) return []; // gave up while the reads were out: dropped, never shown
  const failed = results.find((r) => r.error);
  if (failed?.error) throwDbError('getViewerRsvps', failed.error, 'Your registrations could not be loaded');
  return results.flatMap((r) => (r.data ?? []).map((row) => row.event_id));
}
