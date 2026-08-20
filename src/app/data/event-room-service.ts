/**
 * @file event-room-service.ts
 * @description P1114: typed wrappers for the event room's four SECURITY DEFINER RPCs
 * (join_event_room, set_room_opt_in, set_room_readiness, get_my_room_status —
 * supabase/migrations/20260819170000_p1114_event_room_rpcs.sql) plus the public roster
 * read and its realtime + reconciliation-poll subscription (Architecture Decision 3).
 *
 * REVISED 2026-08-20 (spec Solution, "REVISED (2)" block): the founder retired the
 * walk-in. Every caller here is registered + signed in, so identity is the signed-in
 * profile (auth.uid()) — there is no bearer token in this module and nothing this
 * module writes to browser storage. `get_my_room_status` is keyed by event id alone;
 * the server reads the caller's own row via their session.
 *
 * Standalone module, not routed through the mock/real `EventsService` split — this
 * feature has no mock variant (Non-Goals: additive-only, no existing behavior to fork),
 * and every RPC/table here is genuinely new, so there's nothing for a mock to stand in
 * for. `EventsService` gets documentation-only signatures pointing here (see
 * events-service.interface.ts) rather than a second implementation.
 */
import { supabase } from '@/lib/supabase';
import { earCountOf } from './ear-count';
import type { EventRoomMember, EventRoomSelf } from '@/app/types';

// Decision 3: 30s reconciliation poll — both the required degrade-to-static-list path
// (Risks: "the roster must degrade to a readable static list... never an error state or
// an empty wall") and the backstop for the untested opt-out-flip-back realtime gap.
const RECONCILE_POLL_MS = 30_000;

interface DbRoomMemberRow {
  id: string;
  event_id: string;
  profile_id: string | null;
  display_name: string;
  opted_in: boolean | null;
  readiness_value: number | null;
  joined_at: string;
  // Only present on getRoomRoster's join (see below) — the four RPCs never join profiles.
  profile?: {
    slug: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
    has_pledged: boolean | null;
    ears_count: number | null;
  } | null;
}

function mapMember(row: DbRoomMemberRow): EventRoomMember {
  return {
    id: row.id,
    eventId: row.event_id,
    profileId: row.profile_id,
    displayName: row.display_name,
    optedIn: row.opted_in,
    readinessValue: row.readiness_value,
    joinedAt: row.joined_at,
    profileSlug: row.profile?.slug ?? null,
    profileAvatarColor: row.profile?.avatar_color ?? null,
    profileAvatarUrl: row.profile?.avatar_url ?? null,
    profileHasPledged: row.profile?.has_pledged ?? false,
    profileEarCount: earCountOf(row.profile),
  };
}

/** The only INSERT path onto event_room_members. Rejoining with an existing row (a
 * second device, or a return visit) upserts onto the same row (join_event_room's ON
 * CONFLICT) rather than creating a duplicate. Caller must be signed in — the RPC's
 * grant is authenticated-only. */
export async function joinEventRoom(eventId: string, displayName: string): Promise<EventRoomSelf> {
  const { data, error } = await supabase.rpc('join_event_room', {
    p_event_id: eventId,
    p_display_name: displayName,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    throw new Error(error?.message ?? 'Could not join this room');
  }
  return mapMember(data[0] as DbRoomMemberRow);
}

/** Changes the caller's own opt-in answer. Server computes the cascade counter and writes
 * the append-only history row (Decision 6) — this function never sees or sends that count.
 * Ownership is auth.uid() = profile_id, enforced server-side. */
export async function setRoomOptIn(memberId: string, optedIn: boolean): Promise<EventRoomSelf> {
  const { data, error } = await supabase.rpc('set_room_opt_in', {
    p_member_id: memberId,
    p_opted_in: optedIn,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    throw new Error(error?.message ?? 'Could not update your answer');
  }
  return mapMember(data[0] as DbRoomMemberRow);
}

/** Changes the caller's own room readiness value (0-10). Distinct from — never mixed
 * with — the general /ready `ready_submissions` table (spec §7). */
export async function setRoomReadiness(memberId: string, value: number): Promise<EventRoomSelf> {
  const { data, error } = await supabase.rpc('set_room_readiness', {
    p_member_id: memberId,
    p_value: value,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    throw new Error(error?.message ?? 'Could not update your readiness');
  }
  return mapMember(data[0] as DbRoomMemberRow);
}

/** The caller's OWN room status for one event, keyed by their session (auth.uid()) —
 * bypasses the public "opted_in = true" SELECT policy via SECURITY DEFINER. Returns
 * null when the caller has never joined this event's room, so callers degrade to
 * "not yet joined" rather than treating an empty result as an error. */
export async function getMyRoomStatus(eventId: string): Promise<EventRoomSelf | null> {
  const { data, error } = await supabase.rpc('get_my_room_status', {
    p_event_id: eventId,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  return mapMember(data[0] as DbRoomMemberRow);
}

/** Public roster — RLS-filtered, can only ever return opted_in = true rows (Decision 2).
 * Never throws to an error state on failure; callers should treat [] as "show zero-state
 * or leave the prior list," per the Risks "never an empty wall on a transient failure".
 *
 * Joins `profiles` (read-side only, no schema change) so registered attendees render as
 * the normal person row used elsewhere — full name, profile link, avatar, pledge ring,
 * ear badge. */
export async function getRoomRoster(eventId: string): Promise<EventRoomMember[]> {
  const { data, error } = await supabase
    .from('event_room_members')
    .select(`
      id, event_id, profile_id, display_name, opted_in, readiness_value, joined_at,
      profile:profiles!event_room_members_profile_id_fkey (
        slug,
        avatar_color,
        avatar_url,
        has_pledged,
        ears_count
      )
    `)
    .eq('event_id', eventId)
    .order('joined_at', { ascending: true });
  if (error) return [];
  return (data as DbRoomMemberRow[]).map(mapMember);
}

/** Realtime channel (Decision 3) + a 30s reconciliation poll that is BOTH the required
 * degrade path (channel never reaches SUBSCRIBED, or drops) and the backstop for the
 * untested opt-out-flip-back removal case. Always calls `onUpdate` with a fresh roster
 * fetch on every relevant event — never partial/optimistic patching, so a dropped or
 * out-of-order payload can never leave the roster in a state a full re-fetch wouldn't
 * also produce. Returns an unsubscribe function. */
export function subscribeToRoomRoster(eventId: string, onUpdate: (roster: EventRoomMember[]) => void): () => void {
  let cancelled = false;

  const reload = async () => {
    const roster = await getRoomRoster(eventId);
    if (!cancelled) onUpdate(roster);
  };

  const channel = supabase
    .channel(`event_room:${eventId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'event_room_members', filter: `event_id=eq.${eventId}` },
      () => { void reload(); },
    )
    .subscribe();

  void reload();
  const pollId = setInterval(() => { void reload(); }, RECONCILE_POLL_MS);

  return () => {
    cancelled = true;
    clearInterval(pollId);
    void supabase.removeChannel(channel);
  };
}
