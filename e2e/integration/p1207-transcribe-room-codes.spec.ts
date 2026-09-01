/**
 * P1207 F2 — transcribe_rooms room-code enumeration.
 *
 * `code` is the join credential: getRoomByCode() resolves a room from it and that is the whole
 * join path. The SELECT policy was `TO authenticated USING (true)`, so any signed-in user could
 * list every live room's code and walk into any transcription session — including sessions
 * attached to an event they were never invited to.
 *
 * Written to FAIL before the migration. A credential must be PRESENTED, never LISTED.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

test.describe('P1207 F2: a signed-in stranger must not be able to enumerate room codes', () => {
  let strangerId: string;
  let strangerEmail: string;
  let roomId: string;
  let roomCode: string;
  let stranger: ReturnType<typeof createClient>;

  test.beforeAll(async () => {
    strangerEmail = generateTestEmail();
    const u = await createTestUser({ name: 'P1207 Stranger', email: strangerEmail });
    strangerId = u.user.id;

    roomCode = `P12${Math.floor(Math.random() * 90000 + 10000)}`;
    const { data, error } = await supabaseAdmin
      .from('transcribe_rooms')
      .insert({ code: roomCode })
      .select('id, code')
      .single();
    if (error) throw new Error(`p1207 F2 fixture: could not seed room: ${error.message}`);
    roomId = data.id;

    stranger = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const signIn = await stranger.auth.signInWithPassword({
      email: strangerEmail, password: TEST_PASSWORD,
    });
    if (signIn.error) throw new Error(`p1207 F2 fixture: stranger sign-in failed: ${signIn.error.message}`);
  });

  test.afterAll(async () => {
    if (roomId) await supabaseAdmin.from('transcribe_rooms').delete().eq('id', roomId);
    if (strangerId) await supabaseAdmin.auth.admin.deleteUser(strangerId);
  });

  test('a stranger cannot list rooms they are not a member of', async () => {
    // CONTROL: the stranger really is signed in. Without this, an empty list below would be
    // indistinguishable from an unauthenticated client, and the test would pass vacuously.
    const { data: me } = await stranger.auth.getUser();
    expect(me.user?.id, 'control: the stranger must hold a real session').toBe(strangerId);

    // CONTROL: the room genuinely exists — proven with the service role, which bypasses RLS.
    const admin = await supabaseAdmin.from('transcribe_rooms').select('id, code').eq('id', roomId).single();
    expect(admin.data?.code, 'control: the fixture room must exist with its code').toBe(roomCode);

    const listed = await stranger.from('transcribe_rooms').select('id, code').eq('id', roomId);
    expect(listed.data ?? [],
      `a non-member must not read this room; instead got ${JSON.stringify(listed.data)}`).toEqual([]);
  });

  test('a stranger cannot harvest codes in bulk', async () => {
    const sweep = await stranger.from('transcribe_rooms').select('code').limit(1000);
    expect(sweep.data ?? [],
      `no room codes may be enumerable; got ${(sweep.data ?? []).length} codes`).toEqual([]);
  });

  test('but a code that is PRESENTED still resolves — the join path is preserved', async () => {
    const { data, error } = await stranger.rpc('get_transcribe_room_by_code', { p_code: roomCode });
    expect(error, `presenting a valid code must still work: ${error?.message}`).toBeNull();
    expect((data ?? []) as unknown[], 'the presented code must resolve to exactly one room').toHaveLength(1);
    expect(((data ?? []) as { id: string }[])[0]!.id, 'and it must be the right room').toBe(roomId);
  });

  test('a wrong code resolves to nothing, and partial codes are not an oracle', async () => {
    for (const bad of [roomCode.slice(0, 4), `${roomCode}X`, 'ZZZZZZ', roomCode.toLowerCase().slice(0, 3)]) {
      const { data } = await stranger.rpc('get_transcribe_room_by_code', { p_code: bad });
      expect((data ?? []) as unknown[], `partial/wrong code "${bad}" must resolve to nothing`).toHaveLength(0);
    }
  });
});
