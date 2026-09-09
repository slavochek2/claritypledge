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

    const code = roomCode();
    const { data, error } = await call(code, { p_consent: true, p_event_id: null });
    expect(error, `creating a room must succeed: ${error?.message}`).toBeNull();

    const row = ((data ?? []) as Record<string, string | null>[])[0];
    expect(row, 'the call must return the room it created').toBeTruthy();
    createdRoomIds.push(row!.room_id as string);

    expect(row!.member_consent_given_at, 'consent must be stamped by the server').not.toBeNull();
    // Server-derived, not echoed from an argument: the function takes no profile_id.
    expect(row!.member_profile_id, 'attribution must come from auth.uid()').toBe(creatorId);

    // EVERY returned column, on purpose. RETURNS TABLE grew from 9 to 11 and every position
    // moved; five of the columns are uuid, so a swap among them in the RETURN QUERY SELECT is
    // type-compatible and raises nothing — it just returns the wrong value. member_session_id
    // is the one that matters most: it binds a recording to a speaker, and the client maps it
    // straight into TranscribeRoomMember.sessionId.
    expect(row!.room_code, 'room_code must be the code we asked for').toBe(code);
    expect(row!.room_event_id, 'an ad-hoc room has no event').toBeNull();
    expect(row!.room_created_at, 'room_created_at must be populated').not.toBeNull();
    expect(row!.room_ended_at, 'a new room must be live').toBeNull();
    expect(row!.member_session_id, 'the seat must carry the recording we minted').toBe(creatorSessionId);
    expect(row!.member_display_name, 'display name must round-trip').toBe('P1236 Creator');
    expect(row!.member_joined_at, 'member_joined_at must be populated').not.toBeNull();
    expect(row!.room_id, 'room_id must be a uuid, not another column').toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(row!.member_id, 'member_id must differ from room_id').not.toBe(row!.room_id);

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

  // These three guards are covered today ONLY by e2e/integration/p1275-create-transcribe-room-rpc.spec.ts,
  // which lives on main and which this migration turns red the moment it applies (its 8 call
  // sites all use the 4-argument form). Without these, the strictest checks in a SECURITY
  // DEFINER function would have zero green coverage between the apply and that spec's update —
  // and the session-ownership one is the check P1275 called an impersonation primitive.
  test('a session belonging to someone else is refused', async () => {
    const strangerEmail = generateTestEmail();
    const stranger = await createTestUser({ name: 'P1236 Stranger', email: strangerEmail });
    try {
      const { data: s } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({
          code: `P1236X-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          creator_name: 'P1236 Stranger',
          creator_profile_id: stranger.user.id,
        })
        .select('id')
        .single();

      const { error } = await creator.rpc('create_transcribe_room', {
        p_code: roomCode(),
        p_display_name: 'P1236 Creator',
        p_session_id: s!.id,
        p_consent: true,
        p_event_id: null,
      });
      expect(error, "another user's recording must not be attachable to this seat").not.toBeNull();
      expect(error!.message).toMatch(/session does not belong to the caller/i);
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('creator_profile_id', stranger.user.id);
      await deleteTestUser(stranger.user.id);
    }
  });

  // Lowercase, and I/O/0/1 — the four characters the generator's alphabet excludes.
  for (const bad of ['lower1', 'ABCDE', 'ABCDEFG', 'ABCDEI', 'ABCDE0']) {
    test(`room code ${JSON.stringify(bad)} is refused`, async () => {
      const { error } = await call(bad, { p_consent: true, p_event_id: null });
      expect(error, 'an off-alphabet room code must be refused').not.toBeNull();
      expect(error!.message).toMatch(/room code must be 6 characters/i);
    });
  }

  for (const [label, name] of [['empty', ''], ['whitespace only', '   '], ['101 chars', 'x'.repeat(101)]] as const) {
    test(`display name (${label}) is refused`, async () => {
      const { error } = await creator.rpc('create_transcribe_room', {
        p_code: roomCode(),
        p_display_name: name,
        p_session_id: creatorSessionId,
        p_consent: true,
        p_event_id: null,
      });
      expect(error, 'an out-of-bounds display name must be refused').not.toBeNull();
      expect(error!.message).toMatch(/display name must be between 1 and 100/i);
    });
  }

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
