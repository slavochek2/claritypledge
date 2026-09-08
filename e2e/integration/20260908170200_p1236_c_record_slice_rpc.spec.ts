/**
 * @file 20260908170200_p1236_c_record_slice_rpc.spec.ts
 * @description P270 canary for 20260908170200_p1236_c_record_slice_rpc.sql.
 *
 * `record_transcribe_slice()` writes an attributed transcript row with RLS bypassed and
 * advances that member's spend counter in the same transaction. Two properties are worth a
 * live test rather than a code read, because both live entirely in the database and both
 * are one careless GRANT away from being untrue:
 *
 *   1. **A client cannot call it.** It is granted to service_role only. If it were ever
 *      reachable by `authenticated`, a member could write transcript rows attributed to
 *      themselves with no consent check, no ceiling, and no server-derived member_id —
 *      undoing Decisions 2, 5 and 6 in one grant.
 *   2. **The row and the counter move together.** A counter that can advance without a row,
 *      or a row without a counter, is a spend control that does not control spend.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

test.describe('P1236: record_transcribe_slice — service-role only, and atomic', () => {
  let alice: TestUser;
  let roomId: string;
  let memberId: string;
  let sessionId: string;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  test.beforeAll(async () => {
    alice = await createTestUser({ name: 'P1236 RPC Alice' });
    const code = `P1236${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const { data: room } = await supabaseAdmin
      .from('transcribe_rooms').insert({ code }).select('id').single();
    roomId = room!.id;
    createdRoomIds.push(roomId);

    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `${code}-S`, creator_name: 'P1236 RPC', creator_profile_id: alice.user.id })
      .select('id').single();
    sessionId = session!.id;
    createdSessionIds.push(sessionId);

    const { data: member, error } = await supabaseAdmin
      .from('transcribe_room_members')
      .insert({ room_id: roomId, profile_id: alice.user.id, display_name: 'P1236 RPC Alice', session_id: sessionId, consent_given_at: new Date().toISOString() })
      .select('id').single();
    expect(error, `seed member failed: ${error?.message}`).toBeNull();
    memberId = member!.id;
  });

  test.afterAll(async () => {
    if (createdRoomIds.length > 0) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length > 0) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (alice?.user?.id) await deleteTestUser(alice.user.id);
  });

  async function sliceCount(): Promise<number> {
    const { data } = await supabaseAdmin
      .from('transcribe_room_members').select('slice_count').eq('id', memberId).single();
    return data!.slice_count as number;
  }

  test('an authenticated client cannot execute it', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: alice.email, password: TEST_PASSWORD,
    });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await supabaseAdmin.auth.signOut();

    const before = await sliceCount();
    const { error } = await userClient.rpc('record_transcribe_slice', {
      p_room_id: roomId, p_member_id: memberId, p_text: 'injected by a client',
    });
    expect(error).not.toBeNull();
    expect(await sliceCount()).toBe(before);
  });

  test('service role writes the row and advances the counter together', async () => {
    const before = await sliceCount();
    const { data: id, error } = await supabaseAdmin.rpc('record_transcribe_slice', {
      p_room_id: roomId, p_member_id: memberId, p_text: '  hello from the slice  ',
    });
    expect(error, `rpc failed: ${error?.message}`).toBeNull();
    expect(await sliceCount()).toBe(before + 1);

    const { data: row } = await supabaseAdmin
      .from('transcribe_messages').select('text, spoken_at, is_final, member_id').eq('id', id as string).single();
    expect(row!.text).toBe('hello from the slice');
    expect(row!.member_id).toBe(memberId);
    expect(row!.is_final).toBe(true);
    // spoken_at is the column DEFAULT — never a parameter, because it is the de-dup
    // ordering key (Decision 4).
    expect(row!.spoken_at).not.toBeNull();
  });

  test('a member/room mismatch writes nothing and leaves the counter alone', async () => {
    const { data: otherRoom } = await supabaseAdmin
      .from('transcribe_rooms').insert({ code: `P1236${Math.random().toString(36).slice(2, 6).toUpperCase()}` }).select('id').single();
    createdRoomIds.push(otherRoom!.id);

    const before = await sliceCount();
    const { error } = await supabaseAdmin.rpc('record_transcribe_slice', {
      p_room_id: otherRoom!.id, p_member_id: memberId, p_text: 'wrong room',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('member does not belong to this room');
    expect(await sliceCount()).toBe(before);
  });

  test('a rejected insert rolls the counter back — the two really are one transaction', async () => {
    // Empty text fails transcribe_messages' CHECK. The counter is bumped BEFORE the insert
    // in the function body, so if this were two statements instead of one transaction the
    // count would be left permanently ahead of the rows it is supposed to be counting —
    // and a spend ceiling that over- or under-counts is not a ceiling.
    const before = await sliceCount();
    const { error } = await supabaseAdmin.rpc('record_transcribe_slice', {
      p_room_id: roomId, p_member_id: memberId, p_text: '   ',
    });
    expect(error).not.toBeNull();
    expect(await sliceCount()).toBe(before);
  });
});
