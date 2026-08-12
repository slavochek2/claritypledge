/**
 * @file p1053-claim-joiner-seat.spec.ts
 * @description Canaries for P1053: joining a `clarity_sessions` room has no server-side
 * authorization. The only occupancy check in the product today is client-side JavaScript
 * (`joinClaritySession`, `src/app/data/api.ts:989`); the database accepts any UPDATE that
 * sets `joiner_name` / `joiner_profile_id`, from any caller, on any reachable row.
 *
 * The fix (spec Solution) is two mechanisms that must land TOGETHER:
 *   1. `claim_joiner_seat(p_code, p_joiner_name)` — SECURITY DEFINER, checks vacancy and
 *      writes joiner_name + joiner_profile_id atomically, keyed on the room CODE (founder
 *      decision 2026-08-12, Solution step 4 — the code is the bearer token, never the id).
 *   2. `REVOKE UPDATE (joiner_name, joiner_profile_id) ... FROM anon, authenticated` — without
 *      this the RPC is decorative (spec Risks: "A decorative RPC"): the direct-PATCH path
 *      stays open and the vacancy signal stays forgeable.
 *
 * ============================================================================================
 * READ THIS BEFORE RUNNING: expected pre-fix vs post-fix state
 * ============================================================================================
 * Neither `claim_joiner_seat` nor the REVOKE exist yet (2026-08-12, spec authored, not
 * implemented). Three DISTINCT groups of tests below, by what they depend on:
 *
 *   GROUP A — exploit canaries. MUST FAIL now (the exploit is real and reproducible today),
 *   MUST PASS once both mechanisms land. Direct-PATCH based; do not call claim_joiner_seat.
 *     - "authenticated attacker cannot displace a joiner who already holds the seat" (moved
 *       fixme, Done-When bullet 2)
 *     - "anonymous caller cannot NULL joiner_profile_id..." (seat erasure, bullet 3)
 *     - "a caller holding only the session id cannot claim a free seat via direct PATCH"
 *       (bearer-token half A, bullet 4)
 *     - "attacker cannot clear the vacancy signal via direct UPDATE then claim..." (atomicity)
 *     - "client UPDATE on joiner_name and joiner_profile_id is revoked" (grant check, bullet 8)
 *
 *   GROUP B — RPC-dependent tests. MUST FAIL now with a schema/function-not-found error
 *   (PGRST202), because `claim_joiner_seat` does not exist. MUST PASS once the RPC ships.
 *   A PGRST202 here before the fix is EXPECTED and is not evidence of a broken test.
 *     - "claim_joiner_seat rejects a code the caller does not hold"
 *     - "claim_joiner_seat succeeds when the caller holds the correct code"
 *     - "claim_joiner_seat refuses to claim a seat that is already occupied"
 *     - "control: a signed-in user CAN join a room a previous signed-in joiner left, via
 *       claim_joiner_seat" (bullet 5 — P1047's broken flow, now via the RPC)
 *     - "control: anonymous guest can join via claim_joiner_seat with a NULL profile id"
 *     - "claim_joiner_seat RPC exists and is callable" (bullet 8)
 *
 *   GROUP C — unaffected regression controls. MUST PASS now AND after — these exercise
 *   columns/RPCs the fix does not touch (state, live_state, mode, demo_status,
 *   patch_live_state, service_role, P396 legacy lockdown, creator-writes-joined-room,
 *   departed-participant transcript access). A failure here before the fix means something
 *   else broke first; a failure after means the fix over-tightened (P1047 part 4's exact
 *   failure mode).
 *
 * Every ownership/access assertion re-reads the row through the ADMIN client (or the
 * participant's own JWT for the transcript controls) and asserts the persisted value —
 * never asserts on `error` alone. PostgREST reports RLS denials two ways: USING filters the
 * row out -> HTTP 204, no error, zero rows changed; WITH CHECK / column-privilege rejection
 * -> HTTP 403, error 42501. See e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts
 * for the prior art this file's structure and register are deliberately matched to.
 *
 * Detail (exploit mechanics, live prod counts): .private/docs/security-log.md 2026-08-11.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** A client carrying NO session — PostgREST resolves this to the `anon` role. */
function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A client carrying a real user JWT — PostgREST resolves this to `authenticated`. */
function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

