/**
 * @file p1047-reproduce-clarity_sessions-update.spec.ts
 * @description Canary for P1047: the clarity_sessions UPDATE policy does not bind the
 * ownership columns for rows whose target is unset — which is the overwhelming majority
 * of live rows. The forgery P1038 was filed to prevent is therefore reachable via a
 * single UPDATE against an EXISTING row, by a caller that never authenticates.
 *
 * Why P1038's canary could not see this: that canary exercises INSERT only, and only
 * as an authenticated attacker. This one must exercise UPDATE as the **anonymous**
 * caller (gate 7b — the fixture must be able to emit the input the defect needs).
 *
 * Two distinct assertion surfaces, because PostgREST reports RLS denials two ways:
 *   - USING filters the row out  -> HTTP 204, NO error, zero rows changed
 *   - WITH CHECK / column-privilege rejection -> HTTP 403, error 42501
 * Asserting on `error` alone would therefore pass vacuously. Every ownership assertion
 * below re-reads the row through the ADMIN client and asserts the persisted value.
 *
 * Detail (live policy text, grants, row-shape counts): .private/docs/security-log.md,
 * "2026-08-10 — THE INSERT FIX IS NOT SUFFICIENT — UPDATE-side forgery".
 *
 * The four forgery tests MUST FAIL until the fix lands.
 * The positive controls MUST PASS both before and after the fix — they are the
 * anonymous practice-room flows the null-target branch exists to serve.
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

test.describe('P1047: clarity_sessions UPDATE — ownership forgery on null-target rows', () => {
  let victim: TestUser;
  let attacker: TestUser;
  const createdSessionIds: string[] = [];

  /**
   * Seeds a row in the shape 94% of live production rows are in:
   * `target_listener_id IS NULL`, owned by the victim. Created via the ADMIN client
   * so the seed itself is not what is under test.
   */
  async function seedVictimSession(label: string) {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: makeRoomCode(),
        creator_name: `P1047 ${label}`,
        creator_profile_id: victim.user.id,
        target_listener_id: null,
        joiner_name: 'guest',
        state: {},
      })
      .select('id, code, creator_profile_id, joiner_profile_id')
      .single();
    expect(error, `seed failed: ${error?.message}`).toBeNull();
    createdSessionIds.push(data!.id);
    return data!;
  }

  /** Re-reads the row bypassing RLS, so assertions see ground truth. */
  async function readRow(id: string) {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('id, creator_profile_id, joiner_profile_id, target_listener_id, joiner_name, joiner_seat_claimed_at, ended_at, state, live_state, mode, demo_status')
      .eq('id', id)
      .single();
    expect(error, `readback failed: ${error?.message}`).toBeNull();
    return data!;
  }

  test.beforeAll(async () => {
    victim = await createTestUser({ email: generateTestEmail(), name: 'P1047 Victim' });
    attacker = await createTestUser({ email: generateTestEmail(), name: 'P1047 Attacker' });
  });

  test.afterAll(async () => {
    if (createdSessionIds.length > 0) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    await deleteTestUser(victim.user.id);
    await deleteTestUser(attacker.user.id);
  });

  // ---------------------------------------------------------------------------
  // FORGERY — these must fail until the fix lands
  // ---------------------------------------------------------------------------

  test('anonymous caller cannot steal creator_profile_id on a null-target row', async () => {
    const row = await seedVictimSession('creator steal');
    const anon = makeAnonClient();

    await anon
      .from('clarity_sessions')
      .update({ creator_profile_id: attacker.user.id })
      .eq('id', row.id);

    const after = await readRow(row.id);
    expect(
      after.creator_profile_id,
      `An UNAUTHENTICATED caller reassigned creator_profile_id on session ${row.id} ` +
      `(code ${row.code}) from victim=${victim.user.id} to attacker=${attacker.user.id}. ` +
      `The row's target_listener_id is NULL, the shape of the overwhelming majority of ` +
      `live production rows.`
    ).toBe(victim.user.id);
  });

  test('anonymous caller cannot orphan creator_profile_id to NULL', async () => {
    const row = await seedVictimSession('creator orphan');
    const anon = makeAnonClient();

    await anon
      .from('clarity_sessions')
      .update({ creator_profile_id: null })
      .eq('id', row.id);

    const after = await readRow(row.id);
    expect(
      after.creator_profile_id,
      `An UNAUTHENTICATED caller nulled creator_profile_id on session ${row.id}, ` +
      `detaching it from its owner. (The WITH CHECK's non-null test should block this ` +
      `specific variant even unfixed — if this assertion fails, the CHECK is not ` +
      `being reached at all.)`
    ).toBe(victim.user.id);
  });

  test('anonymous caller cannot forge joiner_profile_id onto another profile', async () => {
    const row = await seedVictimSession('joiner forge');
    const anon = makeAnonClient();

    await anon
      .from('clarity_sessions')
      .update({ joiner_profile_id: victim.user.id })
      .eq('id', row.id);

    const after = await readRow(row.id);
    expect(
      after.joiner_profile_id,
      `An UNAUTHENTICATED caller set joiner_profile_id=${victim.user.id} on session ` +
      `${row.id}. sessions-service.ts:68 selects history by ` +
      `\`creator_profile_id.eq.X,joiner_profile_id.eq.X\`, so this injects an ` +
      `attacker-controlled session into the victim's own session history.`
    ).toBeNull();
  });

  test('authenticated non-owner cannot steal creator_profile_id on a null-target row', async () => {
    const row = await seedVictimSession('authed steal');

    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: attacker.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const attackerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    await attackerClient
      .from('clarity_sessions')
      .update({ creator_profile_id: attacker.user.id })
      .eq('id', row.id);

    const after = await readRow(row.id);
    expect(
      after.creator_profile_id,
      `Authenticated attacker=${attacker.user.id} reassigned creator_profile_id on ` +
      `session ${row.id} away from victim=${victim.user.id}. This is exactly the ` +
      `attribution forgery P1038 closed on INSERT, reachable here on UPDATE.`
    ).toBe(victim.user.id);
  });

  // ---------------------------------------------------------------------------
  // POSITIVE CONTROLS — the guest practice-room flows the null-target branch serves.
  // These must pass BEFORE and AFTER the fix. If the fix breaks one of these it has
  // over-tightened and taken anonymous practice rooms down with it.
  // ---------------------------------------------------------------------------

  /**
   * The flow part 4's occupancy check is most likely to have broken.
   * clearSessionJoiner (api.ts:1235) nulls joiner_name but deliberately LEAVES
   * joiner_profile_id set — the departed participant still needs it for transcript
   * access. So after a signed-in joiner leaves, the row is `joiner_name = NULL,
   * joiner_profile_id = <departed user>`. joinClaritySession's client-side guard only
   * checks joiner_name, so a second signed-in user proceeds to UPDATE — and hits the
   * trigger with OLD.joiner_profile_id NOT NULL.
   */
  test('control: a signed-in user can join a room a previous signed-in joiner left', async () => {
    const row = await seedVictimSession('rejoin after leave');

    // MIGRATED TO THE RPC (P1053 Build Sequence step 6) — an intentional spec change,
    // called out per .claude/rules/tests.md rather than made quietly. This control used a
    // direct UPDATE of joiner_name/joiner_profile_id; P1053 revokes that grant by design
    // (20260812160000_p1053_revoke_client_joiner_writes.sql). The USER FLOW it guards —
    // rejoin after the previous joiner left — is unchanged and must still work, so the test
    // is rewritten onto claim_joiner_seat, not deleted.

    // Signed-in joiner takes the seat, then leaves via release_joiner_seat's write shape:
    // joiner_name AND joiner_seat_claimed_at cleared, joiner_profile_id deliberately kept
    // so the departed participant retains transcript access.
    await supabaseAdmin
      .from('clarity_sessions')
      .update({
        joiner_name: 'First Joiner',
        joiner_profile_id: victim.user.id,
        joiner_seat_claimed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_name: null, joiner_seat_claimed_at: null })
      .eq('id', row.id);

    // CONTRACT NARROWED BY P1053 ADVERSARIAL REVIEW FINDING F1 [FOUNDER DECISION 2026-08-12].
    // This previously seated `attacker` and asserted success — i.e. that ANY signed-in user
    // may take a room a previous signed-in joiner left. That transfers the departed
    // participant's transcript access to the newcomer, because joiner_profile_id is a single
    // slot and session_transcripts keys on it. Closed by
    // 20260812170000_p1053_bind_participation_on_claim.sql. The legitimate flow underneath —
    // the one part 4 broke and part 5 reverted — is the SAME person returning, which is what
    // this now asserts.
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: victim.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const returningJoiner = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { error } = await returningJoiner.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'First Joiner',
    });

    expect(
      error,
      `The original signed-in joiner could not return to a room they had left. ` +
      `release_joiner_seat clears joiner_name and joiner_seat_claimed_at but leaves ` +
      `joiner_profile_id set, so a vacancy check keyed on joiner_profile_id sees an ` +
      `occupied seat. User-visible symptom: "Session not found or already full", after the ` +
      `mic prompt was already granted. This is the flow P1047 part 4 broke and part 5 reverted.`
    ).toBeNull();

    const after = await readRow(row.id);
    expect(after.joiner_profile_id).toBe(victim.user.id);
  });

  test('control: anonymous guest can still set joiner_name (api.ts joinClaritySession)', async () => {
    const row = await seedVictimSession('control joiner_name');
    const anon = makeAnonClient();

    // MIGRATED TO THE RPC (P1053 Build Sequence step 6) — see the note on the
    // rejoin-after-leave control above. Direct UPDATE of joiner_name is revoked by design;
    // the anonymous practice-room join flow it guards is unchanged and must still work.
    const { error } = await anon.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'Guest Practitioner',
    });

    expect(error, `Guest join must keep working: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect(after.joiner_name).toBe('Guest Practitioner');
    // An anonymous claimer takes a REAL seat with a NULL participant id (P1053 AD4).
    expect(after.joiner_profile_id).toBeNull();
  });

  test('control: anonymous guest can still write state (api.ts updateClaritySessionState)', async () => {
    const row = await seedVictimSession('control state');
    const anon = makeAnonClient();

    const { error } = await anon
      .from('clarity_sessions')
      .update({ state: { step: 'reflect' } })
      .eq('id', row.id);

    expect(error, `Guest state write must keep working: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect(after.state).toEqual({ step: 'reflect' });
  });

  test('control: anonymous guest can still write live_state + mode (api.ts updateLiveState)', async () => {
    const row = await seedVictimSession('control live_state');
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
    const row = await seedVictimSession('control demo_status');
    const anon = makeAnonClient();

    const { error } = await anon
      .from('clarity_sessions')
      .update({ demo_status: 'in_progress' })
      .eq('id', row.id);

    expect(error, `Guest demo_status write must keep working: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect(after.demo_status).toBe('in_progress');
  });

  /**
   * The trigger guarding joiner_profile_id distinguishes callers by `current_user`,
   * which is an assumption about how PostgREST sets the request role — not something
   * the migration can assert about itself. These three controls are what actually
   * falsify it. If `current_user` were NOT the per-request role, the service_role
   * control below fails; if the trigger were SECURITY DEFINER, the anon forgery test
   * above silently passes as a no-op while this suite still reads green.
   */
  test('control: an authenticated user can claim the joiner seat for themselves', async () => {
    const row = await seedVictimSession('control self-claim');

    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: attacker.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const joinerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    // MIGRATED TO THE RPC (P1053 Build Sequence step 6) — see the note on the
    // rejoin-after-leave control above. This is the positive control that stops the fix
    // from degenerating into "deny everything": claiming an EMPTY seat must still succeed.
    // Note the RPC never takes a caller-supplied profile id — it derives the participant
    // from auth.uid(), which is why "name yourself onto someone else's seat" has no
    // expressible form here.
    const { error } = await joinerClient.rpc('claim_joiner_seat', {
      p_code: row.code,
      p_joiner_name: 'Signed-in Joiner',
    });

    expect(error, `A signed-in user must be able to join: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect(after.joiner_profile_id).toBe(attacker.user.id);
  });

  /**
   * Found by adversarial review of parts 1-3, and the highest-severity case in this file.
   *
   * Parts 1-3 stopped an attacker naming SOMEONE ELSE as owner. They did not stop an
   * attacker naming THEMSELVES — and session_transcripts / transcription_jobs both gate
   * SELECT on `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`
   * (verified live on prod). So displacing a seated joiner grants read of that session's
   * stored transcript. On prod: 113 reachable rows, 64 already holding a real joiner,
   * 20 with a stored transcript.
   *
   * The control directly below this one — "an authenticated user can claim the joiner
   * seat for themselves" — is the SAME operation against an EMPTY seat, and it must keep
   * passing. That is the whole difficulty: at the database layer a legitimate join and
   * this attack differ only by whether the seat was already taken.
   */
  // KNOWN OPEN — parked, not passing. Part 4 added an occupancy check that made this
  // pass, and it broke a live flow: clearSessionJoiner leaves joiner_profile_id set on a
  // vacated room, so the next signed-in joiner was rejected with 42501 (see the
  // "previous signed-in joiner left" control below, which caught it). Part 5 reverted the
  // check. No trigger can close this, because every vacancy signal available to it is
  // itself client-writable and therefore forgeable in two steps.
  //
  // The fix is a SECURITY DEFINER claim_joiner_seat RPC plus revoking client UPDATE on
  // joiner_name — server-side join authorization, which P1047's Non-Goals forbid. Tracked
  // in the follow-up spec; this test moved there and had to go green as its canary.
  // Deliberately fixme rather than deleted: the exploit is real and proven, and deleting
  // it would erase the only executable record of it.
  // MOVED: the executable canary now lives in e2e/integration/p1053-claim-joiner-seat.spec.ts

  test('anonymous caller cannot rewrite `code` to re-point a shared join link', async () => {
    const row = await seedVictimSession('code rewrite');
    const anon = makeAnonClient();
    const hijackedCode = makeRoomCode();

    await anon
      .from('clarity_sessions')
      .update({ code: hijackedCode })
      .eq('id', row.id);

    const after = await supabaseAdmin
      .from('clarity_sessions').select('code').eq('id', row.id).single();
    expect(
      after.data?.code,
      `An anonymous caller rewrote the room code on session ${row.id}. Sessions are ` +
      `resolved by code at api.ts:970/1002/1026/1184, so freeing a victim's code and ` +
      `re-claiming it on an attacker-owned row re-points the victim's shared join link.`
    ).toBe(row.code);
  });

  test('control: service_role can still reassign joiner_profile_id (admin + E2E tooling)', async () => {
    const row = await seedVictimSession('control service_role');

    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_profile_id: victim.user.id })
      .eq('id', row.id);

    expect(error, `service_role must stay exempt from the trigger: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect(after.joiner_profile_id).toBe(victim.user.id);
  });

  test('control: creator can write state on a room a DIFFERENT user has joined', async () => {
    // This is the case that rules out binding joiner_profile_id in WITH CHECK: the
    // predicate sees only the NEW row, so `joiner_profile_id = auth.uid()` would
    // reject this legitimate write. The trigger polices the transition instead, so
    // an unchanged joiner_profile_id must not block the creator.
    const row = await seedVictimSession('control creator-writes-joined-room');
    await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_profile_id: attacker.user.id })
      .eq('id', row.id);

    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: victim.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const creatorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { error } = await creatorClient
      .from('clarity_sessions')
      .update({ live_state: { ratingPhase: 'revealed' } })
      .eq('id', row.id);

    expect(
      error,
      `The creator must be able to write session state on a room joined by another ` +
      `user: ${error?.message}`
    ).toBeNull();
    const after = await readRow(row.id);
    expect(after.live_state).toEqual({ ratingPhase: 'revealed' });
    expect(after.joiner_profile_id).toBe(attacker.user.id);
  });

  /**
   * Gate 7b: the test DB has ZERO null-creator rows (0/211) while prod has 112/239, so
   * the fixture cannot emit that shape unless this test seeds it explicitly.
   *
   * This test originally asserted the OPPOSITE — that a null-creator row must stay
   * updatable by an anonymous caller — on the reading that the `creator_profile_id IS
   * NOT NULL` conjunct in WITH CHECK was bricking 112 live prod rows. That was wrong.
   * P396 locks legacy null-creator sessions deliberately, and every one of those 112 rows
   * was created between 2025-12-21 and 2026-02-23, i.e. before the conjunct existed; zero
   * have appeared in the four months since. They are legacy, not live guest rooms.
   * See 20260811170000_p1047_restore_creator_not_null_check.sql.
   *
   * Kept (inverted) rather than deleted, because it pins the boundary between P396's
   * lockdown and P1047's ownership binding — the two are easy to conflate, and conflating
   * them is what produced the wrong migration.
   */
  test('control: legacy null-creator row stays locked to anonymous callers (P396)', async () => {
    const { data: seed, error: seedError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: makeRoomCode(),
        creator_name: 'P1047 null-creator room',
        creator_profile_id: null,
        target_listener_id: null,
        state: {},
      })
      .select('id')
      .single();
    expect(seedError, `seed failed: ${seedError?.message}`).toBeNull();
    createdSessionIds.push(seed!.id);

    const anon = makeAnonClient();
    const { error } = await anon
      .from('clarity_sessions')
      .update({ state: { step: 'guest-wrote-this' } })
      .eq('id', seed!.id);

    expect(
      error,
      `An anonymous caller wrote state to a legacy null-creator row (${seed!.id}). P396 ` +
      `removed the null-creator branch specifically to prevent this; the ` +
      `creator_profile_id IS NOT NULL conjunct in WITH CHECK is what enforces it. If this ` +
      `assertion fails, that conjunct has been dropped again.`
    ).not.toBeNull();

    const after = await readRow(seed!.id);
    expect(after.state).toEqual({});
  });

  test('control: anonymous guest can still call patch_live_state RPC', async () => {
    const row = await seedVictimSession('control rpc');
    const anon = makeAnonClient();

    const { error } = await anon.rpc('patch_live_state', {
      p_session_id: row.id,
      p_patch: { checkerSubmitted: true },
    });

    expect(error, `Guest patch_live_state RPC must keep working: ${error?.message}`).toBeNull();
    const after = await readRow(row.id);
    expect((after.live_state as Record<string, unknown>)?.checkerSubmitted).toBe(true);
  });
});
