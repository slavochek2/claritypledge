/**
 * @file p1529-reserve-after-gap.spec.ts
 * @description P270 canary for 20261114090200 (`reserve_room_chunk_number_after_gap`, INBOX-338): one call reserves the
 * numbers of chunks shed or dropped before upload (left unused, so the archive keeps the hole) and the chunk's own number,
 * instead of one RPC per hole (metered-services rule 1). Same caller derivation as reserve_room_chunk_number: the member row
 * comes from (p_room_id, auth.uid()), never an argument. TEST only.
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

const roomCode = () => `P1529G${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

test.describe('P1529 INBOX-338: reserve_room_chunk_number_after_gap', () => {
  let alice: TestUser;
  let bob: TestUser;
  const rooms: string[] = [];
  const sessions: string[] = [];

  async function clientFor(u: TestUser): Promise<SupabaseClient> {
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    expect(error).toBeNull();
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();
    return client;
  }

  async function roomWith(u: TestUser, tag: string): Promise<string> {
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code: roomCode() }).select('id').single();
    rooms.push(room!.id);
    const { data: session } = await supabaseAdmin.from('clarity_sessions')
      .insert({ code: `P1529GAP-${tag}-${Math.random().toString(36).slice(2, 8)}`, creator_name: tag, creator_profile_id: u.user.id })
      .select('id').single();
    sessions.push(session!.id);
    const { error } = await supabaseAdmin.from('transcribe_room_members')
      .insert({ room_id: room!.id, profile_id: u.user.id, display_name: tag, session_id: session!.id, consent_given_at: new Date().toISOString() });
    expect(error, `seed member: ${error?.message}`).toBeNull();
    return room!.id;
  }

  test.beforeAll(async () => {
    alice = await createTestUser({ name: 'P1529 Gap Alice' });
    bob = await createTestUser({ name: 'P1529 Gap Bob' });
  });

  test.afterAll(async () => {
    if (rooms.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', rooms);
    if (sessions.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessions);
    for (const u of [alice, bob]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('skips the given count in one call and returns the next number; the plain reservation continues after it', async () => {
    const room = await roomWith(alice, 'alice');
    const c = await clientFor(alice);
    expect((await c.rpc('reserve_room_chunk_number', { p_room_id: room })).data).toBe(0);
    const gap = await c.rpc('reserve_room_chunk_number_after_gap', { p_room_id: room, p_skip: 2 });
    expect(gap.error, gap.error?.message).toBeNull();
    expect(gap.data, '1 and 2 left unused (the hole), 3 is this chunk').toBe(3);
    expect((await c.rpc('reserve_room_chunk_number', { p_room_id: room })).data).toBe(4);
    const none = await c.rpc('reserve_room_chunk_number_after_gap', { p_room_id: room, p_skip: 0 });
    expect(none.data, 'a skip of 0 is a plain reservation').toBe(5);
  });

  test('refuses a negative or absurd skip, a non-member and an anonymous caller, and writes nothing then', async () => {
    const room = await roomWith(alice, 'alice2');
    const c = await clientFor(alice);
    for (const bad of [-1, 10001]) {
      const r = await c.rpc('reserve_room_chunk_number_after_gap', { p_room_id: room, p_skip: bad });
      expect(r.error?.code, `skip ${bad}`).toBe('22023');
    }
    const outsider = await clientFor(bob);
    expect((await outsider.rpc('reserve_room_chunk_number_after_gap', { p_room_id: room, p_skip: 1 })).error?.code).toBe('42501');
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    expect((await anon.rpc('reserve_room_chunk_number_after_gap', { p_room_id: room, p_skip: 1 })).error).not.toBeNull();
    const { data: m } = await supabaseAdmin.from('transcribe_room_members').select('next_chunk_seq').eq('room_id', room).single();
    expect(m!.next_chunk_seq, 'no refused call moved the counter').toBe(0);
  });
});