test.describe('P1053: server-side join authorization — claim_joiner_seat + REVOKE', () => {
  let host: TestUser;
  let joiner: TestUser;
  let attacker: TestUser;
  const createdSessionIds: string[] = [];

  /**
   * Seeds a room in the shape 94% of live production rows are in: `target_listener_id IS
   * NULL`, creator = host. Created via the ADMIN client so the seed itself is not what's
   * under test. `occupiedBy` deliberately uses a DIFFERENT test user than the creator —
   * unlike P1047's predecessor, which seeded the seat occupant and the room creator as the
   * SAME test user. The session_transcripts / transcription_jobs SELECT policy is
   * `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`
   * (20260313120000_p495_transcription_tables.sql:71-94): with a shared user, every
   * transcript-access assertion in this file would pass vacuously through the creator
   * branch regardless of what happens to joiner_profile_id, so the exploit canaries below
   * would never actually exercise the joiner branch the defect targets (epistemic gate 7b —
   * the fixture must be able to emit the input the defect needs). `occupiedBy` here always
   * means the JOINER seat specifically.
   */
  async function seedRoom(
    label: string,
    opts: {
      occupiedBy?: TestUser;
      anonymousOccupant?: string;
      ended?: boolean;
      targetListener?: TestUser;
    } = {},
  ) {
    const insert: Record<string, unknown> = {
      code: makeRoomCode(),
      creator_name: `P1053 ${label}`,
      creator_profile_id: host.user.id,
      target_listener_id: opts.targetListener?.user.id ?? null,
      state: {},
    };
    // OCCUPANCY MUST BE STAMPED, NOT IMPLIED (P1053 AD1).
    //
    // The vacancy signal is `joiner_seat_claimed_at`, NOT `joiner_name`. A fixture that
    // seeds {joiner_name, joiner_profile_id} alone produces a row that reads FREE to
    // claim_joiner_seat — so the seizure canary would assert that a free seat cannot be
    // seized, which is not the defect. Green, vacuous, closed. This is epistemic gate 7b:
    // the fixture must be able to emit the input the assertion needs.
    //
    // Every seed below that means "this seat is occupied" therefore stamps the column.
    if (opts.occupiedBy) {
      insert.joiner_name = 'Legitimate Joiner';
      insert.joiner_profile_id = opts.occupiedBy.user.id;
      insert.joiner_seat_claimed_at = new Date().toISOString();
    }
    // An ANONYMOUS occupant: seat held, but no participant id. This is what a real guest
    // practice room looks like once the guest has joined, and it is the only state in which
    // patch_live_state's guest branch (auth.uid() IS NULL AND joiner_profile_id IS NULL AND
    // joiner_name IS NOT NULL) matches — see 20260409140000_fix_guest_patch_live_state.sql.
    if (opts.anonymousOccupant) {
      insert.joiner_name = opts.anonymousOccupant;
      insert.joiner_profile_id = null;
      insert.joiner_seat_claimed_at = new Date().toISOString();
    }
    // `ended_at` is server-written (P1053 Migration A) and gates claim_joiner_seat. Seeded
    // via the admin client because no client role may write it.
    if (opts.ended) {
      insert.ended_at = new Date().toISOString();
      insert.live_state = { sessionEnded: true };
    }
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert(insert)
      .select('id, code, creator_profile_id, joiner_profile_id, joiner_name, joiner_seat_claimed_at, ended_at')
      .single();
    expect(error, `seed failed: ${error?.message}`).toBeNull();
    createdSessionIds.push(data!.id);
    return data!;
  }

  /** Re-reads the row bypassing RLS, so assertions see ground truth. */
  async function readRow(id: string) {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('id, code, creator_profile_id, joiner_profile_id, joiner_name, joiner_seat_claimed_at, ended_at, target_listener_id, state, live_state, mode, demo_status')
      .eq('id', id)
      .single();
    expect(error, `readback failed: ${error?.message}`).toBeNull();
    return data!;
  }

  /** Seeds a stored transcript row via the ADMIN client — service_role writes only. */
  async function seedTranscript(sessionId: string, sessionCode: string) {
    const { data, error } = await supabaseAdmin
      .from('session_transcripts')
      .insert({ session_id: sessionId, session_code: sessionCode, segments: [{ speaker: 'A', text: 'hello' }] })
      .select('id')
      .single();
    expect(error, `transcript seed failed: ${error?.message}`).toBeNull();
    return data!.id as string;
  }

  async function seedTranscriptionJob(sessionId: string, sessionCode: string) {
    const { data, error } = await supabaseAdmin
      .from('transcription_jobs')
      .insert({ session_id: sessionId, session_code: sessionCode, status: 'completed' })
      .select('id')
      .single();
    expect(error, `transcription job seed failed: ${error?.message}`).toBeNull();
    return data!.id as string;
  }

  /**
   * Signs in as a test user via a temp client and returns a JWT-scoped client.
   *
   * MEMOIZED per user. Supabase auth applies a per-project sign-in rate limit, and this
   * file signs in on nearly every test; without the cache the later tests fail with
   * `AuthApiError: Request rate limit reached` — an infrastructure failure that reads
   * exactly like a product failure in the report. The token is only used to select a
   * PostgREST role (`authenticated`) and to populate auth.uid(), neither of which changes
   * across tests, so reusing one token per user is equivalent and removes the flake.
   */
  const signInCache = new Map<string, ReturnType<typeof makeUserClient>>();
  async function signInAs(user: TestUser) {
    const cached = signInCache.get(user.user.id);
    if (cached) return cached;
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email, password: TEST_PASSWORD,
    });
    expect(signInError, `sign-in failed for ${user.email}: ${signInError?.message}`).toBeNull();
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();
    signInCache.set(user.user.id, client);
    return client;
  }

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1053 Host' });
    joiner = await createTestUser({ email: generateTestEmail(), name: 'P1053 Joiner' });
    attacker = await createTestUser({ email: generateTestEmail(), name: 'P1053 Attacker' });
  });

  test.afterAll(async () => {
    // Sessions before users — session_transcripts / transcription_jobs cascade-delete
    // via their `session_id ... ON DELETE CASCADE` FK (20260313120000_p495…:15,34), so
    // no separate cleanup of those tables is needed.
    if (createdSessionIds.length > 0) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    await deleteTestUser(host.user.id);
    await deleteTestUser(joiner.user.id);
    await deleteTestUser(attacker.user.id);
  });

  // ===========================================================================================
  // GROUP A.1 — Seat seizure canary. Moved from p1047's test.fixme (Done-When bullet 2).
  // Ported in intent from the predecessor's test — same admin readback, same failure-message
  // register — but seeded with THREE distinct users (host/joiner/attacker) rather than the
  // predecessor's creator==occupant convention. See seedRoom's doc-comment for why.
  // MUST FAIL until the fix lands.
  // ===========================================================================================

  /**
   * Found by adversarial review of P1047 parts 1-3, and the highest-severity case in this
   * file. session_transcripts / transcription_jobs both gate SELECT on
   * `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()` (verified live on
   * prod). Displacing a seated joiner therefore grants read of that session's stored
   * transcript. Prod counts at time of P1047: 113 reachable rows, 64 already holding a real
   * joiner, 20 with a stored transcript.
   *
   * P1047 part 4 attempted a trigger-only fix (`OLD.joiner_profile_id IS NOT NULL` -> raise)
   * and it broke the rejoin-after-leave flow (see the control test below), because
   * clearSessionJoiner leaves joiner_profile_id set on a vacated room. Part 5 reverted it.
   * No trigger can close this correctly, because every vacancy signal a trigger could read
   * (joiner_name, live_state.joinerEnded) is itself client-writable and forgeable in two
   * steps. The fix is the REVOKE — this test proves it, not the trigger.
   */
  test('authenticated attacker cannot displace a joiner who already holds the seat', async () => {
    const row = await seedRoom('seat seizure', { occupiedBy: joiner });
    const attackerClient = await signInAs(attacker);

    // Re-sending the original joiner_name keeps the takeover invisible in the UI.
    await attackerClient
      .from('clarity_sessions')
      .update({ joiner_name: 'Legitimate Joiner', joiner_profile_id: attacker.user.id })
      .eq('id', row.id);

    const after = await readRow(row.id);
    expect(
      after.joiner_profile_id,
      `Attacker ${attacker.user.id} displaced the seated joiner ${joiner.user.id} on ` +
      `session ${row.id} by naming THEMSELVES via a direct PATCH. session_transcripts ` +
      `SELECT is gated on joiner_profile_id = auth.uid(), so this grants read of a private ` +
      `conversation between two other people. Closed by REVOKE UPDATE (joiner_profile_id) ` +
      `FROM anon, authenticated (Solution step 3) — this assertion fails until that REVOKE ` +
      `lands. See 20260811190000_p1047_revert_seat_occupancy_check.sql for why a trigger ` +
      `alone cannot close this.`
    ).toBe(joiner.user.id);
  });

  // ===========================================================================================
  // GROUP A.2 — Seat erasure canary (Done-When bullet 3)
  // ===========================================================================================

  test('anonymous caller cannot NULL joiner_profile_id and strip a joiner\'s transcript access', async () => {
    const row = await seedRoom('seat erasure', { occupiedBy: joiner });
    const transcriptId = await seedTranscript(row.id, row.code);
    const jobId = await seedTranscriptionJob(row.id, row.code);
    const anon = makeAnonClient();

    await anon.from('clarity_sessions').update({ joiner_profile_id: null }).eq('id', row.id);

    const after = await readRow(row.id);
    expect(
      after.joiner_profile_id,
      `An UNAUTHENTICATED caller nulled joiner_profile_id on session ${row.id}, stripping ` +
      `joiner ${joiner.user.id} of SELECT on their own session_transcripts / ` +
      `transcription_jobs rows (both gate on joiner_profile_id = auth.uid(), ` +
      `20260313120000_p495_transcription_tables.sql:70-94). Today this write is NOT ` +
      `guarded at all — the trigger's NULL-vacate branch (` +
      `20260811190000_p1047_revert_seat_occupancy_check.sql) is deliberately open to any ` +
      `caller, and the column stays anon/authenticated-writable pre-fix. Closed by the same ` +
      `REVOKE as the seizure canary above; this assertion fails until it lands.`
    ).toBe(joiner.user.id);

    // Downstream consequence, not just the column write: the joiner must still be able to
    // read their own rows through their OWN JWT client, proving the erasure attempt did not
    // silently degrade their access even in some partial way the column-only check missed.
    const joinerClient = await signInAs(joiner);
    const { data: transcripts, error: transcriptError } = await joinerClient
      .from('session_transcripts').select('id').eq('session_id', row.id);
    expect(transcriptError, `joiner's transcript SELECT errored: ${transcriptError?.message}`).toBeNull();
    expect(
      transcripts?.map(t => t.id),
      `Joiner ${joiner.user.id} lost SELECT on their own session_transcripts row ` +
      `(${transcriptId}) after the erasure attempt.`
    ).toContain(transcriptId);

    const { data: jobs, error: jobError } = await joinerClient
      .from('transcription_jobs').select('id').eq('session_id', row.id);
    expect(jobError, `joiner's transcription_jobs SELECT errored: ${jobError?.message}`).toBeNull();
    expect(jobs?.map(j => j.id)).toContain(jobId);
  });

  // ===========================================================================================
  // GROUP A.3 / B — Bearer-token rule canary (founder decision, Solution step 4, Done-When
  // bullet 4). Two halves: (a) direct PATCH by id [Group A — REVOKE-dependent], (b) the RPC
  // has no id-taking path [Group B — RPC-dependent].
  // ===========================================================================================

  test('a caller holding only the session id cannot claim a free seat via direct PATCH', async () => {
    const row = await seedRoom('bearer id-only');
    const attackerClient = await signInAs(attacker);

    // Attacker never learned `code` — only `id`, which is freely readable because
    // target_listener_id IS NULL exposes the row to anon SELECT (spec Solution step 5,
    // deliberately deferred, not fixed by this spec).
    await attackerClient
      .from('clarity_sessions')
      .update({ joiner_name: 'Uninvited', joiner_profile_id: attacker.user.id })
      .eq('id', row.id);

    const after = await readRow(row.id);
    expect(
      after.joiner_profile_id,
      `Attacker ${attacker.user.id} claimed a FREE seat on session ${row.id} using only the ` +
      `row's id. Founder decision 2026-08-12 (spec Solution step 4) makes the room CODE the ` +
      `sole bearer token for claiming a seat — the id must carry no join power once client ` +
      `UPDATE on joiner_name/joiner_profile_id is revoked (Solution step 3). This assertion ` +
      `fails until that REVOKE lands; today this call shape is exactly what ` +
      `joinClaritySession sends (src/app/data/api.ts:1001), just keyed on code instead of id ` +
      `— an attacker only needs to swap .eq('code', ...) for .eq('id', ...) to bypass the ` +
      `intended capability model.`
    ).toBeNull();
  });

  test('claim_joiner_seat rejects a code the caller does not hold', async () => {
    const row = await seedRoom('bearer wrong-code');
    const attackerClient = await signInAs(attacker);

    // Shape 1: the raw id in place of a code. The RPC signature (Solution step 4) is
    // claim_joiner_seat(p_code, p_joiner_name) — there is no p_id parameter to fall back to,
    // so a caller who only has the id has no path in at all.
    const { error: idAsCodeError } = await attackerClient.rpc('claim_joiner_seat', {
      p_code: row.id,
      p_joiner_name: 'Uninvited',
    });
    expect(
      idAsCodeError,
      `claim_joiner_seat accepted session ${row.id}'s raw id in place of p_code and did not ` +
      `error. The founder decision requires the RPC have no id-taking path — an id must never ` +
      `resolve to a claimable session.`
    ).not.toBeNull();

    // Shape 2: a well-formed but wrong code (belongs to no session at all).
    const wrongCode = makeRoomCode();
    const { error: wrongCodeError } = await attackerClient.rpc('claim_joiner_seat', {
      p_code: wrongCode,
      p_joiner_name: 'Uninvited',
    });
    expect(
      wrongCodeError,
      `claim_joiner_seat accepted a code (${wrongCode}) that belongs to no session and did ` +
      `not error.`
    ).not.toBeNull();

    const after = await readRow(row.id);
    expect(
      after.joiner_profile_id,
      `Session ${row.id} acquired a joiner despite neither RPC call using its real code.`
    ).toBeNull();
  });

  test('claim_joiner_seat succeeds when the caller holds the correct code', async () => {
    const row = await seedRoom('bearer correct-code');
    const attackerClient = await signInAs(attacker); // "attacker" here is simply the joiner — this is the legitimate join path

    const { error } = await attackerClient.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'Legitimate Second Party',
    });
    expect(error, `claim_joiner_seat rejected a caller holding the correct code: ${error?.message}`).toBeNull();

    const after = await readRow(row.id);
    expect(after.joiner_profile_id, 'Seat was not claimed despite a successful RPC call.').toBe(attacker.user.id);
    expect(after.joiner_name).toBe('Legitimate Second Party');
  });

  /**
   * Inferred from Solution step 2 ("Checks vacancy and writes ... atomically"), not a
   * literal Done-When bullet — flagged per epistemic gate 8. Necessary because
   * claim_joiner_seat is SECURITY DEFINER: it runs as its owner and is therefore NOT
   * subject to the client column REVOKE at all. If the RPC's own vacancy check is missing
   * or wrong, the REVOKE closes the direct-PATCH seizure path (test above) while leaving
   * the RPC itself as an equally effective seizure path — the exact "decorative RPC"
   * failure mode the spec's Risks section names, just inverted (a live RPC instead of a
   * dead one).
   */
  test('claim_joiner_seat refuses to claim a seat that is already occupied', async () => {
    const row = await seedRoom('bearer occupied', { occupiedBy: joiner });
    const attackerClient = await signInAs(attacker);

    const { error } = await attackerClient.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'Legitimate Joiner', // resending the original name keeps a takeover invisible in the UI
    });
    expect(
      error,
      `claim_joiner_seat let attacker ${attacker.user.id} claim session ${row.id} via the ` +
      `RPC even though joiner ${joiner.user.id} already held the seat. This is the SAME ` +
      `seizure the moved canary above closes via the REVOKE — but claim_joiner_seat is ` +
      `SECURITY DEFINER and therefore bypasses that REVOKE entirely, so the RPC must check ` +
      `vacancy itself (Solution step 2).`
    ).not.toBeNull();

    const after = await readRow(row.id);
    expect(after.joiner_profile_id).toBe(joiner.user.id);
  });

  // ===========================================================================================
  // GROUP A.4 — Atomicity canary (Solution step 2, Problem section's named two-step bypass)
  // ===========================================================================================

  test('attacker cannot clear the vacancy signal via direct UPDATE then claim across two statements', async () => {
    const row = await seedRoom('atomicity', { occupiedBy: joiner });
    const attackerClient = await signInAs(attacker);

    // Statement 1: clear the vacancy signal directly. This is the exact bypass named in the
    // spec's Problem section root-cause paragraph: "clear the signal, then claim."
    await attackerClient.from('clarity_sessions').update({ joiner_name: null }).eq('id', row.id);

    const afterClear = await readRow(row.id);
    expect(
      afterClear.joiner_name,
      `Attacker ${attacker.user.id} cleared joiner_name on session ${row.id} via a direct ` +
      `UPDATE — the first half of the two-step bypass the spec names by name. Solution ` +
      `step 3 revokes client UPDATE on joiner_name specifically to close this; this ` +
      `assertion fails until that REVOKE lands. Today clearSessionJoiner (api.ts:1235) ` +
      `proves this exact write shape succeeds for a LEGITIMATE caller, which is precisely ` +
      `why the vacancy signal is forgeable by an illegitimate one too.`
    ).toBe('Legitimate Joiner');

    // Statement 2 (only reachable if statement 1 above somehow persisted — belt and braces,
    // proves the exploit is closed end-to-end and not just at the first half).
    await attackerClient
      .from('clarity_sessions')
      .update({ joiner_name: 'Uninvited', joiner_profile_id: attacker.user.id })
      .eq('id', row.id);

    const after = await readRow(row.id);
    expect(
      after.joiner_profile_id,
      `Attacker completed the two-statement bypass on session ${row.id}: clear the vacancy ` +
      `signal, then claim.`
    ).toBe(joiner.user.id);
  });

  // ===========================================================================================
  // GROUP B — Rejoin-after-leave control (Done-When bullet 5). MUST STAY GREEN post-fix — this
  // is the EXACT flow P1047 part 4 broke and part 5 had to revert.
  // ===========================================================================================

  test('control: a signed-in user CAN join a room a previous signed-in joiner left, via claim_joiner_seat', async () => {
    const row = await seedRoom('rejoin after leave', { occupiedBy: joiner });

    // TEST UPDATED FOR AN INTENTIONAL SPEC CHANGE (Build Sequence step 6) — called out
    // explicitly per .claude/rules/tests.md rather than changed quietly.
    //
    // This previously simulated the PRE-P1053 clearSessionJoiner write shape: null
    // joiner_name, leave joiner_profile_id set. That is no longer what "the joiner left"
    // means. Post-fix the leave path is release_joiner_seat, which additionally clears
    // joiner_seat_claimed_at — the actual vacancy signal. A fixture that nulls only
    // joiner_name leaves the seat stamped as occupied, so claim_joiner_seat correctly
    // refuses the next joiner and this control fails against a CORRECT implementation.
    //
    // joiner_profile_id is still deliberately left set: the departed participant keeps
    // transcript access. That half of the contract is unchanged and is what the
    // departed-participant control below asserts.
    await supabaseAdmin
      .from('clarity_sessions')
      .update({
        joiner_name: null,
        joiner_seat_claimed_at: null,
        live_state: { joinerEnded: true, joinerEndedAt: new Date().toISOString() },
      })
      .eq('id', row.id);

    // CONTRACT NARROWED BY ADVERSARIAL REVIEW FINDING F1 [FOUNDER DECISION 2026-08-12].
    //
    // This control used to seat `attacker` here and assert success — i.e. it asserted that
    // ANY signed-in user may take a room a previous signed-in joiner left. That is the
    // exploit: joiner_profile_id is a single slot and the transcript policies key on it, so
    // the new claimer inherits the departed participant's stored conversation and the
    // departed participant loses their own. Reproduced, then closed by
    // 20260812170000_p1053_bind_participation_on_claim.sql. See the F1 canaries above.
    //
    // The legitimate flow underneath — the one P1047 part 4 broke and part 5 reverted — is
    // the SAME person returning after a disconnect or refresh. That is what this now asserts,
    // and it is still keyed off the vacancy signal (joiner_seat_claimed_at), never off
    // joiner_profile_id alone, so the original regression stays covered.
    const returningJoiner = await signInAs(joiner);
    const { error } = await returningJoiner.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'First Joiner',
    });

    expect(
      error,
      `The ORIGINAL signed-in joiner could not return to their own room after leaving, via ` +
      `claim_joiner_seat: ${error?.message}. This is the flow P1047 part 4 broke ` +
      `(20260811180000_p1047_seat_occupancy_and_identifier_lockdown.sql) and part 5 had to ` +
      `revert (20260811190000_p1047_revert_seat_occupancy_check.sql). A vacancy check keyed ` +
      `off "joiner_profile_id IS NOT NULL means occupied" rejects this legitimate rejoin, ` +
      `because release_joiner_seat deliberately leaves joiner_profile_id set. The check must ` +
      `key off joiner_seat_claimed_at.`
    ).toBeNull();

    const after = await readRow(row.id);
    expect(after.joiner_profile_id).toBe(joiner.user.id);
    expect(after.joiner_name).toBe('First Joiner');
    expect(after.joiner_seat_claimed_at).not.toBeNull();
  });

  // ===========================================================================================
  // GROUP C — Anonymous practice-room controls + legacy/creator controls. Ported from
  // e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts. MUST STAY GREEN both
  // before and after the fix, EXCEPT the guest-join test, which moves onto the new RPC and so
  // follows Group B's before/after pattern (noted per-test below).
  // ===========================================================================================

  test('control: anonymous guest can join via claim_joiner_seat with a NULL profile id', async () => {
    // Group B, not C: pre-fix this fails with PGRST202 because claim_joiner_seat does not
    // exist yet. Kept in this section because it is conceptually one of the "six anonymous
    // practice-room controls" the spec's Done-When groups together — the RPC dependency is
    // the only thing that separates its before/after behavior from its five siblings below.
    const row = await seedRoom('control guest join');
    const anon = makeAnonClient();

    const { error } = await anon.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'Guest Practitioner',
    });
    expect(error, `Anonymous guest join via claim_joiner_seat must work: ${error?.message}`).toBeNull();

    const after = await readRow(row.id);
    expect(after.joiner_name).toBe('Guest Practitioner');
    expect(after.joiner_profile_id).toBeNull();
  });

  test('control: anonymous guest can still write state (api.ts updateClaritySessionState)', async () => {
    const row = await seedRoom('control state');
    const anon = makeAnonClient();

    const { error } = await anon.from('clarity_sessions').update({ state: { step: 'reflect' } }).eq('id', row.id);
    expect(error, `Guest state write must keep working: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect(after.state).toEqual({ step: 'reflect' });
  });

  test('control: anonymous guest can still write live_state + mode (api.ts updateLiveState)', async () => {
    const row = await seedRoom('control live_state');
    const anon = makeAnonClient();

    const { error } = await anon
      .from('clarity_sessions')
      .update({ live_state: { ratingPhase: 'waiting' }, mode: 'live' })
      .eq('id', row.id);
    expect(error, `Guest live_state write must keep working: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect(after.live_state).toEqual({ ratingPhase: 'waiting' });
    expect(after.mode).toBe('live');
  });

  test('control: anonymous guest can still write demo_status (api.ts updateDemoStatus)', async () => {
    const row = await seedRoom('control demo_status');
    const anon = makeAnonClient();

    const { error } = await anon.from('clarity_sessions').update({ demo_status: 'in_progress' }).eq('id', row.id);
    expect(error, `Guest demo_status write must keep working: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect(after.demo_status).toBe('in_progress');
  });

  test('control: anonymous guest can still call patch_live_state RPC', async () => {
    // Seeded as an ANONYMOUSLY-OCCUPIED room, not a vacant one. patch_live_state's guest
    // branch is `auth.uid() IS NULL AND joiner_profile_id IS NULL AND joiner_name IS NOT
    // NULL` (20260409140000_fix_guest_patch_live_state.sql). On a vacant room all three
    // branches are false, the inner UPDATE matches zero rows, `merged` stays NULL, and the
    // function returns void WITHOUT raising — so the RPC silently no-ops and the assertion
    // on the persisted value below fails. That is a fixture defect, not a product
    // regression: this control is about a guest who has already taken the seat.
    const row = await seedRoom('control rpc', { anonymousOccupant: 'Guest Practitioner' });
    const anon = makeAnonClient();

    const { error } = await anon.rpc('patch_live_state', {
      p_session_id: row.id,
      p_patch: { checkerSubmitted: true },
    });
    expect(error, `Guest patch_live_state RPC must keep working: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect((after.live_state as Record<string, unknown>)?.checkerSubmitted).toBe(true);
  });

  test('control: service_role can still reassign joiner_profile_id directly (admin + E2E tooling)', async () => {
    const row = await seedRoom('control service_role');

    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_profile_id: joiner.user.id })
      .eq('id', row.id);
    expect(error, `service_role must stay exempt from the column revoke: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect(after.joiner_profile_id).toBe(joiner.user.id);
  });

  /**
   * Gate 7b: the test DB has ~0 null-creator rows while prod (as of P1047) had 112/239, so
   * this test seeds the shape explicitly. Pins the boundary between P396's legacy lockdown
   * and P1053's join-authorization work — the two are easy to conflate (P1047 part 3 did,
   * see 20260811170000_p1047_restore_creator_not_null_check.sql), and conflating them is
   * what produces a wrong migration.
   */
  test('control: legacy null-creator row stays locked to anonymous callers (P396)', async () => {
    const { data: seed, error: seedError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: makeRoomCode(), creator_name: 'P1053 null-creator room', creator_profile_id: null, target_listener_id: null, state: {} })
      .select('id')
      .single();
    expect(seedError, `seed failed: ${seedError?.message}`).toBeNull();
    createdSessionIds.push(seed!.id);

    const anon = makeAnonClient();
    const { error } = await anon.from('clarity_sessions').update({ state: { step: 'guest-wrote-this' } }).eq('id', seed!.id);
    expect(
      error,
      `An anonymous caller wrote state to a legacy null-creator row (${seed!.id}). P396 ` +
      `removed the null-creator branch specifically to prevent this; if this assertion ` +
      `fails, that lockdown has been dropped again — P1053's join-authorization work must ` +
      `not touch it.`
    ).not.toBeNull();

    const after = await readRow(seed!.id);
    expect(after.state).toEqual({});
  });

  test('control: creator can write state on a room a DIFFERENT user has joined', async () => {
    // Rules out binding joiner_profile_id in a WITH CHECK predicate: WITH CHECK sees only
    // the NEW row, so `joiner_profile_id = auth.uid()` would reject this legitimate write.
    const row = await seedRoom('control creator-writes-joined-room');
    await supabaseAdmin.from('clarity_sessions').update({ joiner_profile_id: attacker.user.id }).eq('id', row.id);

    const creatorClient = await signInAs(host);
    const { error } = await creatorClient
      .from('clarity_sessions')
      .update({ live_state: { ratingPhase: 'revealed' } })
      .eq('id', row.id);
    expect(error, `The creator must be able to write session state on a room joined by another user: ${error?.message}`).toBeNull();

    const after = await readRow(row.id);
    expect(after.live_state).toEqual({ ratingPhase: 'revealed' });
    expect(after.joiner_profile_id).toBe(attacker.user.id);
  });

  // ===========================================================================================
  // Departed-participant transcript access control (spec Risks: "Stripping a departed
  // participant's transcript access"). MUST STAY GREEN both before and after — this is the
  // control that fails if the fix is implemented naively (nulling joiner_profile_id on leave).
  // ===========================================================================================

  test('a departed joiner still SELECTs their own session_transcripts and transcription_jobs rows', async () => {
    const row = await seedRoom('departed transcript access', { occupiedBy: joiner });
    const transcriptId = await seedTranscript(row.id, row.code);
    const jobId = await seedTranscriptionJob(row.id, row.code);

    // Simulate clearSessionJoiner's exact write shape (api.ts:1235): the joiner leaves.
    await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_name: null, live_state: { joinerEnded: true, joinerEndedAt: new Date().toISOString() } })
      .eq('id', row.id);

    const departedClient = await signInAs(joiner);

    const { data: transcripts, error: transcriptError } = await departedClient
      .from('session_transcripts').select('id').eq('session_id', row.id);
    expect(transcriptError, `departed joiner's transcript SELECT errored: ${transcriptError?.message}`).toBeNull();
    expect(
      transcripts?.map(t => t.id),
      `Departed joiner ${joiner.user.id} lost SELECT on their own session_transcripts row ` +
      `(${transcriptId}) after leaving via the clearSessionJoiner shape. This is exactly ` +
      `the naive-fix failure mode the spec's Risks section warns against: nulling ` +
      `joiner_profile_id on leave (instead of only joiner_name) strips this access.`
    ).toContain(transcriptId);

    const { data: jobs, error: jobError } = await departedClient
      .from('transcription_jobs').select('id').eq('session_id', row.id);
    expect(jobError, `departed joiner's transcription_jobs SELECT errored: ${jobError?.message}`).toBeNull();
    expect(jobs?.map(j => j.id)).toContain(jobId);
  });

  // ===========================================================================================
  // Grant/schema existence check (P270 two-client pattern, Done-When bullet 8). A REVOKE that
  // silently no-ops is the P877/P886 failure the spec names explicitly — assert on the
  // persisted value, never only on the presence of an error.
  // ===========================================================================================

  test('claim_joiner_seat RPC exists and is callable', async () => {
    const { error } = await supabaseAdmin.rpc('claim_joiner_seat', {
      p_code: 'ZZZZZZ',
      p_joiner_name: 'schema check',
    });
    // A real business-logic error (e.g. "session not found") is fine and expected — only a
    // PGRST202 "Could not find the function" means the migration was never applied, or the
    // signature doesn't match (p_code, p_joiner_name).
    expect(
      error?.code,
      `claim_joiner_seat is missing from the schema, or its signature doesn't match ` +
      `(p_code, p_joiner_name). Run: supabase db push. Actual error: ${error?.message}`
    ).not.toBe('PGRST202');
  });

  test('client UPDATE on joiner_name and joiner_profile_id is revoked (P270 grant check)', async () => {
    const row = await seedRoom('grant check', { occupiedBy: joiner });
    const anon = makeAnonClient();

    await anon.from('clarity_sessions').update({ joiner_name: 'grant bypass attempt' }).eq('id', row.id);
    await anon.from('clarity_sessions').update({ joiner_profile_id: null }).eq('id', row.id);

    const after = await readRow(row.id);
    expect(
      after.joiner_name,
      `joiner_name is still client-writable on session ${row.id} — a REVOKE that silently ` +
      `no-ops, the exact P877/P886 failure the spec names explicitly (Risks: "A decorative ` +
      `RPC"). Postgres semantics (docs/decisions.md 2026-06-04): a column-level REVOKE is a ` +
      `no-op while the role still holds table-level UPDATE — the migration must DROP the ` +
      `table-level grant, then re-GRANT the remaining columns, same idiom as ` +
      `20260811150000_p1047_bind_update_clarity_sessions.sql.`
    ).toBe('Legitimate Joiner');
    expect(
      after.joiner_profile_id,
      `joiner_profile_id is still client-writable on session ${row.id} after the REVOKE ` +
      `should have landed.`
    ).toBe(joiner.user.id);
  });

  // ===========================================================================================
  // GROUP E — ADVERSARIAL REVIEW FINDING F1 (2026-08-12). Participation is transferable.
  //
  // claim_joiner_seat guards OCCUPANCY (joiner_seat_claimed_at) and then unconditionally
  // writes joiner_profile_id = COALESCE(auth.uid(), joiner_profile_id). release_joiner_seat
  // deliberately leaves joiner_profile_id set so the departed participant keeps transcript
  // access. Those two facts compose into a transfer: once the signed-in joiner leaves, the
  // seat reads free while STILL carrying their participation, and the next signed-in claimer
  // overwrites it — taking their transcript access and stripping the victim's.
  //
  // This is the P1047 part-4 shape repeating: the vacancy check moved to a new column, but
  // the "seat already held by another profile" check that P1047's trigger enforced was never
  // ported into the RPC.
  // ===========================================================================================

  test('F1: a departed signed-in participant cannot have their transcript access taken by the next claimer', async () => {
    const row = await seedRoom('F1 participation transfer', { occupiedBy: joiner });
    await seedTranscript(row.id, row.code);
    await seedTranscriptionJob(row.id, row.code);

    // The seated signed-in joiner leaves, through the real leave path.
    const joinerClient = await signInAs(joiner);
    const { error: releaseError } = await joinerClient.rpc('release_joiner_seat', {
      p_session_id: row.id,
    });
    expect(releaseError, `release failed: ${releaseError?.message}`).toBeNull();

    // Seat is now free but still carries the departed participant — the documented invariant.
    const afterLeave = await readRow(row.id);
    expect(afterLeave.joiner_seat_claimed_at).toBeNull();
    expect(afterLeave.joiner_profile_id).toBe(joiner.user.id);

    // A stranger claims the free seat.
    const attackerClient = await signInAs(attacker);
    await attackerClient.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'Opportunist',
    });

    const after = await readRow(row.id);
    expect(
      after.joiner_profile_id,
      `Attacker ${attacker.user.id} took over participation on session ${row.id} from the ` +
      `departed joiner ${joiner.user.id} simply by claiming the vacated seat. ` +
      `session_transcripts and transcription_jobs both gate SELECT on ` +
      `joiner_profile_id = auth.uid(), so this hands the attacker a stored private ` +
      `conversation AND strips the real participant's access to their own transcript. ` +
      `The occupancy guard checks joiner_seat_claimed_at but the UPDATE overwrites ` +
      `joiner_profile_id unconditionally.`
    ).toBe(joiner.user.id);
  });

  // GROUP E — ADVERSARIAL REVIEW FINDING F2. Anon-release then signed-in-claim.
  //
  // release_joiner_seat's guest branch lets ANY unauthenticated caller holding the session id
  // free an anonymously-held seat. F1's participation guard does not cover this case, because
  // on a guest-held seat joiner_profile_id IS NULL — so the guard is skipped entirely. The
  // attacker evicts the live guest, then claims the vacant seat while signed in, and lands
  // their own uid in joiner_profile_id on a session between a signed-in creator and a guest.
  // Needs no action from the victim at all.
  test('F2: an anon caller cannot free a guest seat and then claim it signed-in to reach the transcript', async () => {
    const row = await seedRoom('F2 laundering', { anonymousOccupant: 'Guest Practitioner' });
    await seedTranscript(row.id, row.code);

    // Step 1 — evict the live guest, unauthenticated.
    const anon = makeAnonClient();
    await anon.rpc('release_joiner_seat', { p_session_id: row.id });

    // Step 2 — take the vacated seat while signed in.
    const attackerClient = await signInAs(attacker);
    await attackerClient.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'Opportunist',
    });

    const { data: attackerRows } = await attackerClient
      .from('session_transcripts')
      .select('id')
      .eq('session_id', row.id);

    expect(
      attackerRows?.length ?? 0,
      `Attacker ${attacker.user.id} laundered an anonymous seat into transcript access on ` +
      `session ${row.id}: release the guest (permitted for any anon id-holder), then claim ` +
      `the vacancy signed-in. F1's participation guard does not fire because a guest seat ` +
      `has joiner_profile_id IS NULL. This reads a private conversation between the creator ` +
      `and a guest who never had an account.`
    ).toBe(0);
  });

  // GROUP E — ADVERSARIAL REVIEW FINDING F3. Letter sessions lose their addressee binding.
  //
  // The clarity_sessions UPDATE policy restricts writes on target_listener_id IS NOT NULL
  // rows to the addressee or the creator. joinClaritySession used to be bound by it via a
  // direct UPDATE. claim_joiner_seat is SECURITY DEFINER, bypasses RLS entirely, and never
  // mentions target_listener_id — so a forwarded link lets anyone take a seat addressed to a
  // named person.
  test('F3: a session addressed to a specific listener cannot be claimed by someone else', async () => {
    const row = await seedRoom('F3 letter session', { targetListener: joiner });

    const attackerClient = await signInAs(attacker);
    await attackerClient.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'Uninvited',
    });

    const after = await readRow(row.id);
    expect(
      after.joiner_profile_id,
      `Attacker ${attacker.user.id} took the joiner seat on session ${row.id}, which is ` +
      `addressed to ${joiner.user.id} via target_listener_id. The RLS UPDATE policy enforced ` +
      `this binding on the old direct-UPDATE path; claim_joiner_seat is SECURITY DEFINER and ` +
      `bypasses RLS without re-deriving the check.`
    ).not.toBe(attacker.user.id);
  });

  test('F1b: the departed participant can still SELECT their transcript after a stranger claims the seat', async () => {
    const row = await seedRoom('F1b transcript retention', { occupiedBy: joiner });
    await seedTranscript(row.id, row.code);

    const joinerClient = await signInAs(joiner);
    await joinerClient.rpc('release_joiner_seat', { p_session_id: row.id });

    const attackerClient = await signInAs(attacker);
    await attackerClient.rpc('claim_joiner_seat', { p_code: row.code, p_joiner_name: 'Opportunist' });

    // The victim reads through their OWN JWT — this is the actual asset, not a column value.
    const { data: victimRows } = await joinerClient
      .from('session_transcripts')
      .select('id')
      .eq('session_id', row.id);
    expect(
      victimRows?.length ?? 0,
      `The departed participant ${joiner.user.id} lost SELECT on their own transcript for ` +
      `session ${row.id} after a stranger claimed the vacated seat.`
    ).toBeGreaterThan(0);

    // And the attacker must NOT be able to read it.
    const { data: attackerRows } = await attackerClient
      .from('session_transcripts')
      .select('id')
      .eq('session_id', row.id);
    expect(
      attackerRows?.length ?? 0,
      `Attacker ${attacker.user.id} can read the stored transcript of a private conversation ` +
      `between two other people on session ${row.id}.`
    ).toBe(0);
  });
});

