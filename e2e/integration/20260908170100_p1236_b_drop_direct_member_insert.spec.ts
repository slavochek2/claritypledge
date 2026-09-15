/**
 * @file 20260908170100_p1236_b_drop_direct_member_insert.spec.ts
 * @description P270 canary for 20260908170100_p1236_b_drop_direct_member_insert.sql (P1315).
 *
 * P1236 Decision 5: a member row is written only by an RPC that records consent. This suite pins
 * that against the real test DB:
 *   - REFUSAL: a signed-in user's direct INSERT of their own seat is rejected, and an admin
 *     readback confirms nothing was written (a refusal that had already written would look the same).
 *   - CONTROL: the consented RPC join still produces a member row with a consent timestamp, and the
 *     service role can still write — the change must not have broken the room.
 *
 * Limit, stated so it is not inferred: this is a regression guard. The migration-history check is
 * src/tests/p1315-reproduce.test.ts.
 *
 * Two-client pattern from e2e/integration/20260908170000_p1236_join_rpc_consent.spec.ts.
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
  return `P1315${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

test.describe('P1315: transcribe_room_members has no client INSERT path', () => {
  let member: TestUser;
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

  async function seedRoomAndSession(owner: TestUser) {
    const code = makeRoomCode();
    const { data: room, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms').insert({ code }).select('id').single();
    expect(roomError, `seed room failed: ${roomError?.message}`).toBeNull();
    createdRoomIds.push(room!.id);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `${code}-S`, creator_name: 'P1315 Speaker', creator_profile_id: owner.user.id })
      .select('id').single();
    expect(sessionError, `seed session failed: ${sessionError?.message}`).toBeNull();
    createdSessionIds.push(session!.id);

    return { roomId: room!.id as string, sessionId: session!.id as string };
  }

  async function membersOf(roomId: string) {
    const { data, error } = await supabaseAdmin
      .from('transcribe_room_members').select('id, profile_id, consent_given_at').eq('room_id', roomId);
    expect(error, `readback failed: ${error?.message}`).toBeNull();
    return data ?? [];
  }

  test.beforeAll(async () => {
    member = await createTestUser({ name: 'P1315 Member' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length > 0) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length > 0) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (member?.user?.id) await deleteTestUser(member.user.id);
  });

  test('a signed-in user cannot insert their own member row directly', async () => {
    const { roomId, sessionId } = await seedRoomAndSession(member);
    const client = await clientFor(member);

    const { error } = await client.from('transcribe_room_members').insert({
      room_id: roomId, profile_id: member.user.id, display_name: 'P1315 Member', session_id: sessionId,
    });
    expect(error, 'a direct INSERT must be refused — membership is RPC-only').not.toBeNull();
    expect(await membersOf(roomId)).toHaveLength(0);
  });

  test('control: the service role can still seed a member row (the readback is not blind)', async () => {
    const { roomId, sessionId } = await seedRoomAndSession(member);
    const { error } = await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: roomId, profile_id: member.user.id, display_name: 'P1315 Member', session_id: sessionId,
    });
    expect(error, `admin seed failed: ${error?.message}`).toBeNull();
    expect(await membersOf(roomId)).toHaveLength(1);
  });

  test('control: a consented RPC join still creates the member row with consent recorded', async () => {
    const { roomId, sessionId } = await seedRoomAndSession(member);
    const client = await clientFor(member);

    const { error } = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1315 Member', p_session_id: sessionId, p_consent: true,
    });
    expect(error, `join failed: ${error?.message}`).toBeNull();

    const rows = await membersOf(roomId);
    expect(rows).toHaveLength(1);
    expect(rows[0].profile_id).toBe(member.user.id);
    expect(rows[0].consent_given_at).not.toBeNull();
  });
});
