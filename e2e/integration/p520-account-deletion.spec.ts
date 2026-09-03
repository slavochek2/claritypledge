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
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestStory } from '../helpers/test-story';
import { createTestPoint, createTestPosition, deleteTestPoint } from '../helpers/test-point';
import { createTestEvent, rsvpToEvent, deleteTestEvent } from '../helpers/test-event';
import { createTestAgreement, deleteTestAgreement } from '../helpers/test-agreement';
import { createTestSessionInDB } from '../helpers/test-session';
import { createEarCountData } from '../helpers/test-calibration';

const TOMBSTONE = 'Deleted user';

/**
 * Fixture display names must be unique per run. Several assertions here are name-based
 * (`countLike('witnesses', 'witness_name', leaver.name)`) and cannot tell this run's row
 * from a row a PREVIOUS run failed to tear down — a fixed name makes the suite pass or
 * fail on history rather than on the code under test. Observed: a run whose beforeAll
 * timed out left a `witnesses` row named 'Leaver Person' behind (its teardown was blocked
 * by witnesses_witness_profile_id_fkey), and the next run's assertion (a) failed on it.
 */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const runName = (base: string) => `${base} ${RUN}`;

/** A client that presents a fixed (possibly stale) access token — what a still-open tab holds. */
function bearerClient(accessToken: string): SupabaseClient {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signInTokens(email: string): Promise<{ access_token: string; refresh_token: string }> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

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

/**
 * Read-only catalogue query on the TEST project via the Management API.
 * Precedent: e2e/integration/p506-backfill-hashtags.spec.ts. PostgREST does not expose
 * pg_catalog, and the census tests below must derive their own list of tables from the
 * schema rather than from a hand-written one — a hand-written list cannot fail when a
 * new personal-data table is added, which is the property these tests exist to hold.
 */
function managementToken(): string {
  // .env.local is where this repo's own tooling keeps the Management API PAT
  // (scripts/migrate.sh, scripts/check-edge-function-secrets.sh both read it there).
  // playwright.config.ts loads .env.test.local instead, which may carry an older copy of
  // the same variable — so read the canonical file first and fall back to the process environment only
  // when it is absent.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const envLocal = path.join(repoRoot, '.env.local');
  if (fs.existsSync(envLocal)) {
    const line = fs.readFileSync(envLocal, 'utf8')
      .split('\n').find((l) => l.startsWith('SUPABASE_ACCESS_TOKEN='));
    if (line) {
      const value = line.slice('SUPABASE_ACCESS_TOKEN='.length).trim().replace(/^["']|["']$/g, '');
      if (value) return value;
    }
  }
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN;
  if (fromEnv) return fromEnv;
  throw new Error(
    'SUPABASE_ACCESS_TOKEN is not set in .env.local or the environment. The P520 census ' +
    'tests need catalogue access; without it the census is unproven, so this fails rather than skips.',
  );
}

async function catalogQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const token = managementToken();
  const ref = new URL(process.env.VITE_SUPABASE_URL!).hostname.split('.')[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`catalogue query failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T[];
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
  let sessionCode: string;
  let sessionCleanup: () => Promise<void>;
  let staleTokens: { access_token: string; refresh_token: string }; // what an open tab still holds

  test.beforeAll(async () => {
    leaver = await createTestUser({ name: runName('Leaver Person') });
    stayer = await createTestUser({ name: runName('Stayer Person') });
    bystander = await createTestUser({ name: runName('Bystander Person') });

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
    sessionCode = s.sessionCode;
    sessionCleanup = s.cleanup;
    const { error: chatErr } = await supabaseAdmin.from('clarity_chat_messages').insert([
      { session_id: sessionId, author_name: leaver.name, content: 'hello from the leaver' },
      { session_id: sessionId, author_name: stayer.name, content: 'hello from the stayer' },
    ]);
    if (chatErr) throw new Error(`chat seed failed: ${chatErr.message}`);
    // live_state carrying the leaver's name in every shape the type allows.
    const { error: lsErr } = await supabaseAdmin.from('clarity_sessions').update({
      live_state: {
        checksCount: 1, currentSpeaker: leaver.name, currentListener: stayer.name,
        checkerName: leaver.name, talkTime: { [leaver.name]: 12, [stayer.name]: 30 },
        roleSelections: { [leaver.name]: 'speaker', [stayer.name]: 'listener' },
      },
    }).eq('id', sessionId);
    if (lsErr) throw new Error(`live_state seed failed: ${lsErr.message}`);
    // ML training capture keyed only by (session code, display name).
    const { error: mlErr } = await supabaseAdmin.from('ml_training_sessions').insert([
      { session_code: sessionCode, user_name: leaver.name, audio_path: 'gs://p520-test/leaver.webm' },
      { session_code: sessionCode, user_name: stayer.name, audio_path: 'gs://p520-test/stayer.webm' },
    ]);
    if (mlErr) throw new Error(`ml seed failed: ${mlErr.message}`);

    // The token pair a still-open tab would hold after the user clicks Delete.
    staleTokens = await signInTokens(leaver.email);

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
    await supabaseAdmin.from('ml_training_sessions').delete().eq('session_code', sessionCode);
    await supabaseAdmin.from('erased_subjects').delete().eq('user_id', leaver.user.id);
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

  // ---------------------------------------------------------------------------
  // Census. Test (a) above asserts a hand-written list of tables — it proves the
  // tables someone thought of. These three derive their list from the catalogue, so a
  // table added later is covered without anyone remembering to add it here.
  // (codex review findings 5, 8 and 9: "an FK census is not a personal-data census",
  //  "GoTrue cleanup assumptions are not tested", "tests do not prove the inventory")
  // ---------------------------------------------------------------------------

  test('census: no column in public that references an identity still holds the erased id', async () => {
    const uid = leaver.user.id;
    const cols = await catalogQuery<{ tbl: string; col: string }>(`
      SELECT con.conrelid::regclass::text AS tbl, a.attname AS col
        FROM pg_constraint con
        JOIN LATERAL unnest(con.conkey) k(attnum) ON true
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE con.contype = 'f'
         AND ns.nspname = 'public'
         AND con.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       ORDER BY 1, 2`);

    // Control (epistemic gate: a probe that returns nothing agrees with every hypothesis).
    expect(cols.length, 'the catalogue returned no FK columns — the probe is blind').toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const { tbl, col } of cols) {
      if (await countWhere(tbl, col, uid) !== 0) offenders.push(`${tbl}.${col}`);
    }
    expect(offenders, 'these columns still carry the erased profile id').toEqual([]);
  });

  test('census: the name-bearing tables with no link to an account are exactly the documented set', async () => {
    // Every text column that can hold a person's name or contact in a table the RPC
    // cannot reach through an account. When this list grows, the spec's "NOT reachable
    // by this mechanism" section is out of date and this test says so.
    const documented = [
      // session-scoped: erased by (session, session-time name) inside the RPC
      'clarity_chat_messages.author_name',
      'clarity_demo_rounds.listener_name',
      'clarity_demo_rounds.speaker_name',
      'clarity_ideas.author_name',
      'clarity_live_turns.actor_name',
      'clarity_live_turns.listener_name',
      'clarity_live_turns.speaker_name',
      'clarity_verifications.verifier_name',
      'ml_training_sessions.user_name',
      // audio: the row goes, the object in GCS does not (spec § NOT reachable)
      'clarity_verifications.audio_url',
      'ml_training_sessions.audio_path',
      // anonymous localStorage identity only, not locatable from an account (spec § NOT reachable)
      'clarity_feed_ideas.originator_name',
      'clarity_idea_comments.author_name',
      'clarity_idea_vote_history.voter_name',
      'clarity_idea_votes.voter_name',
      // not a person
      'organization.name',
    ].sort();

    const rows = await catalogQuery<{ ref: string }>(`
      SELECT (c.relname || '.' || a.attname) AS ref
        FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        JOIN pg_type t ON t.oid = a.atttypid
       WHERE c.relkind = 'r'
         AND t.typname IN ('text', 'varchar', 'bpchar')
         AND a.attname ~ '(_name$|^name$|email|linkedin|audio_path|audio_url|audio_storage_path)'
         AND c.relname <> 'p520_legacy_fk_orphans'
         AND NOT EXISTS (
           SELECT 1 FROM pg_constraint con
            WHERE con.contype = 'f' AND con.conrelid = c.oid
              AND con.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass))
       ORDER BY 1`);

    expect(rows.length, 'the catalogue returned nothing — the probe is blind').toBeGreaterThan(5);
    expect(rows.map((r) => r.ref).sort()).toEqual(documented);
  });

  test('census: no auth-schema table still carries the erased subject id', async () => {
    const uid = leaver.user.id;
    const tables = await catalogQuery<{ relname: string }>(`
      SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'auth'
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped
       WHERE c.relkind = 'r'
       ORDER BY 1`);

    // Control: the enumeration must actually find the GoTrue tables.
    const names = tables.map((t) => t.relname);
    expect(names, 'auth.sessions must be in the enumeration').toContain('sessions');
    expect(names, 'auth.refresh_tokens must be in the enumeration').toContain('refresh_tokens');

    // user_id is uuid on most and varchar on refresh_tokens — compare as text.
    const union = names
      .map((t) => `SELECT '${t}' AS tbl, count(*)::int AS n FROM auth.${t} WHERE user_id::text = '${uid}'`)
      .join(' UNION ALL ');
    const counts = await catalogQuery<{ tbl: string; n: number }>(union);
    const left = counts.filter((r) => r.n > 0).map((r) => `auth.${r.tbl}=${r.n}`);
    expect(left, 'auth rows survived the erasure').toEqual([]);

    // auth.users itself carries the id in `id`, not `user_id`.
    const [{ n: userRows }] = await catalogQuery<{ n: number }>(
      `SELECT count(*)::int AS n FROM auth.users WHERE id = '${uid}'`);
    expect(userRows).toBe(0);
  });

  test('the three replacement FKs are validated, and the orphans that blocked them are recorded', async () => {
    const cons = await catalogQuery<{ conname: string; convalidated: boolean }>(`
      SELECT conname, convalidated FROM pg_constraint
       WHERE conname IN ('points_first_validator_id_fkey','events_host_id_fkey','badge_points_verified_by_fkey')
       ORDER BY 1`);
    expect(cons.length, 'all three constraints must exist').toBe(3);
    expect(cons.filter((c) => !c.convalidated).map((c) => c.conname),
      'a NOT VALID constraint never repairs the integrity defect it inherited').toEqual([]);

    // And nothing was silently thrown away: every id that was nulled is recorded.
    const [{ n }] = await catalogQuery<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.p520_legacy_fk_orphans`);
    expect(n, 'the nulled legacy ids must be recoverable from p520_legacy_fk_orphans').toBeGreaterThan(0);
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
    // Name-only rows: the leaver's own rows are gone, the stayer's untouched (names differ).
    const { data: msgs } = await supabaseAdmin
      .from('clarity_chat_messages').select('author_name').eq('session_id', sessionId);
    expect(msgs!.map((m) => m.author_name)).toEqual([stayer.name]);
    const { data: ml } = await supabaseAdmin
      .from('ml_training_sessions').select('user_name').eq('session_code', sessionCode);
    expect(ml!.map((r) => r.user_name)).toEqual([stayer.name]);

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

  test('live_state was scrubbed by key; the session is cancelled; the audit row exists', async () => {
    const { data: sess } = await supabaseAdmin
      .from('clarity_sessions').select('status, live_state').eq('id', sessionId).single();
    expect(sess!.status).toBe('cancelled');
    expect(sess!.live_state).toEqual({
      checksCount: 1, currentSpeaker: TOMBSTONE, currentListener: stayer.name,
      checkerName: TOMBSTONE, talkTime: { [TOMBSTONE]: 12, [stayer.name]: 30 },
      roleSelections: { [TOMBSTONE]: 'speaker', [stayer.name]: 'listener' },
    });
    expect(JSON.stringify(sess!.live_state)).not.toContain(leaver.name);

    const { data: audit } = await supabaseAdmin
      .from('erased_subjects').select('user_id, same_name_sessions').eq('user_id', leaver.user.id).single();
    expect(audit).toMatchObject({ user_id: leaver.user.id, same_name_sessions: [] });
  });

  test('stale JWT: no new tokens, no writes through the uid-only tables, no live_state patch', async () => {
    // (i) the refresh token died with auth.users — no NEW access token can be minted
    const { error: refreshErr } = await anonClient().auth.refreshSession({ refresh_token: staleTokens.refresh_token });
    expect(refreshErr, 'refresh must fail after erasure').not.toBeNull();

    const stale = bearerClient(staleTokens.access_token);

    // (ii) FK-less table: the profile-existence guard refuses the insert
    const { error: termsErr } = await stale.from('terms_acceptances')
      .insert({ user_id: leaver.user.id, terms_version: 'v1.3-stale' });
    expect(termsErr).not.toBeNull();
    expect(termsErr!.code).toBe('42501');
    expect(await countWhere('terms_acceptances', 'user_id', leaver.user.id)).toBe(0);

    // (iii) FK'd table: refused (RLS or FK — either way nothing lands)
    const { error: storyErr } = await stale.from('stories')
      .insert({ author_id: leaver.user.id, content: 'ghost story', visibility: 'public' });
    expect(storyErr).not.toBeNull();
    expect(await countWhere('stories', 'author_id', leaver.user.id)).toBe(0);

    // (iv) patch_live_state: the session is cancelled and the caller is nobody's id → no row touched
    const { error: patchErr } = await stale.rpc('patch_live_state', {
      p_session_id: sessionId, p_patch: { currentSpeaker: leaver.name },
    });
    expect(patchErr).toBeNull(); // the RPC is void; refusal is a zero-row update
    const { data: after } = await supabaseAdmin.from('clarity_sessions').select('live_state').eq('id', sessionId).single();
    expect(after!.live_state.currentSpeaker).toBe(TOMBSTONE);

    // (v) documented residual: the stale token can still READ for its lifetime (≤1h)
    const { error: readErr } = await stale.from('points').select('id').limit(1);
    expect(readErr).toBeNull();
  });

  test('race: the counterparty can no longer write into the cancelled session', async () => {
    const other = await userClient(stayer.email);
    const turn = { speaker_name: TOMBSTONE, listener_name: stayer.name, actor_name: stayer.name, role: 'listener', transcript: 'late turn' };

    // Control (gate 7): the identical insert into a LIVE session of the stayer's is accepted,
    // so the refusal below is the cancelled predicate and not a malformed row.
    const live = await createTestSessionInDB(stayer.user.id, 'Guest', { hostName: stayer.name });
    try {
      const { error: okErr } = await other.from('clarity_live_turns').insert({ ...turn, session_id: live.sessionId });
      expect(okErr, `control insert failed: ${okErr?.message}`).toBeNull();
    } finally {
      await live.cleanup();
    }

    const { error: turnErr } = await other.from('clarity_live_turns').insert({ ...turn, session_id: sessionId });
    expect(turnErr, 'live turn insert into a cancelled session must be refused').not.toBeNull();
    expect(turnErr!.code).toBe('42501');

    // Plain UPDATE of live_state (the column clients may write, P1047): on a cancelled
    // session the policy's USING no longer matches → zero rows, value unchanged.
    const ghost = { checksCount: 99, currentSpeaker: leaver.name };
    const live2 = await createTestSessionInDB(stayer.user.id, 'Guest', { hostName: stayer.name });
    try {
      const { data: okRows, error: okErr } = await other.from('clarity_sessions')
        .update({ live_state: ghost }).eq('id', live2.sessionId).select('id');
      expect(okErr, `control update failed: ${okErr?.message}`).toBeNull();
      expect(okRows).toHaveLength(1);
    } finally {
      await live2.cleanup();
    }
    const { data: rows, error: updErr } = await other.from('clarity_sessions')
      .update({ live_state: ghost }).eq('id', sessionId).select('id');
    expect(updErr).toBeNull();
    expect(rows).toHaveLength(0);
    const { data: sess } = await supabaseAdmin.from('clarity_sessions').select('live_state').eq('id', sessionId).single();
    expect(sess!.live_state.currentSpeaker).toBe(TOMBSTONE);
  });
});