// =================================================================================================
// Separation-invariant placeholders (Done-When bullet 1). DESIGN UNDECIDED — the spec's
// Solution section is explicit this is a sketch: "Either a distinct column (joiner_left_at, or
// a participants join-table) or an explicit vacancy flag the client cannot forge. Until these
// are separable, no authorization rule can be stated correctly." These fixmes are placeholders
// naming what /architect must decide — they do NOT propose or assert a column name.
// =================================================================================================

test.describe('P1053: occupant vs participant separation invariant — DESIGN UNDECIDED', () => {
  // /architect must, before these can be filled in:
  //   1. Name the mechanism: a distinct column (e.g. a timestamp like joiner_left_at), a
  //      participants join-table, or an explicit vacancy boolean/flag.
  //   2. State which existing signal (if any) it supersedes — joiner_name?
  //      live_state.joinerEnded? Both?
  //   3. Confirm the mechanism is not client-writable directly (same REVOKE idiom as
  //      joiner_name/joiner_profile_id) — otherwise it is forgeable the same two-step way
  //      the current vacancy signals are (see the atomicity canary above).
  // Do NOT invent a column name here and assert against it as if decided — that would
  // encode a design choice this spec has explicitly not made.

  test.fixme('the seat-vacancy signal cannot be forged by a direct client UPDATE', async () => {
    // Once /architect names the mechanism, assert here that:
    //   (a) client UPDATE on that column/flag is revoked or otherwise unforgeable, and
    //   (b) claim_joiner_seat is the only writer that can flip it vacant -> occupied.
  });

  test.fixme('a participant record survives seat vacancy — occupant and participant are independently readable', async () => {
    // Once the mechanism is named, assert that clearing OCCUPANCY (leaving the seat) does
    // NOT clear the PARTICIPANT record that session_transcripts / transcription_jobs SELECT
    // policies key off. This should subsume and formalize "a departed joiner still SELECTs
    // their own session_transcripts and transcription_jobs rows" above, asserting directly
    // against the new column/table instead of inferring correctness from joiner_profile_id
    // merely staying set.
  });
});
