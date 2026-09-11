/**
 * @file p1275-create-transcribe-room-rpc.spec.ts
 * @description P1275: what create_transcribe_room() must guarantee.
 *
 * Written before the migration (P270). The UI canary
 * (e2e/p1275-transcribe-room-create.spec.ts) proves the user can start a room again;
 * this proves the server-side function behind it is not a new hole.
 *
 * The function is SECURITY DEFINER, so RLS is not evaluated inside it. Everything the
 * dropped policy used to enforce — and one thing it never enforced — has to be asserted
 * here instead, because there is no policy left to catch a mistake.
 */
import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

/** The client-side generator's alphabet: 32 chars, no I/O/0/1. */
function roomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

test.describe('P1275: create_transcribe_room', () => {
  let creatorId: string;
  let strangerId: string;
  let creator: SupabaseClient;
  let creatorSessionId: string;
  let strangerSessionId: string;
  const createdRoomIds: string[] = [];

  test.beforeAll(async () => {
    const creatorEmail = generateTestEmail();
    creatorId = (await createTestUser({ name: 'P1275 Creator', email: creatorEmail })).user.id;
    const strangerEmail = generateTestEmail();
    strangerId = (await createTestUser({ name: 'P1275 Stranger', email: strangerEmail })).user.id;

    // Each participant brings their own clarity_sessions row — the recording this seat
    // maps to. joinRoom mints one per member; createRoom must do the same.
    for (const [profileId, name, out] of [
      [creatorId, 'P1275 Creator', 'creator'],
      [strangerId, 'P1275 Stranger', 'stranger'],
    ] as const) {
      const { data, error } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({ code: `P1275-${out}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, creator_name: name, creator_profile_id: profileId })
        .select('id')
        .single();
      if (error) throw new Error(`p1275 fixture: clarity_sessions insert failed: ${error.message}`);
      if (out === 'creator') creatorSessionId = data!.id;
      else strangerSessionId = data!.id;
    }

    creator = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const signIn = await creator.auth.signInWithPassword({ email: creatorEmail, password: TEST_PASSWORD });
    if (signIn.error) throw new Error(`p1275 fixture: creator sign-in failed: ${signIn.error.message}`);
  });

  test.afterAll(async () => {
    for (const id of createdRoomIds) await supabaseAdmin.from('transcribe_rooms').delete().eq('id', id);
    if (creatorId) await deleteTestUser(creatorId);
    if (strangerId) await deleteTestUser(strangerId);
  });

  test('creates the room and the creator membership in one call', async () => {
    // CONTROL: the creator really holds a session. Without it, a permission failure below
    // would be indistinguishable from an unauthenticated client.
    const { data: me } = await creator.auth.getUser();
    expect(me.user?.id, 'control: the creator must hold a real session').toBe(creatorId);

    const code = roomCode();
    const { data, error } = await creator.rpc('create_transcribe_room', {
      p_code: code,
      p_display_name: 'P1275 Creator',
      p_session_id: creatorSessionId,
      p_event_id: null,
    });

    expect(error, `creating a room must succeed: ${error?.message}`).toBeNull();
    const row = ((data ?? []) as Record<string, string>[])[0];
    expect(row, 'the call must return the room it created').toBeTruthy();
    createdRoomIds.push(row!.room_id!);

    expect(row!.room_code).toBe(code);
    expect(row!.room_ended_at, 'a new room must be live').toBeNull();
    expect(row!.member_session_id).toBe(creatorSessionId);

    // Both halves are on the server, not just in the function's return value.
    const { data: member } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('profile_id, display_name, room_id')
      .eq('room_id', row!.room_id!)
      .single();
    expect(member?.profile_id, 'the creator must be the member — derived from auth.uid()').toBe(creatorId);
    expect(member?.display_name).toBe('P1275 Creator');
  });

  test('the creator can read back the room they just created', async () => {
    // This is the whole point of the bug: P1207's member-scoped SELECT policy is unchanged,
    // so the read only works because the membership row now exists by the time we look.
    const code = roomCode();
    const { data } = await creator.rpc('create_transcribe_room', {
      p_code: code, p_display_name: 'P1275 Creator', p_session_id: creatorSessionId, p_event_id: null,
    });
    const roomId = ((data ?? []) as Record<string, string>[])[0]!.room_id!;
    createdRoomIds.push(roomId);

    const readBack = await creator.from('transcribe_rooms').select('id, code').eq('id', roomId).single();
    expect(readBack.error, `the creator must be able to read their own room: ${readBack.error?.message}`).toBeNull();
    expect(readBack.data?.code).toBe(code);
  });

  test('a duplicate code still raises 23505 so the client retry loop keeps working', async () => {
    const code = roomCode();
    const first = await creator.rpc('create_transcribe_room', {
      p_code: code, p_display_name: 'P1275 Creator', p_session_id: creatorSessionId, p_event_id: null,
    });
    expect(first.error, `first create must succeed: ${first.error?.message}`).toBeNull();
    createdRoomIds.push(((first.data ?? []) as Record<string, string>[])[0]!.room_id!);

    const second = await creator.rpc('create_transcribe_room', {
      p_code: code, p_display_name: 'P1275 Creator', p_session_id: creatorSessionId, p_event_id: null,
    });
    expect(second.error?.code,
      'a code collision must surface as 23505, not a generic failure — the client retries on it',
    ).toBe('23505');
  });

  test('a session belonging to someone else is refused', async () => {
    // The policy this function replaces checked only profile_id = auth.uid() and never
    // looked at session_id, so a caller could attach another user's recording to their
    // own seat. Bypassing RLS means inheriting the duty to be stricter, not looser.
    const { error } = await creator.rpc('create_transcribe_room', {
      p_code: roomCode(),
      p_display_name: 'P1275 Creator',
      p_session_id: strangerSessionId,
      p_event_id: null,
    });
    expect(error, 'attaching another user\'s clarity_session must be refused').not.toBeNull();

    const { count } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', strangerSessionId);
    expect(count ?? 0, 'and no membership row may be left behind').toBe(0);
  });

  test('a refused call creates nothing at all', async () => {
    const code = roomCode();
    const { error } = await creator.rpc('create_transcribe_room', {
      p_code: code, p_display_name: 'P1275 Creator', p_session_id: strangerSessionId, p_event_id: null,
    });
    expect(error, 'control: this call must fail, or the assertion below proves nothing').not.toBeNull();

    const { data } = await supabaseAdmin.from('transcribe_rooms').select('id').eq('code', code);
    expect(data ?? [], 'a refused create must leave no room behind').toEqual([]);

    // WHAT THIS DOES **NOT** PROVE — stated so a green run is not read as more than it is.
    // Every guard in the function runs BEFORE the room INSERT, so no reachable input
    // fails between the two INSERTs; this test would pass against a non-atomic
    // implementation too. Rollback-on-partial-failure rests on the function being a single
    // plpgsql transaction, which is a property of the language, not something asserted
    // here. Constructing a post-INSERT failure would need an auth user with no profiles
    // row, and clarity_sessions.creator_profile_id FKs profiles — so the fixture
    // structurally cannot emit one.
  });

  test('the creator can end the room they created', async () => {
    const code = roomCode();
    const { data } = await creator.rpc('create_transcribe_room', {
      p_code: code, p_display_name: 'P1275 Creator', p_session_id: creatorSessionId, p_event_id: null,
    });
    const roomId = ((data ?? []) as Record<string, string>[])[0]!.room_id!;
    createdRoomIds.push(roomId);

    // "room members can end the room" is member-scoped UPDATE. A room created without its
    // membership row could never be ended by anyone — this asserts the capability, not just
    // the row.
    const ended = await creator.from('transcribe_rooms')
      .update({ ended_at: new Date().toISOString() }).eq('id', roomId);
    expect(ended.error, `the creator must be able to end their own room: ${ended.error?.message}`).toBeNull();

    const { data: after } = await supabaseAdmin
      .from('transcribe_rooms').select('ended_at').eq('id', roomId).single();
    expect(after?.ended_at, 'and the end must persist').not.toBeNull();
  });

  test('a malformed room code is refused rather than stored', async () => {
    for (const bad of ['', 'abc', 'AAAAAAA', 'AAAA0A', 'AAAA A']) {
      const { error } = await creator.rpc('create_transcribe_room', {
        p_code: bad, p_display_name: 'P1275 Creator', p_session_id: creatorSessionId, p_event_id: null,
      });
      expect(error, `code "${bad}" must be refused`).not.toBeNull();
    }
  });

  test('anon is not merely rejected — it has no EXECUTE grant at all', async () => {
    // REVOKE ... FROM PUBLIC does not remove a role-direct grant (P1065, hit again in
    // P1236), so this must assert the effect rather than the GRANT statement.
    //
    // Asserting only "an error occurred" would be VACUOUS: with the grant present, anon
    // still fails the function's own auth.uid() check and still raises 42501. The two
    // cases are told apart by the MESSAGE, not the code —
    //   grant absent : "permission denied for function create_transcribe_room"
    //   grant present: "not authenticated"
    // so the message is what this asserts.
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc('create_transcribe_room', {
      p_code: roomCode(), p_display_name: 'Anon', p_session_id: creatorSessionId, p_event_id: null,
    });
    expect(error?.message ?? '',
      'anon must be refused at the grant, before the function body runs',
    ).toMatch(/permission denied for function/i);

    // CONTROL: the same anon client against a function anon IS deliberately granted
    // (get_session_by_code: granted TO anon in 20260817140000_p1057 and allowlisted).
    // Without this, a probe that cannot reach ANY function would produce the identical
    // verdict above and the assertion would prove nothing. P1303: this control previously
    // used P1207's room-code lookup, whose anon grant was never intended and is revoked.
    const granted = await anon.rpc('get_session_by_code', { p_code: 'ZZZZZZ' });
    expect(granted.error,
      'control: anon must still reach a function it is granted, or this probe is blind',
    ).toBeNull();
  });

  test('the direct table INSERT path is closed — the function is the only way in', async () => {
    // The expand half made a member-less room unreachable THROUGH the function. It did not
    // make one unrepresentable: P1149's INSERT policy was `WITH CHECK (true)`, and RLS is
    // enforced at PostgREST rather than by the JS client, so "no app code does this any
    // more" was never a control. Found in review of the expand half, closed by
    // 20260908210100_p1275_b_close_direct_room_insert.sql.
    const direct = await creator.from('transcribe_rooms').insert({ code: roomCode() });
    expect(direct.error, 'a direct room insert must be refused').not.toBeNull();
    expect(direct.error?.code, 'and refused by RLS specifically').toBe('42501');

    // CONTROL: the same client, same table, an operation it IS allowed — otherwise a
    // client that simply cannot reach the table at all would produce the identical verdict.
    const { data } = await creator.rpc('create_transcribe_room', {
      p_code: roomCode(), p_display_name: 'P1275 Creator', p_session_id: creatorSessionId, p_event_id: null,
    });
    const roomId = ((data ?? []) as Record<string, string>[])[0]?.room_id;
    expect(roomId, 'control: the same caller must still create rooms through the function').toBeTruthy();
    createdRoomIds.push(roomId!);
  });

  test('room-code enumeration stays closed', async () => {
    // P1207's guarantee, re-asserted because this migration touches the same table's
    // write path. If a fix for this bug ever loosens the SELECT policy, this goes red.
    const strangerEmail = generateTestEmail();
    const stranger = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    await supabaseAdmin.auth.admin.updateUserById(strangerId, { email: strangerEmail, password: TEST_PASSWORD });
    const signIn = await stranger.auth.signInWithPassword({ email: strangerEmail, password: TEST_PASSWORD });
    expect(signIn.error, `control: the stranger must be signed in: ${signIn.error?.message}`).toBeNull();

    const sweep = await stranger.from('transcribe_rooms').select('code').limit(1000);
    expect(sweep.data ?? [], 'a signed-in non-member must still see no room codes').toEqual([]);
  });
});
