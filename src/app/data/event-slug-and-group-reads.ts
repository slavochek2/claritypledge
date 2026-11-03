/**
 * P1542 round 10: reads used by events-service-real that live here so that file (over the P1566 size limit) does not
 * grow: the event row by slug (with the "not found" vs "could not read" split) and the event's organising group.
 * Behaviour is exactly that of the code they were moved from.
 */
import { supabase } from '@/lib/supabase';
import { logDbError, throwDbError } from './db-error-logger';

export type OrganizerRef = { id: string; name: string; slug: string };

/** The host columns the event page shows, joined onto an event row. */
const HOST_COLUMNS = 'id, full_name:name, slug, headline:role, avatar_color, avatar_url, has_pledged, ears_count';
const EVENT_WITH_HOST = `*, host:profiles!events_host_id_fkey (${HOST_COLUMNS})`;

/** P1603: the one door to a hidden event for someone who is neither its host nor registered: an EXACT slug through
 *  get_event_by_slug (a database function, so the events policy does not apply). Returns the same row shape as a direct
 *  read with the same `select`. null: no such slug. A failed call throws with `throwOnError`, else it reads as null. */
export async function readEventBySlugViaRpc(slug: string, select: string, throwOnError: boolean): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc('get_event_by_slug', { p_slug: slug }).select(select).maybeSingle();
  if (error) {
    if (throwOnError) throw new Error(`getEventBySlug failed: ${error.message}`);
    return null;
  }
  return (data as Record<string, unknown> | null) ?? null;
}

/** An event row by slug with the caller's `select`. A direct read first (public events, and hidden ones the viewer hosts
 *  or is registered for); when the table shows no row, the exact-slug function (P1603), because a hidden event is
 *  invisible to the table for everyone else yet must open for whoever holds the link. */
export async function selectEventRowBySlugWith(select: string, slug: string, throwOnError: boolean): Promise<unknown | null> {
  const { data, error } = await supabase.from('events').select(select).eq('slug', slug).single();
  if (!error && data) return data;
  if (error && error.code !== 'PGRST116') {
    if (throwOnError) throw new Error(`getEventBySlug failed: ${error.message}`);
    return null;
  }
  return readEventBySlugViaRpc(slug, select, throwOnError);
}

/** The event row by slug, host profile joined — the same select getEventBySlug always made. null: no such event, or
 *  (unless `throwOnError`) a failed read. With `throwOnError` anything but PostgREST's no-row answer (PGRST116) throws,
 *  so a caller can tell "not found" from "could not read". */
export function selectEventRowBySlug(slug: string, throwOnError: boolean): Promise<unknown | null> {
  return selectEventRowBySlugWith(EVENT_WITH_HOST, slug, throwOnError);
}

/** What an RSVP needs to know before inserting: capacity, cancellation, and whether the event is hidden (a hidden event is
 *  joined only through rsvp_to_event_by_slug, never by a direct insert). By id; a link holder who is not yet
 *  registered cannot read a hidden event by id, so with `slug` (which the page that offers the RSVP already holds) the
 *  exact-slug function answers instead — and only for the row whose id matches. null: not found. */
export async function readRsvpGate(eventId: string, slug?: string): Promise<RsvpGate | null> {
  const { data } = await supabase.from('events').select('id, max_attendees, status, is_hidden').eq('id', eventId).single();
  if (data) return data as RsvpGate;
  const viaSlug = slug ? await readEventBySlugViaRpc(slug, 'id, max_attendees, status, is_hidden', false) : null;
  return viaSlug && viaSlug.id === eventId ? (viaSlug as unknown as RsvpGate) : null;
}

export type RsvpGate = { max_attendees: number | null; status: string; is_hidden?: boolean | null };

/** One read of a group by id (P1542 round 10f: a caller holding the event row already knows its org_id). */
export async function readOrganizationById(orgId: string): Promise<OrganizerRef | null> {
  const { data: org, error: orgError } = await supabase
    .from('organization')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle();
  if (orgError) {
    throwDbError('getEventOrganizer(org)', orgError, `Failed to load the event's group: ${orgError.message}`);
  }
  return org?.name && org?.slug ? { id: org.id as string, name: org.name, slug: org.slug } : null;
}

/** An event's organising group when only the event id is at hand: the event's org_id, then the group. */
export async function readEventOrganizer(eventId: string): Promise<OrganizerRef | null> {
  const { data: ev, error: evError } = await supabase
    .from('events')
    .select('org_id')
    .eq('id', eventId)
    .maybeSingle();
  if (evError) {
    throwDbError('getEventOrganizer(event)', evError, `Failed to load the event's group: ${evError.message}`);
  }
  if (!ev?.org_id) return null;
  return readOrganizationById(ev.org_id as string);
}

/** P1542 round 10b: the organising group's id from an event row (null: no group). */
export function orgIdOf(row: { org_id?: string | null }): string | null {
  return row.org_id ?? null;
}

/** P1264: the organiser's standing note for an event page. `orgId` is what the caller's event row already carries
 *  (null: no group, so nothing to read); without it the event is read by id. A hidden event the viewer is not yet
 *  registered for cannot be read by id, which is why the page passes it. */
export async function readEventOrgFooterNote(eventId: string, orgId?: string | null): Promise<string | null> {
  let groupId = orgId;
  if (groupId === undefined) {
    const { data: ev, error: evError } = await supabase.from('events').select('org_id').eq('id', eventId).maybeSingle();
    if (evError) {
      logDbError('getEventOrgFooterNote(event)', evError);
      return null;
    }
    groupId = ev?.org_id ?? null;
  }
  if (!groupId) return null;
  const { data: org, error: orgError } = await supabase.from('organization').select('event_footer_note').eq('id', groupId).maybeSingle();
  if (orgError) {
    logDbError('getEventOrgFooterNote(org)', orgError);
    return null;
  }
  const note = org?.event_footer_note;
  // Whitespace-only is "unset", so a note cleared to spaces cannot produce an empty bordered block.
  return note && note.trim().length > 0 ? note : null;
}
