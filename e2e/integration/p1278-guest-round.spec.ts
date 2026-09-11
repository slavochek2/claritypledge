/**
 * @file p1278-guest-round.spec.ts
 * @description P1278 D — a /live round with a guest in the joiner seat is recorded by the signed-in
 * creator, with the guest's side of the row NULL.
 *
 * P270 coverage — this file is the integration test for:
 *   - 20260911173000_p1278_d_a_guest_round_is_recorded
 *
 * "admit" tests MUST FAIL before that migration (both participant columns were NOT NULL) and pass after.
 * "gap" tests must pass before AND after: they are the shapes a guest room must still refuse, and they
 * are what measures whether admitting the guest shape opened anything else.
 *
 * Readbacks go through the service-role client and check persisted rows — never `error` alone.
 * Run: npx playwright test --project=integration e2e/integration/p1278-guest-round.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestSessionInDB, type TestSessionInDB } from '../helpers/test-session';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  await supabaseAdmin.auth.signOut();
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function counters(profileId: string): Promise<{ ears: number; sessions: number }> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('ears_count, verification_session_count')
    .eq('id', profileId)
    .single();
  if (error || !data) throw new Error(`counters read failed: ${error?.message}`);
  return { ears: data.ears_count ?? 0, sessions: data.verification_session_count ?? 0 };
}

async function understoodCount(storyId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.from('stories').select('understood_count').eq('id', storyId).single();
  if (error || !data) throw new Error(`understood_count read failed: ${error?.message}`);
  return data.understood_count ?? 0;
}

async function storyVersionId(storyId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', storyId)
    .order('version_number', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`no story_versions row for ${storyId}: ${error?.message}`);
  return data.id;
}

/**
 * The shape recordVerification sends (no source / verified: the defaults are 'live' / true), with a
 * caller-supplied id and NO `.select()`. Without a representation the error reflects the INSERT decision
 * alone, and every outcome is then read back by id through service_role — so a refused read-back can
 * never pass for a refused write (codex, 2026-09-11).
 */
async function writeRound(
  client: SupabaseClient,
  row: Record<string, unknown>,
  ids: string[],
): Promise<{ id: string; error: { code?: string; message: string } | null }> {
  const id = crypto.randomUUID();
  ids.push(id);
  const { error } = await client.from('story_verifications').insert({ id, ...row });
  return { id, error };
}

async function persisted(id: string): Promise<number> {
  const { count, error } = await supabaseAdmin.from('story_verifications').select('id', { count: 'exact', head: true }).eq('id', id);
  if (error) throw new Error(`persisted read failed: ${error.message}`);
  return count ?? 0;
}

