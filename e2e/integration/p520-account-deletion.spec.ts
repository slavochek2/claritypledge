/**
 * @file p520-account-deletion.spec.ts
 * @description Integration test for
 *   supabase/migrations/20260901213000_p520_erase_my_account.sql — the SECURITY DEFINER
 *   RPC behind self-serve account deletion.
 *
 * THIS IS THE TEST THAT MATTERS. The UI half is a confirmation panel; the erasure is one
 * database function acting on auth.uid(). Every assertion here goes at the database with
 * the same anon-key client the app uses, so a UI-only implementation fails this file.
 *
 * Fixture: one user who deletes themself ("leaver"), one counterparty whose data must
 * survive ("stayer"), one bystander who proves the RPC has no reach beyond the caller.
 * The leaver is seeded across every FK class the migration header enumerates:
 *   own content (story, position), community data they created (point, event), rows a
 *   counterparty depends on (witness given, verification as listener, shared session,
 *   agreement as partner), and the FK-less PII tables (terms_acceptances,
 *   session_consents).
 *
 * FOUR PROPERTIES:
 *   (a) the leaver's PII is gone from every enumerated table — and re-registration with
 *       the same email works (the auth.users row is really gone)
 *   (b) the stayer's data that referenced the leaver still loads through the app's own
 *       PostgREST joins (points_first_validator_id_fkey, host_id), now with a null actor
 *   (c) a different signed-in user cannot delete the leaver — the RPC has no target
 *       parameter, and PostgREST rejects an invented one
 *   (d) anon cannot call it at all
 *
 * This file FAILS LOUDLY if the migration was not applied — that is the point.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestStory } from '../helpers/test-story';
import { createTestPoint, createTestPosition, deleteTestPoint } from '../helpers/test-point';
import { createTestEvent, rsvpToEvent, deleteTestEvent } from '../helpers/test-event';
import { createTestAgreement, deleteTestAgreement } from '../helpers/test-agreement';
import { createTestSessionInDB } from '../helpers/test-session';
import { createEarCountData } from '../helpers/test-calibration';

const TOMBSTONE = 'Deleted user';

function anonClient(): SupabaseClient {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function userClient(email: string): Promise<SupabaseClient> {
  const tmp = anonClient();
  const { data, error } = await tmp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Service-role row count for `table WHERE col = value` — ground truth, unfiltered by RLS. */
async function countWhere(table: string, col: string, value: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(col, value);
  if (error) throw new Error(`count ${table}.${col} failed: ${error.message}`);
  return count ?? 0;
}

/** Service-role count of rows whose text column contains the needle (case-insensitive). */
async function countLike(table: string, col: string, needle: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .ilike(col, `%${needle}%`);
  if (error) throw new Error(`count ${table}.${col} ilike failed: ${error.message}`);
  return count ?? 0;
}

