/**
 * @file p1236-create-room-requires-consent.spec.ts
 * @description P1236 (e): create_transcribe_room() must take consent, not assume it.
 *
 * WHY THIS EXISTS. P1275 shipped create_transcribe_room() to main while P1236 was on its
 * own branch making consent a required argument of join_transcribe_room(). Both are
 * correct alone. Merged as they stood, the create path wrote a transcribe_room_members
 * row with consent_given_at NULL — and because the function is SECURITY DEFINER it never
 * consults the policy P1236 uses to make that state unrepresentable. Every room creator
 * would have held an unconsented seat while capture was live, and transcribe-slice
 * refuses exactly that seat: the room's own creator would be the one person never
 * transcribed.
 *
 * These assertions are the durable form of proofs first run against a rolled-back
 * transaction on 2026-09-09. They cannot run until the migration is applied — it drops
 * the 4-argument overload the currently-deployed bundle calls, so it is held to deploy
 * time alongside …_p1236_b_… (see the spec's Pre-deploy Checklist).
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

test.describe('P1236: create_transcribe_room requires consent', () => {
  let creatorId: string;
  let creator: SupabaseClient;
  let creatorSessionId: string;
  const createdRoomIds: string[] = [];

  test.beforeAll(async () => {
    const email = generateTestEmail();
    creatorId = (await createTestUser({ name: 'P1236 Creator', email })).user.id;

    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: `P1236-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        creator_name: 'P1236 Creator',
        creator_profile_id: creatorId,
      })
      .select('id')
      .single();
    if (error) throw new Error(`p1236e fixture: clarity_sessions insert failed: ${error.message}`);
    creatorSessionId = data!.id;

    creator = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const signIn = await creator.auth.signInWithPassword({ email, password: TEST_PASSWORD });
    if (signIn.error) throw new Error(`p1236e fixture: sign-in failed: ${signIn.error.message}`);
  });

  test.afterAll(async () => {
    for (const id of createdRoomIds) await supabaseAdmin.from('transcribe_rooms').delete().eq('id', id);
    // clarity_sessions.creator_profile_id has no ON DELETE CASCADE, so the fixture session
    // blocks the profile delete if it is left behind.
    if (creatorId) {
      await supabaseAdmin.from('clarity_sessions').delete().eq('creator_profile_id', creatorId);
      await deleteTestUser(creatorId);
    }
  });

  const call = (code: string, args: Record<string, unknown>) =>
    creator.rpc('create_transcribe_room', {
      p_code: code,
      p_display_name: 'P1236 Creator',
      p_session_id: creatorSessionId,
      ...args,
    });

  test('consent true creates room, membership and the consent stamp together', async () => {
    // CONTROL: the caller really holds a session. Without this, every refusal below would
    // be indistinguishable from an unauthenticated client being refused on line one.
    const { data: me } = await creator.auth.getUser();
    expect(me.user?.id, 'control: the creator must hold a real session').toBe(creatorId);

    const { data, error } = await call(roomCode(), { p_consent: true, p_event_id: null });
    expect(error, `creating a room must succeed: ${error?.message}`).toBeNull();

    const row = ((data ?? []) as Record<string, string | null>[])[0];
    expect(row, 'the call must return the room it created').toBeTruthy();
    createdRoomIds.push(row!.room_id as string);

    expect(row!.member_consent_given_at, 'consent must be stamped by the server').not.toBeNull();
    // Server-derived, not echoed from an argument: the function takes no profile_id.
    expect(row!.member_profile_id, 'attribution must come from auth.uid()').toBe(creatorId);

    // The return value is not the evidence — the row is.
    const { data: member } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('profile_id, consent_given_at')
      .eq('room_id', row!.room_id as string)
      .single();
    expect(member!.profile_id).toBe(creatorId);
    expect(member!.consent_given_at, 'the stored member row must carry consent').not.toBeNull();
  });

  // false and null are separate cases on purpose: the guard is `IS NOT TRUE`, and a `= false`
  // spelling would let a null through while passing the false case.
  for (const [label, consent] of [['false', false], ['null', null]] as const) {
    test(`consent ${label} is refused and writes nothing`, async () => {
      // Scoped to THIS call's code, not a global row count: these specs share the test
      // database with every other worker, so a total-count comparison would be decided by
      // whoever else happened to create a room between the two reads.
      const code = roomCode();
      const { error } = await call(code, { p_consent: consent, p_event_id: null });

      // Assert the MESSAGE, not the code. A missing table grant also raises 42501, so a
      // code-only assertion passes for a reason that has nothing to do with consent.
      expect(error, 'an unconsented create must be refused').not.toBeNull();
      expect(error!.message).toMatch(/consent is required/i);

      const { data: leftBehind } = await supabaseAdmin
        .from('transcribe_rooms')
        .select('id')
        .eq('code', code);
      expect(leftBehind ?? [], 'a refused create must leave no room behind').toEqual([]);
    });
  }

  test('the consent-less 4-argument overload is gone, not merely superseded', async () => {
    // Adding a parameter creates an overload rather than replacing. If the old form
    // survived it would remain callable and remain the exact bypass this closes.
    const { error } = await creator.rpc('create_transcribe_room', {
      p_code: roomCode(),
      p_display_name: 'P1236 Creator',
      p_session_id: creatorSessionId,
      p_event_id: null,
    });
    expect(error, 'the 4-argument form must no longer resolve').not.toBeNull();
    expect(error!.code, 'PostgREST must find no matching function').toBe('PGRST202');
  });

  test('anon cannot execute it', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc('create_transcribe_room', {
      p_code: roomCode(),
      p_display_name: 'P1236 Creator',
      p_session_id: creatorSessionId,
      p_consent: true,
      p_event_id: null,
    });
    // The grant, not the body. An anonymous caller fails the function's first line too, so
    // asserting merely "an error occurred" would pass against a fully anon-executable
    // function — the P1065 trap this migration's REVOKE exists to close.
    expect(error, 'anon must be refused').not.toBeNull();
    expect(error!.message).toMatch(/permission denied for function/i);
  });
});