test.describe('P520: same-name counterparty — the other person\'s rows are untouched', () => {
  test.describe.configure({ mode: 'serial' });
  const NAME = runName('Twin Person');
  let twinLeaver: TestUser;
  let twinStayer: TestUser;
  let sid: string;
  let cleanup: () => Promise<void>;

  test.beforeAll(async () => {
    twinLeaver = await createTestUser({ name: NAME });
    twinStayer = await createTestUser({ name: NAME });
    const s = await createTestSessionInDB(twinLeaver.user.id, NAME, { hostName: NAME, guestProfileId: twinStayer.user.id });
    sid = s.sessionId; cleanup = s.cleanup;
    const { error } = await supabaseAdmin.from('clarity_chat_messages').insert([
      { session_id: sid, author_name: NAME, content: 'from the leaver' },
      { session_id: sid, author_name: NAME, content: 'from the stayer' },
    ]);
    if (error) throw new Error(`chat seed failed: ${error.message}`);
  });

  test.afterAll(async () => {
    await cleanup?.();
    await supabaseAdmin.from('erased_subjects').delete().eq('user_id', twinLeaver.user.id);
    await deleteTestUser(twinStayer.user.id);
    await deleteTestUser(twinLeaver.user.id);
  });

  test('ambiguous name-only rows are left alone and the session is recorded for the founder', async () => {
    const me = await userClient(twinLeaver.email);
    const { data, error } = await me.rpc('erase_my_account');
    expect(error, error?.message).toBeNull();
    expect(data.same_name_sessions).toEqual([sid]);

    // Both chat rows survive — neither can be attributed.
    expect(await countWhere('clarity_chat_messages', 'session_id', sid)).toBe(2);
    // The id-bearing columns are still cleared.
    const { data: sess } = await supabaseAdmin
      .from('clarity_sessions').select('creator_profile_id, creator_name, joiner_profile_id, joiner_name, status').eq('id', sid).single();
    expect(sess).toMatchObject({
      creator_profile_id: null, creator_name: TOMBSTONE,
      joiner_profile_id: twinStayer.user.id, joiner_name: NAME, status: 'cancelled',
    });
    const { data: audit } = await supabaseAdmin
      .from('erased_subjects').select('same_name_sessions').eq('user_id', twinLeaver.user.id).single();
    expect(audit!.same_name_sessions).toEqual([sid]);
    expect(await countWhere('profiles', 'id', twinStayer.user.id)).toBe(1);
  });
});