test.describe('P520: erase_my_account', () => {
  test.describe.configure({ mode: 'serial' });

  let leaver: TestUser;
  let stayer: TestUser;
  let bystander: TestUser;
  let bystanderGone = false;

  // Seeded ids the assertions and teardown need.
  let leaverStoryId: string;
  let leaverPointId: string;   // community data created by the leaver — must be orphaned, not deleted
  let stayerStoryId: string;
  let stayerPointId: string;
  let leaverEventId: string;   // hosted by the leaver — orphaned
  let stayerEventId: string;   // leaver RSVP'd — the RSVP row goes, the event stays
  let agreementByStayerId: string; // leaver is partner — terminated + anonymised
  let agreementByLeaverId: string; // leaver is creator — deleted
  let sessionId: string;       // leaver created, stayer joined — anonymised
  let sessionCleanup: () => Promise<void>;

  test.beforeAll(async () => {
    leaver = await createTestUser({ name: 'Leaver Person' });
    stayer = await createTestUser({ name: 'Stayer Person' });
    bystander = await createTestUser({ name: 'Bystander Person' });

    // Own content + a community point on it, with the leaver's own position.
    leaverStoryId = (await createTestStory(leaver.user.id, { content: 'Leaver story' })).id;
    leaverPointId = (await createTestPoint(leaver.user.id, leaverStoryId)).id;
    await createTestPosition(leaverPointId, leaver.user.id, 'agree');

    // The stayer's content; the leaver takes a position on the stayer's point.
    stayerStoryId = (await createTestStory(stayer.user.id, { content: 'Stayer story' })).id;
    stayerPointId = (await createTestPoint(stayer.user.id, stayerStoryId)).id;
    await createTestPosition(stayerPointId, leaver.user.id, 'disagree');
    await createTestPosition(stayerPointId, stayer.user.id, 'agree');

    // Events both ways.
    leaverEventId = (await createTestEvent(leaver.user.id)).id;
    await rsvpToEvent(leaverEventId, stayer.user.id);
    stayerEventId = (await createTestEvent(stayer.user.id)).id;
    await rsvpToEvent(stayerEventId, leaver.user.id);

    // Agreements both ways (RESTRICT FKs — the classic delete blocker).
    agreementByStayerId = (await createTestAgreement(stayer.user.id, leaver.email, {
      partnerProfileId: leaver.user.id, status: 'active', partnerSignedAt: new Date().toISOString(),
    })).id;
    agreementByLeaverId = (await createTestAgreement(leaver.user.id, stayer.email, {
      partnerProfileId: stayer.user.id, status: 'active',
    })).id;

    // Endorsements both ways — the one the leaver GAVE carries their name.
    const { error: wErr } = await supabaseAdmin.from('witnesses').insert([
      { profile_id: leaver.user.id, witness_name: stayer.name, witness_profile_id: stayer.user.id },
      { profile_id: stayer.user.id, witness_name: leaver.name, witness_profile_id: leaver.user.id },
    ]);
    if (wErr) throw new Error(`witness seed failed: ${wErr.message}`);

    // Verifications both ways. The helper also pins the listener's cached counters to
    // `count`, which is exactly what the recompute must overwrite.
    await createEarCountData({ listenerId: leaver.user.id, speakerId: stayer.user.id, count: 2 });
    await createEarCountData({ listenerId: stayer.user.id, speakerId: leaver.user.id, count: 1 });

    // A shared live session: leaver created it, stayer joined.
    const s = await createTestSessionInDB(leaver.user.id, stayer.name, {
      hostName: leaver.name, guestProfileId: stayer.user.id,
    });
    sessionId = s.sessionId;
    sessionCleanup = s.cleanup;
    const { error: chatErr } = await supabaseAdmin.from('clarity_chat_messages').insert({
      session_id: sessionId, author_name: leaver.name, content: 'hello from the leaver',
    });
    if (chatErr) throw new Error(`chat seed failed: ${chatErr.message}`);

    // FK-less PII tables.
    const { error: tErr } = await supabaseAdmin.from('terms_acceptances').insert({
      user_id: leaver.user.id, terms_version: 'v1.3', ip_hash: 'deadbeef', user_agent: 'p520-spec',
    });
    if (tErr) throw new Error(`terms seed failed: ${tErr.message}`);
    const { error: cErr } = await supabaseAdmin.from('session_consents').insert({
      session_id: 'P520TEST', user_id: leaver.user.id, terms_version: 'v1.3', ip_hash: 'deadbeef',
    });
    if (cErr) throw new Error(`consent seed failed: ${cErr.message}`);
  });

  test.afterAll(async () => {
    // Orphans the RPC deliberately leaves behind, then everything the stayer owns.
    await deleteTestPoint(leaverPointId);
    await deleteTestEvent(leaverEventId);
    await deleteTestAgreement(agreementByStayerId);
    await sessionCleanup?.();
    await supabaseAdmin.from('terms_acceptances').delete().eq('user_id', leaver.user.id);
    await supabaseAdmin.from('session_consents').delete().eq('user_id', leaver.user.id);
    await deleteTestPoint(stayerPointId);
    await deleteTestEvent(stayerEventId);
    await deleteTestUser(stayer.user.id);
    if (!bystanderGone) await deleteTestUser(bystander.user.id);
    // The leaver is deleted by the test itself; a failed run must still clean up.
    await deleteTestAgreement(agreementByLeaverId);
    await deleteTestUser(leaver.user.id);
  });

  test('(d) anon cannot call erase_my_account', async () => {
    const { error } = await anonClient().rpc('erase_my_account');
    expect(error, 'anon call must be refused').not.toBeNull();
    // EXECUTE is revoked from anon → 42501 permission denied for function.
    expect(error!.code).toBe('42501');
    expect(await countWhere('profiles', 'id', leaver.user.id)).toBe(1);
  });

  test('(c) another user cannot reach the leaver — no target parameter exists', async () => {
    const other = await userClient(bystander.email);

    // An invented target parameter matches no function signature → PostgREST refuses
    // before any SQL runs.
    const { error: spoof } = await other.rpc('erase_my_account', { p_user_id: leaver.user.id });
    expect(spoof, 'spoofed target must be rejected').not.toBeNull();
    expect(spoof!.code).toBe('PGRST202');
    expect(await countWhere('profiles', 'id', leaver.user.id)).toBe(1);

    // The only thing the bystander CAN do is erase the bystander.
    const { data, error } = await other.rpc('erase_my_account');
    expect(error).toBeNull();
    expect(data?.auth_user_deleted).toBe(true);
    bystanderGone = true;
    expect(await countWhere('profiles', 'id', bystander.user.id)).toBe(0);
    expect(await countWhere('profiles', 'id', leaver.user.id)).toBe(1);
    expect(await countWhere('profiles', 'id', stayer.user.id)).toBe(1);
  });

  test('the leaver erases themself: one call, returns per-step counts', async () => {
    const me = await userClient(leaver.email);
    const { data, error } = await me.rpc('erase_my_account');
    expect(error, `rpc failed: ${error?.message}`).toBeNull();
    expect(data).toMatchObject({
      auth_user_deleted: true,
      stories_deleted: 2,          // own story + the story createEarCountData made for them as speaker
      points_orphaned: 1,
      events_orphaned: 1,
      agreements_deleted: 1,
      agreements_anonymised: 1,
      sessions_anonymised: 1,
      positions_deleted: 2,
      verifications_deleted: 3,    // 2 as listener + 1 as speaker
    });
  });

  test('(a) no PII remains in any enumerated table, and the auth row is gone', async () => {
    const uid = leaver.user.id;

    // Identity
    expect(await countWhere('profiles', 'id', uid)).toBe(0);
    const { data: authLookup } = await supabaseAdmin.auth.admin.getUserById(uid);
    expect(authLookup?.user ?? null).toBeNull();

    // Own content + personal records: hard-deleted
    for (const [table, col] of [
      ['stories', 'author_id'],
      ['point_positions', 'user_id'],
      ['point_position_history', 'user_id'],
      ['story_point_history', 'user_id'],
      ['story_points', 'author_id'],
      ['event_rsvps', 'profile_id'],
      ['witnesses', 'profile_id'],
      ['clarity_agreements', 'creator_profile_id'],
      ['terms_acceptances', 'user_id'],
      ['session_consents', 'user_id'],
      ['story_verifications', 'speaker_id'],
      ['story_verifications', 'listener_id'],
    ] as const) {
      expect(await countWhere(table, col, uid), `${table}.${col}`).toBe(0);
    }

    // Rows others depend on: profile pointer cleared
    for (const [table, col] of [
      ['points', 'first_validator_id'],
      ['events', 'host_id'],
      ['witnesses', 'witness_profile_id'],
      ['clarity_agreements', 'partner_profile_id'],
      ['clarity_sessions', 'creator_profile_id'],
      ['clarity_sessions', 'joiner_profile_id'],
    ] as const) {
      expect(await countWhere(table, col, uid), `${table}.${col}`).toBe(0);
    }

    // Name and email scrubbed from every text column that ever carried them
    for (const [table, col, needle] of [
      ['witnesses', 'witness_name', leaver.name],
      ['clarity_sessions', 'creator_name', leaver.name],
      ['clarity_chat_messages', 'author_name', leaver.name],
      ['clarity_agreements', 'partner_email', leaver.email],
      ['clarity_agreements', 'partner_display_name', leaver.name],
      ['letter_deliveries', 'receiver_email', leaver.email],
    ] as const) {
      expect(await countLike(table, col, needle), `${table}.${col} still carries "${needle}"`).toBe(0);
    }

    // The same email can register again — the point of deleting auth.users.
    const { data: again, error: reErr } = await supabaseAdmin.auth.admin.createUser({
      email: leaver.email, password: TEST_PASSWORD, email_confirm: true,
    });
    expect(reErr, `re-registration failed: ${reErr?.message}`).toBeNull();
    expect(again.user?.email).toBe(leaver.email);
    await supabaseAdmin.auth.admin.deleteUser(again.user!.id);
  });

  test('(b) the stayer\'s data that referenced the leaver still loads, with a tombstone', async () => {
    const anon = anonClient();

    // The leaver's point survives as community data, and the app's own join name resolves
    // to a null creator (client mappers render 'Unknown').
    const { data: point, error: pErr } = await anon
      .from('points')
      .select('id, first_validator_id, creator:profiles!points_first_validator_id_fkey ( name )')
      .eq('id', leaverPointId)
      .single();
    expect(pErr).toBeNull();
    expect(point!.first_validator_id).toBeNull();
    expect(point!.creator).toBeNull();

    // The stayer's own position on the stayer's point is untouched; the leaver's is gone.
    expect(await countWhere('point_positions', 'point_id', stayerPointId)).toBe(1);

    // The leaver's event is now hostless but still loads through the host join.
    const { data: event, error: eErr } = await anon
      .from('events')
      .select('id, host_id, profiles:host_id ( name )')
      .eq('id', leaverEventId)
      .single();
    expect(eErr).toBeNull();
    expect(event!.host_id).toBeNull();
    expect(event!.profiles).toBeNull();
    // The stayer's RSVP on it survives.
    expect(await countWhere('event_rsvps', 'event_id', leaverEventId)).toBe(1);
    // The stayer's own event survives, minus the leaver's RSVP.
    expect(await countWhere('events', 'id', stayerEventId)).toBe(1);
    expect(await countWhere('event_rsvps', 'event_id', stayerEventId)).toBe(0);

    // The endorsement the leaver gave still counts for the stayer, under a tombstone.
    const { data: given } = await supabaseAdmin
      .from('witnesses').select('witness_name, witness_profile_id').eq('profile_id', stayer.user.id);
    expect(given).toHaveLength(1);
    expect(given![0]).toMatchObject({ witness_name: TOMBSTONE, witness_profile_id: null });

    // The agreement the stayer created reads as terminated, partner tombstoned.
    const { data: agr } = await supabaseAdmin
      .from('clarity_agreements')
      .select('status, partner_profile_id, partner_email, partner_display_name, terminated_at')
      .eq('id', agreementByStayerId).single();
    expect(agr).toMatchObject({
      status: 'terminated', partner_profile_id: null, partner_display_name: TOMBSTONE,
    });
    expect(agr!.terminated_at).not.toBeNull();
    expect(agr!.partner_email).not.toContain(leaver.email);
    // The one the leaver created is gone.
    expect(await countWhere('clarity_agreements', 'id', agreementByLeaverId)).toBe(0);

    // The shared session belongs to the stayer alone now.
    const { data: sess } = await supabaseAdmin
      .from('clarity_sessions')
      .select('creator_profile_id, creator_name, joiner_profile_id, joiner_name')
      .eq('id', sessionId).single();
    expect(sess).toMatchObject({
      creator_profile_id: null, creator_name: TOMBSTONE,
      joiner_profile_id: stayer.user.id, joiner_name: stayer.name,
    });
    const { data: msgs } = await supabaseAdmin
      .from('clarity_chat_messages').select('author_name').eq('session_id', sessionId);
    expect(msgs!.map((m) => m.author_name)).toEqual([TOMBSTONE]);

    // The stayer's cached counters were recomputed from what remains — the seed helper
    // had pinned them to 1/1, and every verification the stayer had involved the leaver.
    const { data: stayerProfile } = await supabaseAdmin
      .from('profiles').select('ears_count, verification_session_count').eq('id', stayer.user.id).single();
    expect(stayerProfile).toMatchObject({ ears_count: 0, verification_session_count: 0 });
    // The stayer's story survives and its understood_count no longer counts the leaver.
    expect(await countWhere('stories', 'author_id', stayer.user.id)).toBe(2);
    const { data: stayerStories } = await supabaseAdmin
      .from('stories').select('understood_count').eq('author_id', stayer.user.id);
    for (const s of stayerStories!) expect(s.understood_count).toBe(0);
  });
});
