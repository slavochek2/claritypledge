/**
 * @file 20260824000000_p1149_room_end_policy_column_guard.spec.ts
 * @description P270 canary for 20260824000000_p1149_room_end_policy_column_guard.sql.
 *
 * P1149 finish-review MEDIUM: `transcribe_rooms`' "room members can end the room" UPDATE
 * policy had a USING clause but no WITH CHECK — per Postgres RLS semantics that reuses
 * USING for the check, which restricts which ROW can be touched (must have a member) but
 * not which COLUMNS change. A member could rewrite `code` (breaking join-by-code for
 * everyone else) or `event_id` (re-attaching the room to an arbitrary event), not just
 * `ended_at`. This migration adds a BEFORE UPDATE trigger that rejects changes to
 * `code`/`event_id`/`created_at`, plus a matching WITH CHECK.
 *
 * Same two-client pattern as e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts:
 * one client per role, every assertion re-reads via the ADMIN client so a USING-filtered
 * no-op (204, zero rows changed) and a WITH CHECK/trigger rejection (403 or a raised
 * exception) both get caught the same way.
 *
 * UPDATED for P1307 (Security Review, Parent verification 1): the "room members can end
 * the room" UPDATE policy this file originally verified is DROPPED by P1307's migration —
 * ending a room is now exclusively `end_transcribe_room_capture` (per-person, Decision 1)
 * plus the server-side sweep (Decision 2), never a direct client UPDATE. The control test
 * below ("a room member can end the room") is inverted to "a room member CANNOT end the
 * room" — this is a deliberately-changed behavior, not a regression, and this file is kept
 * (rather than deleted) because the column-guard trigger it also covers
 * (`code`/`event_id`/`created_at` immutability) is unrelated to Decision 1 and must keep
 * holding once the UPDATE policy that used to carry it is gone — see the "column guard
 * still applies to a non-member's refused attempt" note on the code/event_id tests below.
 * A parallel, RPC-level test lives in e2e/integration/p1307-end-capture-rpc.spec.ts
 * ("room members can end the room UPDATE policy is gone").
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
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
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

test.describe('P1149: transcribe_rooms UPDATE policy — column guard', () => {
  let member: TestUser;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];

  /** Seeds a room with `member` as its only participant, via the admin client. */
  async function seedRoomWithMember(label: string) {
    const code = makeRoomCode();
    const { data: room, error: roomError } = await supabaseAdmin
      .from('transcribe_rooms')
      .insert({ code })
      .select('id, code, event_id, created_at')
      .single();
    expect(roomError, `seed room failed: ${roomError?.message}`).toBeNull();
    createdRoomIds.push(room!.id);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: `${code}-S1`, creator_name: `P1149 guard ${label}`, creator_profile_id: member.user.id })
      .select('id')
      .single();
    expect(sessionError, `seed session failed: ${sessionError?.message}`).toBeNull();
    createdSessionIds.push(session!.id);

    const { error: memberError } = await supabaseAdmin
      .from('transcribe_room_members')
      .insert({ room_id: room!.id, profile_id: member.user.id, display_name: 'P1149 Guard Member', session_id: session!.id });
    expect(memberError, `seed member failed: ${memberError?.message}`).toBeNull();

    return room!;
  }

  async function readRoom(id: string) {
    const { data, error } = await supabaseAdmin
      .from('transcribe_rooms')
      .select('id, code, event_id, created_at, ended_at')
      .eq('id', id)
      .single();
    expect(error, `readback failed: ${error?.message}`).toBeNull();
    return data!;
  }

  async function memberClient() {
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email: member.email, password: TEST_PASSWORD,
    });
    expect(error).toBeNull();
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();
    return client;
  }

  test.beforeAll(async () => {
    member = await createTestUser({ name: 'P1149 Guard Test Member' });
  });

  test.afterAll(async () => {
    if (createdRoomIds.length > 0) {
      await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    }
    if (createdSessionIds.length > 0) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    await deleteTestUser(member.user.id);
  });

  test('P1307: a room member CANNOT set ended_at directly any more', async () => {
    // Inverted from the pre-P1307 control test of the same shape. Ending a room is now
    // exclusively end_transcribe_room_capture (per-person) + the server-side sweep
    // (transcribe_room_sweep_tick) — see p1307-end-capture-rpc.spec.ts. No UPDATE policy on
    // transcribe_rooms is left for `authenticated` at all (P1307 Build Sequence step 1).
    const room = await seedRoomWithMember('end control');
    const client = await memberClient();

    await client
      .from('transcribe_rooms')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', room.id);

    const after = await readRoom(room.id);
    expect(after.ended_at, 'a client UPDATE must not be able to end a room under P1307').toBeNull();
  });

  test('P1307: a room member CANNOT clear an already-set ended_at', async () => {
    const room = await seedRoomWithMember('un-end control');
    await supabaseAdmin.from('transcribe_rooms').update({ ended_at: new Date().toISOString() }).eq('id', room.id);
    const client = await memberClient();

    await client.from('transcribe_rooms').update({ ended_at: null }).eq('id', room.id);

    const after = await readRoom(room.id);
    expect(after.ended_at, 'a client must not be able to un-end a room either').not.toBeNull();
  });

  test('a room member cannot rewrite `code` — the whole UPDATE is refused, not just this column', async () => {
    // Pre-P1307, this test isolated the column-guard TRIGGER: the old policy allowed
    // ended_at through while the trigger blocked code/event_id. With no UPDATE policy left
    // at all (P1307), RLS refuses the update before the trigger is ever reached — so this
    // assertion now holds for a structurally different reason than its name once implied.
    // Kept (not deleted) because the OUTCOME it protects — code can never be rewritten by a
    // room member — must still hold, and because the trigger remains defense-in-depth
    // against any future policy that reopens UPDATE on this table.
    const room = await seedRoomWithMember('code rewrite');
    const client = await memberClient();
    const hijackedCode = makeRoomCode();

    await client
      .from('transcribe_rooms')
      .update({ code: hijackedCode, ended_at: new Date().toISOString() })
      .eq('id', room.id);

    const after = await readRoom(room.id);
    expect(
      after.code,
      `A room member rewrote the room code on ${room.id} from ${room.code} to ` +
      `${hijackedCode}. Rooms are resolved by code (getRoomByCode), so this breaks ` +
      `join-by-code for every other participant.`
    ).toBe(room.code);
  });

  test('a room member cannot re-point `event_id` — the whole UPDATE is refused, not just this column', async () => {
    // Same reasoning as the code-rewrite test above: RLS alone now accounts for the
    // outcome, but the trigger's own guard is kept as a second, independent line.
    const room = await seedRoomWithMember('event_id rewrite');
    const client = await memberClient();

    const { data: event } = await supabaseAdmin
      .from('events')
      .select('id')
      .limit(1)
      .maybeSingle();

    // Any UUID works for this assertion — the guard fires on the column changing at all,
    // not on the target existing. Falls back to a fresh UUID if no events row exists.
    const foreignEventId = event?.id ?? '00000000-0000-4000-8000-000000000000';

    await client
      .from('transcribe_rooms')
      .update({ event_id: foreignEventId, ended_at: new Date().toISOString() })
      .eq('id', room.id);

    const after = await readRoom(room.id);
    expect(
      after.event_id,
      `A room member re-pointed event_id on room ${room.id} to ${foreignEventId} — ` +
      `re-attaching the room to an event they don't otherwise have rights over.`
    ).toBe(room.event_id);
  });

  test('a non-member cannot update the room at all (control: USING clause still holds)', async () => {
    const room = await seedRoomWithMember('non-member control');
    const stranger = await createTestUser({ name: 'P1149 Guard Stranger' });
    try {
      const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: stranger.email, password: TEST_PASSWORD,
      });
      expect(signInError).toBeNull();
      const strangerClient = makeUserClient(signIn!.session!.access_token);
      await supabaseAdmin.auth.signOut();

      await strangerClient
        .from('transcribe_rooms')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', room.id);

      const after = await readRoom(room.id);
      expect(after.ended_at, 'A non-member ended a room they never joined.').toBeNull();
    } finally {
      await deleteTestUser(stranger.user.id);
    }
  });
});