test.describe('P520: live_state scrub survives hostile display names', () => {
  test.describe.configure({ mode: 'serial' });
  // quote, backslash, LIKE wildcards, non-ASCII — every character the old textual replace tripped on
  const NAME = runName('O"Bri\\en 100% _x Ñandú');
  let hostile: TestUser;
  let partner: TestUser;
  let sid: string;
  let cleanup: () => Promise<void>;

  test.beforeAll(async () => {
    hostile = await createTestUser({ name: NAME });
    partner = await createTestUser({ name: runName('Plain Partner') });
    const s = await createTestSessionInDB(hostile.user.id, partner.name, { hostName: NAME, guestProfileId: partner.user.id });
    sid = s.sessionId; cleanup = s.cleanup;
    const { error } = await supabaseAdmin.from('clarity_sessions').update({
      live_state: {
        checksCount: 0, currentSpeaker: NAME, proverName: NAME, skippedBy: partner.name,
        sliderRatings: { [NAME]: 7, [partner.name]: 9 },
        selectedStoryData: { authorName: NAME, authorSlug: hostile.slug, authorAvatarUrl: 'https://x/a.png', id: 'story-x' },
      },
    }).eq('id', sid);
    if (error) throw new Error(`live_state seed failed: ${error.message}`);
  });

  test.afterAll(async () => {
    await cleanup?.();
    await supabaseAdmin.from('erased_subjects').delete().eq('user_id', hostile.user.id);
    await deleteTestUser(partner.user.id);
    await deleteTestUser(hostile.user.id);
  });

  test('every name-bearing key is tombstoned, the partner\'s untouched, JSON intact', async () => {
    const me = await userClient(hostile.email);
    const { error } = await me.rpc('erase_my_account');
    expect(error, error?.message).toBeNull();

    const { data: sess } = await supabaseAdmin.from('clarity_sessions').select('live_state, creator_name').eq('id', sid).single();
    expect(sess!.creator_name).toBe(TOMBSTONE);
    expect(sess!.live_state).toEqual({
      checksCount: 0, currentSpeaker: TOMBSTONE, proverName: TOMBSTONE, skippedBy: partner.name,
      sliderRatings: { [TOMBSTONE]: 7, [partner.name]: 9 },
      selectedStoryData: { authorName: TOMBSTONE, authorSlug: null, authorAvatarUrl: null, id: 'story-x' },
    });
    expect(JSON.stringify(sess!.live_state)).not.toContain('Bri');
  });
});
