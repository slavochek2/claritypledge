/**
 * @file p1307-end-capture-rpc.spec.ts
 * @description P270 canary for `end_transcribe_room_capture` (Architecture Decision 1) and
 * the companion removal of `transcribe_rooms`' "room members can end the room" UPDATE
 * policy (Security Review, Parent verification 1 — required in the same migration).
 *
 * Written before the migration exists (test-first). `end_transcribe_room_capture` derives
 * the caller's own member row from (p_room_id, auth.uid()) — no member-id argument, so
 * "one member cannot end another's capture" is a structural property of the signature, not
 * a check the function could get wrong. This still exercises it, per epistemic.md gate 7:
 * a function that accepts the identity it acts on is an impersonation primitive by shape,
 * and the point of this RPC is that it is NOT that shape.
 *
 * The room-UPDATE-policy half supersedes the "control: a room member can end the room"
 * test in 20260824000000_p1149_room_end_policy_column_guard.spec.ts, which is updated
 * separately (see that file's own header note) rather than duplicated wholesale here.
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
  return `P1307E${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

test.describe('P1307: end_transcribe_room_capture', () => {
  let alice: TestUser;
  let bob: TestUser;
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

  /** A room with two consented members: alice and bob. */
  async function seedRoomWithTwoMembers() {
    const code = makeRoomCode();
    const { data: room, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms')
      .insert({ code })
      .select('id')
      .single();
    expect(roomError, `seed room failed: ${roomError?.message}`).toBeNull();
    createdRoomIds.push(room!.id);

    const memberIds: Record<'alice' | 'bob', string> = { alice: '', bob: '' };
    for (const [key, u] of [['alice', alice], ['bob', bob]] as const) {
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({ code: `${code}-${key}`, creator_name: `P1307 ${key}`, creator_profile_id: u.user.id })
        .select('id')
        .single();
      expect(sessionError, `seed session failed: ${sessionError?.message}`).toBeNull();
      createdSessionIds.push(session!.id);

      const { data: member, error: memberError } = await supabaseAdmin
        .from('transcribe_room_members')
        .insert({
          room_id: room!.id, profile_id: u.user.id, display_name: `P1307 ${key}`,
          session_id: session!.id, consent_given_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      expect(memberError, `seed member failed: ${memberError?.message}`).toBeNull();
      memberIds[key] = member!.id;
    }

    return { roomId: room!.id, memberIds };
  }

  async function memberRow(memberId: string) {
    const { data, error } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('id, capture_ended_at')
      .eq('id', memberId)
      .single();
    expect(error, `readback failed: ${error?.message}`).toBeNull();
    return data!;
  }

  test.beforeAll(async () => {
    alice = await createTestUser({ name: 'P1307 Alice' });
    bob = await createTestUser({ name: 'P1307 Bob' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (alice?.user?.id) await deleteTestUser(alice.user.id);
    if (bob?.user?.id) await deleteTestUser(bob.user.id);
  });

  test('the caller ends only their own capture', async () => {
    const { roomId, memberIds } = await seedRoomWithTwoMembers();
    const client = await clientFor(alice);

    const { error } = await client.rpc('end_transcribe_room_capture', { p_room_id: roomId });
    expect(error, `end must succeed: ${error?.message}`).toBeNull();

    expect((await memberRow(memberIds.alice)).capture_ended_at, 'the caller\'s own row must be ended').not.toBeNull();
    expect((await memberRow(memberIds.bob)).capture_ended_at, 'the OTHER member\'s row must be untouched').toBeNull();
  });

  test('is idempotent and first-wins — a second call does not restamp the time', async () => {
    const { roomId, memberIds } = await seedRoomWithTwoMembers();
    const client = await clientFor(alice);

    await client.rpc('end_transcribe_room_capture', { p_room_id: roomId });
    const first = (await memberRow(memberIds.alice)).capture_ended_at;

    await new Promise((r) => setTimeout(r, 1100)); // ensure a distinguishable now() if restamped
    await client.rpc('end_transcribe_room_capture', { p_room_id: roomId });
    const second = (await memberRow(memberIds.alice)).capture_ended_at;

    expect(second, 'a second End must not move the timestamp — first-wins, like consent_given_at').toBe(first);
  });

  test('the function signature accepts no member-id argument — one cannot be aimed at another member', async () => {
    const { roomId } = await seedRoomWithTwoMembers();
    const client = await clientFor(alice);

    // If the function DID accept a member id, this call would either error (extra arg) or
    // (worse) silently ignore it — either way, the absence of a working "aim at someone
    // else" call is what this test is checking for by construction: PostgREST rejects an
    // unknown named parameter as a function-not-found (42883) rather than executing it.
    const { error } = await client.rpc('end_transcribe_room_capture', {
      p_room_id: roomId,
      p_member_id: '00000000-0000-4000-8000-000000000000',
    } as unknown as { p_room_id: string });
    expect(error, 'a p_member_id argument must not be an accepted overload').not.toBeNull();
  });

  test('a caller with no membership in the room ends nothing and raises no false success', async () => {
    const code = makeRoomCode();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code }).select('id').single();
    createdRoomIds.push(room!.id);
    const client = await clientFor(bob); // bob never joined this room

    const { error } = await client.rpc('end_transcribe_room_capture', { p_room_id: room!.id });
    // Whether this is a no-op success (0 rows affected) or a raised error is an
    // implementation choice /architect did not pin — either is acceptable, but a false
    // "you ended a capture" without a row is not. Assert the observable: no member row was
    // created or altered for bob in this room.
    const { data: rows } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('id')
      .eq('room_id', room!.id)
      .eq('profile_id', bob.user.id);
    expect(rows ?? [], 'no member row may spring into existence from an end-capture call').toEqual([]);
    void error; // documented as either outcome; not asserted directly
  });
});

test.describe('P1307: "room members can end the room" UPDATE policy is gone', () => {
  let member: TestUser;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  async function seedRoomWithMember() {
    const code = makeRoomCode();
    const { data: room, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms')
      .insert({ code })
      .select('id, ended_at')
      .single();
    expect(roomError, `seed room failed: ${roomError?.message}`).toBeNull();
    createdRoomIds.push(room!.id);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `${code}-S`, creator_name: 'P1307 Member', creator_profile_id: member.user.id })
      .select('id')
      .single();
    expect(sessionError, `seed session failed: ${sessionError?.message}`).toBeNull();
    createdSessionIds.push(session!.id);

    const { error: memberError } = await supabaseAdmin
      .from('transcribe_room_members')
      .insert({ room_id: room!.id, profile_id: member.user.id, display_name: 'P1307 Member', session_id: session!.id });
    expect(memberError, `seed member failed: ${memberError?.message}`).toBeNull();

    return room!;
  }

  test.beforeAll(async () => {
    member = await createTestUser({ name: 'P1307 Room Guard Member' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (member?.user?.id) await deleteTestUser(member.user.id);
  });

  test('a room member cannot SET ended_at directly', async () => {
    const room = await seedRoomWithMember();
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: member.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    await client.from('transcribe_rooms').update({ ended_at: new Date().toISOString() }).eq('id', room.id);

    const { data: after } = await supabaseAdmin.from('transcribe_rooms').select('ended_at').eq('id', room.id).single();
    expect(after?.ended_at, 'a client UPDATE must not be able to end a room — only the sweep may').toBeNull();
  });

  test('a room member cannot CLEAR an already-set ended_at', async () => {
    const room = await seedRoomWithMember();
    await supabaseAdmin.from('transcribe_rooms').update({ ended_at: new Date().toISOString() }).eq('id', room.id);

    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({ email: member.email, password: TEST_PASSWORD });
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    await client.from('transcribe_rooms').update({ ended_at: null }).eq('id', room.id);

    const { data: after } = await supabaseAdmin.from('transcribe_rooms').select('ended_at').eq('id', room.id).single();
    expect(after?.ended_at, 'a client must not be able to un-end a room either').not.toBeNull();
  });
});
