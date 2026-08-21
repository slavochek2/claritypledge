/**
 * @file test-event-room.ts
 * @description P1114 test helpers for the event room presence + CMP opt-in tables
 * (`event_room_members`, `event_room_answers`) and the four RPCs that gate every
 * client mutation on them (`join_event_room`, `set_room_opt_in`, `set_room_readiness`,
 * `get_my_room_status` — Architecture Decision 1 in
 * features/p1114_event_room_presence_and_cmp_opt_in.md).
 *
 * NEITHER TABLE NOR RPC EXISTS YET as of this file's authorship (2026-08-19,
 * `/generate-tests` stage, before `/dev`). Every helper here targets the exact
 * column/RPC shape Architecture Decisions 1 and 6 describe. Calling any of these
 * before the migration lands fails with "relation ... does not exist" (table
 * helpers) or PGRST202 (RPC calls in the test files, not here) — that is the
 * correct pre-implementation state, same convention as
 * e2e/integration/p1053-claim-joiner-seat.spec.ts's GROUP B.
 *
 * `seedRoomMember` writes directly via the admin client, bypassing the RPC layer
 * entirely. That is deliberate: RLS and realtime tests need to construct states
 * the RPCs would refuse to create on their own (an `opted_in = false` row, a row
 * on an already-frozen event, a specific `client_secret` value to test wrong-secret
 * rejection) without depending on the RPC layer already being correct — the classic
 * "don't let the thing under test also be the thing that sets up the test" split
 * already used by test-ready.ts and p1053's seedRoom.
 */
import { supabaseAdmin } from './supabase-admin';

export interface TestRoomMember {
  id: string;
  event_id: string;
  profile_id: string | null;
  display_name: string;
  client_secret: string;
  opted_in: boolean | null;
  readiness_value: number | null;
  comprehension_rating: number | null;
  joined_at: string;
}

export interface TestRoomAnswer {
  id: string;
  room_member_id: string;
  opted_in: boolean;
  cascade_count: number;
  answered_at: string;
}

/**
 * Seeds an `event_room_members` row via the admin client.
 * @param eventId - the owning event
 * @param overrides.optedIn - `undefined`/omitted leaves it at the column default
 *   (expected NULL = "hasn't answered yet", per Decision 2/6 — distinct from `false`)
 * @param overrides.clientSecret - pass a known value to test wrong-secret rejection
 *   against a KNOWN correct one; omit to let the column default (`gen_random_uuid()`)
 *   mint one, then read it back off the returned row.
 */
export async function seedRoomMember(
  eventId: string,
  overrides: Partial<{
    displayName: string;
    profileId: string | null;
    optedIn: boolean | null;
    readinessValue: number | null;
    comprehensionRating: number | null;
    clientSecret: string;
    joinedAt: string;
  }> = {},
): Promise<TestRoomMember> {
  const insert: Record<string, unknown> = {
    event_id: eventId,
    display_name: overrides.displayName ?? `P1114 Room Member ${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    profile_id: overrides.profileId ?? null,
  };
  if (overrides.optedIn !== undefined) insert.opted_in = overrides.optedIn;
  if (overrides.readinessValue !== undefined) insert.readiness_value = overrides.readinessValue;
  if (overrides.comprehensionRating !== undefined) insert.comprehension_rating = overrides.comprehensionRating;
  if (overrides.clientSecret !== undefined) insert.client_secret = overrides.clientSecret;
  if (overrides.joinedAt !== undefined) insert.joined_at = overrides.joinedAt;

  const { data, error } = await supabaseAdmin
    .from('event_room_members')
    .insert(insert)
    .select('id, event_id, profile_id, display_name, client_secret, opted_in, readiness_value, comprehension_rating, joined_at')
    .single();
  if (error || !data) throw new Error(`seedRoomMember failed: ${error?.message}`);
  return data as TestRoomMember;
}

/** Re-reads a member row bypassing RLS, so assertions see ground truth rather
 * than whatever a policy chose to filter. */
export async function readRoomMember(id: string): Promise<TestRoomMember | null> {
  const { data, error } = await supabaseAdmin
    .from('event_room_members')
    .select('id, event_id, profile_id, display_name, client_secret, opted_in, readiness_value, comprehension_rating, joined_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`readRoomMember failed: ${error.message}`);
  return data as TestRoomMember | null;
}

/** Reads the append-only answer history for one member. `event_room_answers` has
 * NO client SELECT policy by design (Decision 6) — this is service-role-only,
 * which is exactly why it's the right place to prove "full history is kept"
 * (Done-When item) without needing a client-facing read path to exist. */
export async function readRoomAnswers(roomMemberId: string): Promise<TestRoomAnswer[]> {
  const { data, error } = await supabaseAdmin
    .from('event_room_answers')
    .select('id, room_member_id, opted_in, cascade_count, answered_at')
    .eq('room_member_id', roomMemberId)
    .order('answered_at', { ascending: true });
  if (error) throw new Error(`readRoomAnswers failed: ${error.message}`);
  return (data ?? []) as TestRoomAnswer[];
}

/** Deletes only the given member ids — never a table-wide wipe (P1083 lesson:
 * this table has no per-test owner scoping other than what a test itself tracks,
 * and `npm run test:e2e` runs the `chromium` and `integration` projects
 * concurrently). If the migration wires `event_room_answers.room_member_id` with
 * `ON DELETE CASCADE`, this also removes that member's answer history; if it
 * doesn't, a leftover-history row will surface as visible DB growth across runs
 * rather than silently, which is the point of not hiding the gap. */
export async function deleteRoomMembers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from('event_room_members').delete().in('id', ids);
  if (error) throw new Error(`deleteRoomMembers failed: ${error.message}`);
}
