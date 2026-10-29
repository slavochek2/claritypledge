/**
 * P1542 round 10: reads used by events-service-real that live here so that file (over the P1566 size limit) does not
 * grow: the event row by slug (with the "not found" vs "could not read" split) and the event's organising group.
 * Behaviour is exactly that of the code they were moved from.
 */
import { supabase } from '@/lib/supabase';
import { throwDbError } from './db-error-logger';

export type OrganizerRef = { id: string; name: string; slug: string };

/** The event row by slug, host profile joined — the same select getEventBySlug always made. null: no such event, or
 *  (unless `throwOnError`) a failed read. With `throwOnError` anything but PostgREST's no-row answer (PGRST116) throws,
 *  so a caller can tell "not found" from "could not read". */
export async function selectEventRowBySlug(slug: string, throwOnError: boolean): Promise<unknown | null> {
  const { data, error } = await supabase
    .from('events')
    .select(`
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
    `)
    .eq('slug', slug)
    .single();
  if (error && throwOnError && error.code !== 'PGRST116') throw new Error(`getEventBySlug failed: ${error.message}`);
  return error || !data ? null : data;
}

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