test.describe('P1278 D: a guest round is recorded from the creator, with the guest side NULL', () => {
  test.describe.configure({ mode: 'serial' });

  let creator: TestUser;
  let stranger: TestUser;
  let signedJoiner: TestUser;
  let creatorStoryId: string;
  /** Joiner seat occupied by a guest: no joiner profile, seat claimed. */
  let guestRoom: TestSessionInDB;
  /** Same shape, but the seat was never occupied. */
  let emptyRoom: TestSessionInDB;
  /** A signed-in joiner — the P1278 A shape. */
  let pairRoom: TestSessionInDB;
  /** A guest-seated room the creator has already ended. */
  let endedRoom: TestSessionInDB;
  /** A room whose signed-in joiner erased their account: erasure nulls the joiner and cancels the room. */
  let erasedRoom: TestSessionInDB;
  /** A guest-seated room marked 'completed' with no end stamp — status is client-updatable (P1047). */
  let completedRoom: TestSessionInDB;
  /** The creator's story, made public — the SELECT policy's story-visibility branch. */
  let publicStoryId: string;
  let creatorClient: SupabaseClient;
  let strangerClient: SupabaseClient;
  const ids: string[] = [];

  test.beforeAll(async () => {
    creator = await createTestUser({ email: generateTestEmail(), name: 'P1278D Creator' });
    stranger = await createTestUser({ email: generateTestEmail(), name: 'P1278D Stranger' });
    signedJoiner = await createTestUser({ email: generateTestEmail(), name: 'P1278D Joiner' });
    creatorStoryId = (await createTestStory(creator.user.id, { title: `P1278D story ${Date.now()}` })).id;

    guestRoom = await createTestSessionInDB(creator.user.id, 'P1278D Guest', { hostName: 'P1278D Creator' });
    const { error: seatErr } = await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_seat_claimed_at: new Date().toISOString() })
      .eq('id', guestRoom.sessionId);
    if (seatErr) throw new Error(`fixture: could not seat the guest: ${seatErr.message}`);
    emptyRoom = await createTestSessionInDB(creator.user.id, 'P1278D Nobody', { hostName: 'P1278D Creator' });
    pairRoom = await createTestSessionInDB(creator.user.id, 'P1278D Joiner', {
      hostName: 'P1278D Creator',
      guestProfileId: signedJoiner.user.id,
    });
    endedRoom = await createTestSessionInDB(creator.user.id, 'P1278D Gone', { hostName: 'P1278D Creator' });
    const now = new Date().toISOString();
    const { error: endErr } = await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_seat_claimed_at: now, ended_at: now, status: 'completed' })
      .eq('id', endedRoom.sessionId);
    if (endErr) throw new Error(`fixture: could not end the room: ${endErr.message}`);
    erasedRoom = await createTestSessionInDB(creator.user.id, 'P1278D Erased', { hostName: 'P1278D Creator' });
    // The exact shape erase_my_account leaves (20260903090000_p520_erasure_hardening_2): joiner_profile_id
    // NULL, joiner_name tombstoned, status 'cancelled' — and the seat stamp untouched.
    const { error: eraseErr } = await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_seat_claimed_at: now, joiner_name: 'Deleted user', status: 'cancelled' })
      .eq('id', erasedRoom.sessionId);
    if (eraseErr) throw new Error(`fixture: could not shape the erased room: ${eraseErr.message}`);
    completedRoom = await createTestSessionInDB(creator.user.id, 'P1278D Done', { hostName: 'P1278D Creator' });
    const { error: doneErr } = await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_seat_claimed_at: now, status: 'completed' })
      .eq('id', completedRoom.sessionId);
    if (doneErr) throw new Error(`fixture: could not mark the room completed: ${doneErr.message}`);
    publicStoryId = (await createTestStory(creator.user.id, { title: `P1278D public ${Date.now()}` })).id;
    const { error: visErr } = await supabaseAdmin.from('stories').update({ visibility: 'public' }).eq('id', publicStoryId);
    if (visErr) throw new Error(`fixture: could not publish the story: ${visErr.message}`);

    creatorClient = makeUserClient(await signIn(creator.email));
    strangerClient = makeUserClient(await signIn(stranger.email));
  });

  test.afterAll(async () => {
    // story_verifications.session_id has no ON DELETE, so rows go before their rooms.
    for (const room of [guestRoom, emptyRoom, pairRoom, endedRoom, erasedRoom, completedRoom]) {
      if (room) await supabaseAdmin.from('story_verifications').delete().eq('session_id', room.sessionId);
    }
    if (ids.length) await supabaseAdmin.from('story_verifications').delete().in('id', ids);
    for (const room of [guestRoom, emptyRoom, pairRoom, endedRoom, erasedRoom, completedRoom]) if (room) await room.cleanup();
    if (creatorStoryId) await deleteTestStory(creatorStoryId);
    if (publicStoryId) await deleteTestStory(publicStoryId);
    for (const u of [creator, stranger, signedJoiner]) if (u) await deleteTestUser(u.user.id);
  });

  // ── ADMIT — must fail before the migration ─────────────────────────────────────────────────────

  test('admit: the creator records a guest round as SPEAKER; only the creator\'s session count moves', async () => {
    const before = await counters(creator.user.id);
    const { id, error } = await writeRound(creatorClient, {
      session_id: guestRoom.sessionId, speaker_id: creator.user.id, listener_id: null,
      speaker_rating: 7, listener_rating: 9,
    }, ids);
    expect(error, `P1278 D NOT DELIVERED: the creator could not record a guest round (${error?.code} ${error?.message})`).toBeNull();
    expect(await persisted(id), 'the admitted row is not in the table').toBe(1);

    const { data: row } = await supabaseAdmin.from('story_verifications').select('speaker_id, listener_id, source').eq('id', id).single();
    expect(row).toEqual({ speaker_id: creator.user.id, listener_id: null, source: 'live' });
    const after = await counters(creator.user.id);
    expect(after.sessions, 'the creator\'s session count must move once').toBe(before.sessions + 1);
    expect(after.ears, 'a storyless round moves no ears').toBe(before.ears);
  });

  test('admit: the creator records a guest round as LISTENER (the guest explained)', async () => {
    const before = await counters(creator.user.id);
    const { id, error } = await writeRound(creatorClient, {
      session_id: guestRoom.sessionId, speaker_id: null, listener_id: creator.user.id,
      speaker_rating: 6, listener_rating: 8,
    }, ids);
    expect(error, `P1278 D NOT DELIVERED: ${error?.code} ${error?.message}`).toBeNull();
    expect(await persisted(id), 'the admitted row is not in the table').toBe(1);
    const after = await counters(creator.user.id);
    expect(after.sessions, 'the creator\'s session count must move once — the speaker branch must not be skipped').toBe(before.sessions + 1);
  });

  test('admit: a guest who understood the creator\'s story does not move its understood_count', async () => {
    const versionId = await storyVersionId(creatorStoryId);
    const before = await understoodCount(creatorStoryId);
    const { id, error } = await writeRound(creatorClient, {
      session_id: guestRoom.sessionId, story_id: creatorStoryId, version_id: versionId,
      speaker_id: creator.user.id, listener_id: null, speaker_rating: 10, listener_rating: 10,
    }, ids);
    expect(error, `P1278 D NOT DELIVERED: ${error?.code} ${error?.message}`).toBeNull();
    expect(await persisted(id), 'the admitted row is not in the table').toBe(1);
    expect(await understoodCount(creatorStoryId), 'an anonymous guest must never count as a person who understood').toBe(before);
  });

  test('admit: the creator reads the round back, and the breakdown lists it with no speaker name', async () => {
    const { id, error } = await writeRound(creatorClient, {
      session_id: guestRoom.sessionId, speaker_id: null, listener_id: creator.user.id,
      speaker_rating: 5, listener_rating: 9,
    }, ids);
    expect(error, `P1278 D NOT DELIVERED: ${error?.code} ${error?.message}`).toBeNull();
    expect(await persisted(id), 'the admitted row is not in the table').toBe(1);

    const { data: own } = await creatorClient.from('story_verifications').select('id').eq('id', id);
    expect(own?.length, 'the creator cannot read their own guest round').toBe(1);

    const { data: diffs, error: rpcErr } = await creatorClient.rpc('get_my_listener_calibration_diffs');
    expect(rpcErr).toBeNull();
    const mine = (diffs as { id: string; speaker_name: string | null; speaker_slug: string | null }[]).find((r) => r.id === id);
    expect(mine, 'the breakdown drops a round the averages count — the page would disagree with itself').toBeTruthy();
    expect(mine).toMatchObject({ speaker_name: null, speaker_slug: null });
  });

  // ── GAP — must hold before AND after ───────────────────────────────────────────────────────────

  test('gap: no NULL side when the joiner seat was never occupied', async () => {
    const { id, error } = await writeRound(creatorClient, {
      session_id: emptyRoom.sessionId, speaker_id: creator.user.id, listener_id: null, speaker_rating: 7, listener_rating: 7,
    }, ids);
    expect(error, `a guest round landed in an empty room (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('gap: no NULL side when the joiner is a signed-in user', async () => {
    const { id, error } = await writeRound(creatorClient, {
      session_id: pairRoom.sessionId, speaker_id: creator.user.id, listener_id: null, speaker_rating: 7, listener_rating: 7,
    }, ids);
    expect(error, `a NULL participant landed in a room with a signed-in joiner (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('gap: the creator cannot name a stranger opposite the NULL guest', async () => {
    const { id, error } = await writeRound(creatorClient, {
      session_id: guestRoom.sessionId, speaker_id: stranger.user.id, listener_id: null, speaker_rating: 10, listener_rating: 10,
    }, ids);
    expect(error, `a stranger was credited in a guest room (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('gap: nobody but the creator may write a guest round', async () => {
    const { id, error } = await writeRound(strangerClient, {
      session_id: guestRoom.sessionId, speaker_id: creator.user.id, listener_id: null, speaker_rating: 10, listener_rating: 10,
    }, ids);
    expect(error, `an outsider wrote a guest round into someone else's room (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('gap: the guest\'s own anonymous client still cannot write', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { id, error } = await writeRound(anon, {
      session_id: guestRoom.sessionId, speaker_id: creator.user.id, listener_id: null, speaker_rating: 10, listener_rating: 10,
    }, ids);
    expect(error, `an anonymous caller wrote a live row (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('gap: a row naming NO participant is refused', async () => {
    const { id, error } = await writeRound(creatorClient, {
      session_id: guestRoom.sessionId, speaker_id: null, listener_id: null, speaker_rating: 7, listener_rating: 7,
    }, ids);
    expect(error, `a row with no participant landed (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('gap: a guest round still needs both ratings (P1278 C)', async () => {
    const { id, error } = await writeRound(creatorClient, {
      session_id: guestRoom.sessionId, speaker_id: creator.user.id, listener_id: null, speaker_rating: 7, listener_rating: null,
    }, ids);
    expect(error, `a guest round with no listener rating landed (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('gap: no guest round once the room has ended (codex, 2026-09-11)', async () => {
    const { id, error } = await writeRound(creatorClient, {
      session_id: endedRoom.sessionId, speaker_id: creator.user.id, listener_id: null, speaker_rating: 9, listener_rating: 9,
    }, ids);
    expect(error, `a guest round landed in an ended room (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('gap: no guest round in a room whose joiner erased their account (codex, 2026-09-11)', async () => {
    const { id, error } = await writeRound(creatorClient, {
      session_id: erasedRoom.sessionId, speaker_id: creator.user.id, listener_id: null, speaker_rating: 9, listener_rating: 9,
    }, ids);
    expect(error, `an erased joiner was treated as a guest (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('gap: no guest round in a room marked completed, even without an end stamp (codex pass 2)', async () => {
    const { id, error } = await writeRound(creatorClient, {
      session_id: completedRoom.sessionId, speaker_id: creator.user.id, listener_id: null, speaker_rating: 9, listener_rating: 9,
    }, ids);
    expect(error, `a guest round landed in a completed room (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
  });

  test('control: a stranger CAN read a signed-in round about a public story — the privacy probe below can see', async () => {
    const versionId = await storyVersionId(publicStoryId);
    const { id, error } = await writeRound(creatorClient, {
      session_id: pairRoom.sessionId, story_id: publicStoryId, version_id: versionId,
      speaker_id: creator.user.id, listener_id: signedJoiner.user.id, speaker_rating: 8, listener_rating: 8,
    }, ids);
    expect(error, `fixture: the signed-in round was refused (${error?.code} ${error?.message})`).toBeNull();
    const { data } = await strangerClient.from('story_verifications').select('id').eq('id', id);
    expect(data?.length, 'the story-visibility branch no longer shows a public story\'s signed-in rounds').toBe(1);
  });

  test('gap: a guest round about a public story is NOT readable by a stranger (codex, 2026-09-11)', async () => {
    const versionId = await storyVersionId(publicStoryId);
    const { id, error } = await writeRound(creatorClient, {
      session_id: guestRoom.sessionId, story_id: publicStoryId, version_id: versionId,
      speaker_id: creator.user.id, listener_id: null, speaker_rating: 8, listener_rating: 8,
    }, ids);
    expect(error, `fixture: the guest round was refused (${error?.code} ${error?.message})`).toBeNull();
    const { data } = await strangerClient.from('story_verifications').select('id').eq('id', id);
    expect(data?.length, 'a guest\'s round was published to a stranger through the story-visibility branch').toBe(0);
    const { data: own } = await creatorClient.from('story_verifications').select('id').eq('id', id);
    expect(own?.length, 'the creator lost sight of their own guest round').toBe(1);
  });

  test('gap: a LETTER row can never carry a NULL participant — refused even for service_role', async () => {
    // service_role bypasses RLS, so this measures the table itself: NOT NULL before the migration, the
    // guest-side CHECK after it.
    const { id, error } = await writeRound(supabaseAdmin, {
      source: 'letter', verified: false, story_id: creatorStoryId,
      speaker_id: creator.user.id, listener_id: null, speaker_rating: 0, listener_rating: 5,
    }, ids);
    expect(error, `a letter row with a NULL participant landed (id ${id})`).not.toBeNull();
    expect(await persisted(id), 'the refused row was persisted anyway').toBe(0);
    expect(['23502', '23514']).toContain(error?.code);
  });
});
