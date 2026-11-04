/**
 * @file p1307-join-room-rejoin.spec.ts
 * @description P270 canary for 20260914120400_p1307_join_room_starts_new_capture.sql:
 * `join_transcribe_room` (the /transcribe/:code path) gets the same Decision 1 correction
 * `enter_transcribe_room` got — a re-join clears capture_ended_at, stamps last_seen_at, and
 * never resets joined_at. Found by the /dev code review; before this migration the re-join
 * left the member "ended" on the server while their device captured again.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

test.describe('P1307: join_transcribe_room — a re-join starts a new capture', () => {
  let alice: TestUser;
  let other: TestUser;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  test.beforeAll(async () => {
    alice = await createTestUser({ name: 'P1307 Join Rejoin Alice' });
    other = await createTestUser({ name: 'P1307 Join Rejoin Other' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    for (const u of [alice, other]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  async function newSession(tag: string) {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `P1307JR-${tag}-${Date.now()}`, creator_name: 'P1307 Join Rejoin Alice', creator_profile_id: alice.user.id })
      .select('id')
      .single();
    expect(error, `fixture: session insert failed: ${error?.message}`).toBeNull();
    createdSessionIds.push(data!.id);
    return data!.id as string;
  }

  test('a first join stamps last_seen_at; ending then re-joining clears capture_ended_at and keeps joined_at', async () => {
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code: roomCode() }).select('id').single();
    createdRoomIds.push(room!.id);
    // P1604 rule 3: the last Stop closes a room at once (no grace), so a second member keeps this room open while Alice's
    // capture ends and she re-joins. Before P1604 nothing closed a room on a Stop, so a lone member could re-join.
    const { data: otherSession } = await supabaseAdmin.from('clarity_sessions')
      .insert({ code: `P1307JR-o-${Date.now()}`, creator_name: 'other', creator_profile_id: other.user.id }).select('id').single();
    createdSessionIds.push(otherSession!.id);
    await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: room!.id, profile_id: other.user.id, display_name: 'other', session_id: otherSession!.id,
      consent_given_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    });

    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({ email: alice.email, password: TEST_PASSWORD });
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await supabaseAdmin.auth.signOut();

    const first = await client.rpc('join_transcribe_room', {
      p_room_id: room!.id, p_display_name: 'Alice', p_session_id: await newSession('1'), p_consent: true,
    });
    expect(first.error, `first join must succeed: ${first.error?.message}`).toBeNull();
    const firstRow = (first.data as Array<{ id: string; joined_at: string }>)[0]!;

    const afterFirst = await supabaseAdmin
      .from('transcribe_room_members').select('last_seen_at').eq('id', firstRow.id).single();
    expect(afterFirst.data?.last_seen_at, 'a join by code must stamp last_seen_at, or the sweep creates no job for this member').not.toBeNull();

    await client.rpc('end_transcribe_room_capture', { p_room_id: room!.id });
    const ended = await supabaseAdmin
      .from('transcribe_room_members').select('capture_ended_at').eq('id', firstRow.id).single();
    expect(ended.data?.capture_ended_at, 'control: capture must actually be ended before the re-join').not.toBeNull();

    const second = await client.rpc('join_transcribe_room', {
      p_room_id: room!.id, p_display_name: 'Alice', p_session_id: await newSession('2'), p_consent: true,
    });
    expect(second.error, `re-join must succeed: ${second.error?.message}`).toBeNull();
    const secondRow = (second.data as Array<{ id: string; joined_at: string }>)[0]!;

    expect(secondRow.id, 're-join must upsert the SAME member row').toBe(firstRow.id);
    expect(new Date(secondRow.joined_at).getTime(), 'joined_at must not reset — the 3 hours run from the first join')
      .toBe(new Date(firstRow.joined_at).getTime());

    const after = await supabaseAdmin
      .from('transcribe_room_members').select('capture_ended_at').eq('id', firstRow.id).single();
    expect(after.data?.capture_ended_at, 're-joining an open room by code must clear capture_ended_at').toBeNull();
  });
});
