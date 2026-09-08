/**
 * @file 20260908170000_p1236_join_rpc_consent.spec.ts
 * @description P270 canary for 20260908170000_p1236_transcribe_consent_and_limits.sql.
 *
 * P1236 Decision 5 makes consent server state: `join_transcribe_room()` is SECURITY
 * DEFINER, takes consent as a required argument, and writes it in the same statement as
 * the member row — so "a member without consent" stops being a representable state.
 *
 * A SECURITY DEFINER function runs with RLS bypassed, which means every check the policy
 * used to make is now this function's responsibility, and a green unit test proves none of
 * it: the whole thing lives in the database. So each refusal below is exercised against
 * the real test DB, and each one re-reads through the ADMIN client afterwards — a function
 * that raised but had already written its row would otherwise look identical to one that
 * refused (epistemic.md gate 7: a gate nobody has watched fail is unproven).
 *
 * Two-client pattern from e2e/integration/20260824000000_p1149_room_end_policy_column_guard.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeRoomCode() {
  return `P1236${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

test.describe('P1236: join_transcribe_room — consent is written by the server or the join fails', () => {
  let alice: TestUser;
  let mallory: TestUser;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  async function clientFor(u: TestUser): Promise<SupabaseClient> {
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email: u.email, password: TEST_PASSWORD,
    });
    expect(error).toBeNull();
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();
    return client;
  }

  /** A room with no members yet, plus one clarity_sessions row owned by `owner`. */
  async function seedRoomAndSession(owner: TestUser, opts: { ended?: boolean } = {}) {
    const code = makeRoomCode();
    const { data: room, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms')
      .insert({ code, ended_at: opts.ended ? new Date().toISOString() : null })
      .select('id, code')
      .single();
    expect(roomError, `seed room failed: ${roomError?.message}`).toBeNull();
    createdRoomIds.push(room!.id);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `${code}-S`, creator_name: 'P1236 Speaker', creator_profile_id: owner.user.id })
      .select('id')
      .single();
    expect(sessionError, `seed session failed: ${sessionError?.message}`).toBeNull();
    createdSessionIds.push(session!.id);

    return { roomId: room!.id, sessionId: session!.id };
  }

  /** The only trustworthy readback: service role, so no policy can hide a written row. */
  async function membersOf(roomId: string) {
    const { data, error } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('id, profile_id, consent_given_at, slice_count')
      .eq('room_id', roomId);
    expect(error, `readback failed: ${error?.message}`).toBeNull();
    return data ?? [];
  }

  test.beforeAll(async () => {
    alice = await createTestUser({ name: 'P1236 Alice' });
    mallory = await createTestUser({ name: 'P1236 Mallory' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length > 0) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length > 0) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (alice?.user?.id) await deleteTestUser(alice.user.id);
    if (mallory?.user?.id) await deleteTestUser(mallory.user.id);
  });

  test('control: consenting joins, and the server records the timestamp', async () => {
    const { roomId, sessionId } = await seedRoomAndSession(alice);
    const client = await clientFor(alice);

    const { data, error } = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1236 Alice', p_session_id: sessionId, p_consent: true,
    });
    expect(error, `join failed: ${error?.message}`).toBeNull();

    const rows = data as Array<{ id: string; profile_id: string; consent_given_at: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].profile_id).toBe(alice.user.id);
    expect(rows[0].consent_given_at).not.toBeNull();

    // The RETURNING half is the part that used to be impossible under RLS (INSERT ...
    // RETURNING evaluated against a SELECT policy that cannot see its own row). Confirm
    // it matches what actually landed, not just that something came back.
    const persisted = await membersOf(roomId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe(rows[0].id);
    expect(persisted[0].consent_given_at).not.toBeNull();
    expect(persisted[0].slice_count).toBe(0);
  });

  test('p_consent = false is refused, and no member row is written', async () => {
    const { roomId, sessionId } = await seedRoomAndSession(alice);
    const client = await clientFor(alice);

    const { error } = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1236 Alice', p_session_id: sessionId, p_consent: false,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('consent is required');
    expect(await membersOf(roomId)).toHaveLength(0);
  });

  test('p_consent = null is refused too — NULL is not "probably yes"', async () => {
    const { roomId, sessionId } = await seedRoomAndSession(alice);
    const client = await clientFor(alice);

    const { error } = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1236 Alice', p_session_id: sessionId, p_consent: null,
    });
    expect(error).not.toBeNull();
    expect(await membersOf(roomId)).toHaveLength(0);
  });

  test('a session belonging to someone else cannot be attached to your own seat', async () => {
    // The policy this RPC replaces checked only profile_id = auth.uid() and never looked
    // at session_id at all, so this was reachable before P1236. Bypassing RLS means
    // inheriting the duty to be at least as strict as the policy replaced.
    const { roomId, sessionId } = await seedRoomAndSession(alice);
    const client = await clientFor(mallory);

    const { error } = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1236 Mallory', p_session_id: sessionId, p_consent: true,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('session does not belong to the caller');
    expect(await membersOf(roomId)).toHaveLength(0);
  });

  test('an ended room cannot be joined', async () => {
    const { roomId, sessionId } = await seedRoomAndSession(alice, { ended: true });
    const client = await clientFor(alice);

    const { error } = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1236 Alice', p_session_id: sessionId, p_consent: true,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('room not found or already ended');
    expect(await membersOf(roomId)).toHaveLength(0);
  });

  test('re-joining is idempotent and keeps the FIRST consent timestamp', async () => {
    // A page refresh or a double tap on "Join room" re-enters the RPC. "When did this
    // person agree" has one answer, and it is the first one — restamping it would quietly
    // rewrite the record every time the page reloaded.
    const { roomId, sessionId } = await seedRoomAndSession(alice);
    const client = await clientFor(alice);

    const first = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1236 Alice', p_session_id: sessionId, p_consent: true,
    });
    expect(first.error).toBeNull();
    const firstRow = (first.data as Array<{ id: string; consent_given_at: string }>)[0];

    const second = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1236 Alice Renamed', p_session_id: sessionId, p_consent: true,
    });
    expect(second.error).toBeNull();
    const secondRow = (second.data as Array<{ id: string; consent_given_at: string }>)[0];

    expect(secondRow.id).toBe(firstRow.id);
    expect(secondRow.consent_given_at).toBe(firstRow.consent_given_at);
    expect(await membersOf(roomId)).toHaveLength(1);
  });

  test('a pre-P1236 member row (consent NULL) is healed only by an actual consented join', async () => {
    // The COALESCE in the RPC's ON CONFLICT arm backfills a NULL. That is not a loophole:
    // reaching that line at all required passing p_consent = TRUE, which is the consent
    // screen. This test pins both halves — the row starts NULL, and it is still NULL after
    // a REFUSED join.
    const { roomId, sessionId } = await seedRoomAndSession(alice);
    const { error: seedError } = await supabaseAdmin
      .from('transcribe_room_members')
      .insert({ room_id: roomId, profile_id: alice.user.id, display_name: 'P1236 Alice', session_id: sessionId });
    expect(seedError, `legacy seed failed: ${seedError?.message}`).toBeNull();
    expect((await membersOf(roomId))[0].consent_given_at).toBeNull();

    const client = await clientFor(alice);

    const refused = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1236 Alice', p_session_id: sessionId, p_consent: false,
    });
    expect(refused.error).not.toBeNull();
    expect((await membersOf(roomId))[0].consent_given_at).toBeNull();

    const healed = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1236 Alice', p_session_id: sessionId, p_consent: true,
    });
    expect(healed.error).toBeNull();
    expect((await membersOf(roomId))[0].consent_given_at).not.toBeNull();
  });
});
