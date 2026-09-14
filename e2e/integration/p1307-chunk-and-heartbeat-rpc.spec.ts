/**
 * @file p1307-chunk-and-heartbeat-rpc.spec.ts
 * @description P270 canary for Decision 6 (`reserve_room_chunk_number`) and the
 * `touch_transcribe_room_capture` RPC from Decision 2's correction (the paused-member
 * heartbeat that stamps `last_seen_at` without audio or a slice).
 *
 * Both functions derive the caller's member row from (p_room_id, auth.uid()) — no member-id
 * argument, same shape as end_transcribe_room_capture, and the same reason: neither may be
 * aimable at someone else's row.
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

function roomCode() {
  return `P1307C${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

test.describe('P1307: reserve_room_chunk_number', () => {
  let alice: TestUser;
  let bob: TestUser;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  async function clientFor(u: TestUser): Promise<SupabaseClient> {
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    expect(error).toBeNull();
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();
    return client;
  }

  async function seedMember(u: TestUser, roomId: string, tag: string) {
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `P1307CHK-${tag}-${Date.now()}`, creator_name: tag, creator_profile_id: u.user.id })
      .select('id').single();
    createdSessionIds.push(session!.id);
    const { data: member, error } = await supabaseAdmin
      .from('transcribe_room_members')
      .insert({ room_id: roomId, profile_id: u.user.id, display_name: tag, session_id: session!.id, consent_given_at: new Date().toISOString() })
      .select('id, next_chunk_seq').single();
    expect(error, `seed member failed: ${error?.message}`).toBeNull();
    return member!.id as string;
  }

  test.beforeAll(async () => {
    alice = await createTestUser({ name: 'P1307 Chunk Alice' });
    bob = await createTestUser({ name: 'P1307 Chunk Bob' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    for (const u of [alice, bob]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('returns monotonically increasing numbers starting at 0, never repeating', async () => {
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code: roomCode() }).select('id').single();
    createdRoomIds.push(room!.id);
    await seedMember(alice, room!.id, 'alice');
    const client = await clientFor(alice);

    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { data, error } = await client.rpc('reserve_room_chunk_number', { p_room_id: room!.id });
      expect(error, `reserve call ${i} failed: ${error?.message}`).toBeNull();
      seen.push(data as unknown as number);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });

  test('survives a simulated remount — the counter is server state, not reset to 0 by a new call sequence', async () => {
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code: roomCode() }).select('id').single();
    createdRoomIds.push(room!.id);
    await seedMember(alice, room!.id, 'alice');
    const client = await clientFor(alice);

    await client.rpc('reserve_room_chunk_number', { p_room_id: room!.id });
    await client.rpc('reserve_room_chunk_number', { p_room_id: room!.id });
    // A NEW client instance simulates a page reload / remount — the whole point of moving
    // this off the client-local `chunkNumberRef.current` (transcribe-room-page.tsx:180).
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({ email: alice.email, password: TEST_PASSWORD });
    const reloadedClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await reloadedClient.rpc('reserve_room_chunk_number', { p_room_id: room!.id });
    expect(error).toBeNull();
    expect(data, 'the third reservation, from a fresh client, must be 2 — not restarted at 0').toBe(2);
  });

  test('is caller-scoped — two members in the same room each start their own sequence at 0', async () => {
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code: roomCode() }).select('id').single();
    createdRoomIds.push(room!.id);
    await seedMember(alice, room!.id, 'alice');
    await seedMember(bob, room!.id, 'bob');
    const aliceClient = await clientFor(alice);
    const bobClient = await clientFor(bob);

    const a0 = await aliceClient.rpc('reserve_room_chunk_number', { p_room_id: room!.id });
    const a1 = await aliceClient.rpc('reserve_room_chunk_number', { p_room_id: room!.id });
    const b0 = await bobClient.rpc('reserve_room_chunk_number', { p_room_id: room!.id });

    expect(a0.data).toBe(0);
    expect(a1.data).toBe(1);
    expect(b0.data, 'bob\'s own sequence must not be shifted by alice\'s reservations').toBe(0);
  });

  test('a caller with no membership in the room gets no sequence at all', async () => {
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code: roomCode() }).select('id').single();
    createdRoomIds.push(room!.id);
    const client = await clientFor(bob); // bob never joined
    const { error } = await client.rpc('reserve_room_chunk_number', { p_room_id: room!.id });
    expect(error, 'a non-member must be refused a chunk sequence').not.toBeNull();
  });
});

test.describe('P1307: touch_transcribe_room_capture', () => {
  let alice: TestUser;
  let bob: TestUser;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  test.beforeAll(async () => {
    alice = await createTestUser({ name: 'P1307 Touch Alice' });
    bob = await createTestUser({ name: 'P1307 Touch Bob' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    for (const u of [alice, bob]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('stamps last_seen_at for the caller\'s own row only, and carries no audio/payload', async () => {
    const code = roomCode();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code }).select('id').single();
    createdRoomIds.push(room!.id);

    const staleTimestamp = new Date(Date.now() - 20 * 60_000).toISOString();
    const memberIds: Record<'alice' | 'bob', string> = { alice: '', bob: '' };
    for (const [key, u] of [['alice', alice], ['bob', bob]] as const) {
      const { data: session } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({ code: `P1307TOUCH-${key}-${Date.now()}`, creator_name: key, creator_profile_id: u.user.id })
        .select('id').single();
      createdSessionIds.push(session!.id);
      const { data: member } = await supabaseAdmin
        .from('transcribe_room_members')
        .insert({
          room_id: room!.id, profile_id: u.user.id, display_name: key, session_id: session!.id,
          consent_given_at: new Date().toISOString(), last_seen_at: staleTimestamp,
        })
        .select('id').single();
      memberIds[key] = member!.id;
    }

    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({ email: alice.email, password: TEST_PASSWORD });
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const before = Date.now();
    const { error } = await client.rpc('touch_transcribe_room_capture', { p_room_id: room!.id });
    expect(error, `touch must succeed: ${error?.message}`).toBeNull();

    const aliceRow = await supabaseAdmin.from('transcribe_room_members').select('last_seen_at').eq('id', memberIds.alice).single();
    const bobRow = await supabaseAdmin.from('transcribe_room_members').select('last_seen_at').eq('id', memberIds.bob).single();

    expect(new Date(aliceRow.data!.last_seen_at!).getTime(), 'the caller\'s last_seen_at must advance').toBeGreaterThanOrEqual(before - 2000);
    // Compared as instants: PostgREST returns timestamptz as "…+00:00", while the fixture
    // wrote an ISO "…Z" string — the same moment, two spellings.
    expect(
      new Date(bobRow.data!.last_seen_at!).getTime(),
      'the other member\'s last_seen_at must be untouched by alice\'s heartbeat',
    ).toBe(new Date(staleTimestamp).getTime());
  });
});
