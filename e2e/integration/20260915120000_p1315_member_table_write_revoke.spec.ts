/**
 * @file 20260915120000_p1315_member_table_write_revoke.spec.ts
 * @description P270 canary for 20260915120000_p1315_member_table_write_revoke.sql.
 *
 * With no UPDATE/DELETE policy, RLS already makes a member's direct write affect zero rows — but
 * silently, and only for as long as no permissive policy is ever added. The grant revoke makes the
 * database REFUSE the statement outright. So each write below must return an ERROR, not merely leave
 * the row untouched; an admin readback then confirms the row really is unchanged.
 *
 * Red before the migration: the UPDATE and DELETE return no error (zero rows, silently).
 * Controls: the member row is created through the consented RPC (the RPC path still writes), the
 * member can still READ their own row, and the service role can still update it.
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

test.describe('P1315: client roles cannot write transcribe_room_members', () => {
  let member: TestUser;
  let client: SupabaseClient;
  let roomId: string;
  let memberRowId: string;
  const createdSessionIds: string[] = [];

  test.beforeAll(async () => {
    member = await createTestUser({ name: 'P1315 Writer' });
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email: member.email, password: TEST_PASSWORD,
    });
    expect(error).toBeNull();
    client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const code = `P1315W${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const { data: room, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms').insert({ code }).select('id').single();
    expect(roomError, `seed room failed: ${roomError?.message}`).toBeNull();
    roomId = room!.id;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `${code}-S`, creator_name: 'P1315 Writer', creator_profile_id: member.user.id })
      .select('id').single();
    expect(sessionError, `seed session failed: ${sessionError?.message}`).toBeNull();
    createdSessionIds.push(session!.id);

    // Control: the consented RPC still creates the row.
    const { data: joined, error: joinError } = await client.rpc('join_transcribe_room', {
      p_room_id: roomId, p_display_name: 'P1315 Writer', p_session_id: session!.id, p_consent: true,
    });
    expect(joinError, `join failed: ${joinError?.message}`).toBeNull();
    memberRowId = (joined as Array<{ id: string }>)[0].id;
  });

  test.afterAll(async () => {
    if (roomId) await supabaseAdmin.from('transcribe_rooms').delete().eq('id', roomId);
    if (createdSessionIds.length > 0) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    if (member?.user?.id) await deleteTestUser(member.user.id);
  });

  async function adminRow() {
    const { data, error } = await supabaseAdmin
      .from('transcribe_room_members').select('id, display_name').eq('id', memberRowId).maybeSingle();
    expect(error, `readback failed: ${error?.message}`).toBeNull();
    return data;
  }

  test('control: the member can still read their own row', async () => {
    const { data, error } = await client.from('transcribe_room_members').select('id').eq('id', memberRowId);
    expect(error, `member read failed: ${error?.message}`).toBeNull();
    expect(data).toHaveLength(1);
  });

  test('a member UPDATE of their own row is refused with an error, and the row is unchanged', async () => {
    const { error } = await client
      .from('transcribe_room_members').update({ display_name: 'P1315 Renamed' }).eq('id', memberRowId);
    expect(error, 'UPDATE must be refused by the grant layer, not silently match zero rows').not.toBeNull();
    expect((await adminRow())?.display_name).toBe('P1315 Writer');
  });

  test('a member DELETE of their own row is refused with an error, and the row survives', async () => {
    const { error } = await client.from('transcribe_room_members').delete().eq('id', memberRowId);
    expect(error, 'DELETE must be refused by the grant layer, not silently match zero rows').not.toBeNull();
    expect(await adminRow()).not.toBeNull();
  });

  test('control: the service role can still update the row', async () => {
    const { error } = await supabaseAdmin
      .from('transcribe_room_members').update({ last_seen_at: new Date().toISOString() }).eq('id', memberRowId);
    expect(error, `service-role update failed: ${error?.message}`).toBeNull();
  });
});
