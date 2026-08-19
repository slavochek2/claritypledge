/**
 * @file event-room-service.ts
 * @description P1114: typed wrappers for the event room's four SECURITY DEFINER RPCs
 * (join_event_room, set_room_opt_in, set_room_readiness, get_my_room_status —
 * supabase/migrations/20260819170000_p1114_event_room_rpcs.sql) plus the public roster
 * read and its realtime + reconciliation-poll subscription (Architecture Decision 3).
 *
 * Standalone module, not routed through the mock/real `EventsService` split — this
 * feature has no mock variant (Non-Goals: additive-only, no existing behavior to fork),
 * and every RPC/table here is genuinely new, so there's nothing for a mock to stand in
 * for. `EventsService` gets documentation-only signatures pointing here (see
 * events-service.interface.ts) rather than a second implementation.
 */
import { supabase } from '@/lib/supabase';
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
  client_secret?: string;
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
  };
}

function mapSelf(row: DbRoomMemberRow): EventRoomSelf {
  return { ...mapMember(row), clientSecret: row.client_secret ?? '' };
}

/** The only INSERT path onto event_room_members (Decision 1). Rejoining with an existing
 * profile_id upserts onto the same row (join_event_room's ON CONFLICT) and returns the
 * existing client_secret rather than minting a new one. */
export async function joinEventRoom(eventId: string, displayName: string): Promise<EventRoomSelf> {
  const { data, error } = await supabase.rpc('join_event_room', {
    p_event_id: eventId,
    p_display_name: displayName,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    throw new Error(error?.message ?? 'Could not join this room');
  }
  return mapSelf(data[0] as DbRoomMemberRow);
}

/** Changes the caller's own opt-in answer. Server computes the cascade counter and writes
 * the append-only history row (Decision 6) — this function never sees or sends that count. */
export async function setRoomOptIn(memberId: string, secret: string, optedIn: boolean): Promise<EventRoomSelf> {
  const { data, error } = await supabase.rpc('set_room_opt_in', {
    p_member_id: memberId,
    p_secret: secret,
    p_opted_in: optedIn,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    throw new Error(error?.message ?? 'Could not update your answer');
  }
  return mapSelf(data[0] as DbRoomMemberRow);
}

/** Changes the caller's own room readiness value (0-10). Distinct from — never mixed
 * with — the general /ready `ready_submissions` table (spec §7). */
export async function setRoomReadiness(memberId: string, secret: string, value: number): Promise<EventRoomSelf> {
  const { data, error } = await supabase.rpc('set_room_readiness', {
    p_member_id: memberId,
    p_secret: secret,
    p_value: value,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    throw new Error(error?.message ?? 'Could not update your readiness');
  }
  return mapSelf(data[0] as DbRoomMemberRow);
}

/** The only sanctioned read of the caller's own row when it is not (or not yet) opted
 * in — bypasses the public "opted_in = true" SELECT policy via SECURITY DEFINER, once
 * the secret checks out (Decision 2). Returns null on a stale/invalid localStorage
 * secret so the caller can degrade to "rejoin with a new name" rather than error. */
export async function getMyRoomStatus(memberId: string, secret: string): Promise<EventRoomSelf | null> {
  const { data, error } = await supabase.rpc('get_my_room_status', {
    p_member_id: memberId,
    p_secret: secret,
  });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  return mapSelf(data[0] as DbRoomMemberRow);
}

/** Public roster — RLS-filtered, can only ever return opted_in = true rows (Decision 2).
 * Never throws to an error state on failure; callers should treat [] as "show zero-state
 * or leave the prior list," per the Risks "never an empty wall on a transient failure". */
export async function getRoomRoster(eventId: string): Promise<EventRoomMember[]> {
  const { data, error } = await supabase
    .from('event_room_members')
    .select('id, event_id, profile_id, display_name, opted_in, readiness_value, joined_at')
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
