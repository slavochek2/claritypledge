/**
 * @file p1058-release-seat-authorization.spec.ts
 * @description P1058 Phase 1 — reproduce or close F4.
 *
 * F4 AS CLAIMED (a reviewer's claim from the P1053 review, never reproduced):
 *   `release_joiner_seat(p_session_id uuid)` is GRANT EXECUTE to `anon` and is keyed on the
 *   session ID, not the room CODE. The anon SELECT policy on clarity_sessions
 *   (`target_listener_id IS NULL OR auth.uid() IN (target_listener_id, creator_profile_id)`,
 *   20260414100001_p703_letter_sourced_live.sql:124) publishes the id of every non-addressed
 *   room to any unauthenticated caller. So an anon caller can enumerate ids and evict seated
 *   guests product-wide.
 *
 * WHAT THESE CANARIES ESTABLISH, in order:
 *   1. REACHABILITY — an anon client can list non-addressed session ids at all. If this fails,
 *      F4's premise is dead regardless of what the function does.
 *   2. THE EVICTION — an anon caller holding ONLY the id (never the code) clears a guest-held
 *      seat. This is the claim itself.
 *   3. THE BOUNDS — the same call against a SIGNED-IN-held seat, and against an ADDRESSED
 *      session, must be refused. These bound the blast radius: if they also succeed, the
 *      finding is far worse than claimed; if they fail, the exposure is guest seats on
 *      non-addressed rooms only.
 *   4. NO DISCLOSURE — the release must leave `joiner_profile_id` untouched. This is what
 *      separates "denial of service" from "transcript disclosure": the transcript SELECT
 *      policy keys on joiner_profile_id, so if a release cannot move it, no data is exposed.
 *
 * Deliberately uses ZERO interactive sign-ins: every attacker here is anon, and every seed
 * and readback goes through the admin client. The P1053 suite exhausted the per-project auth
 * rate limit when run concurrently with another session; this file cannot contribute to that.
 *
 * Assertions read the row back through the ADMIN client and check the persisted value — never
 * `error` alone. PostgREST reports refusal two ways: a USING filter yields 204/zero rows, a
 * WITH CHECK or an explicit RAISE yields an error. Only the row proves what happened.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** A client carrying NO session — PostgREST resolves this to the `anon` role. */
function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

test.describe('P1058 F4: release_joiner_seat authorization', () => {
  let host: TestUser;
  let seatedUser: TestUser;
  const createdSessionIds: string[] = [];

  async function seedRoom(
    label: string,
    opts: { guestName?: string; occupiedBy?: TestUser; targetListener?: TestUser } = {},
  ) {
    const insert: Record<string, unknown> = {
      code: makeRoomCode(),
      creator_name: `P1058 ${label}`,
      creator_profile_id: host.user.id,
      target_listener_id: opts.targetListener?.user.id ?? null,
      state: {},
    };
    // Occupancy is the STAMP, not the name (P1053 AD1). A fixture that omits
    // joiner_seat_claimed_at seeds a row that reads FREE, and release_joiner_seat's WHERE
    // requires `joiner_seat_claimed_at IS NOT NULL` — the canary would then measure a no-op
    // on an empty seat and report it as "refused". Epistemic gate 7b.
    if (opts.guestName) {
      insert.joiner_name = opts.guestName;
      insert.joiner_profile_id = null;
      insert.joiner_seat_claimed_at = new Date().toISOString();
    }
    if (opts.occupiedBy) {
      insert.joiner_name = 'Signed-in Joiner';
      insert.joiner_profile_id = opts.occupiedBy.user.id;
      insert.joiner_seat_claimed_at = new Date().toISOString();
    }
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert(insert)
      .select('id, code, joiner_profile_id, joiner_name, joiner_seat_claimed_at, target_listener_id')
      .single();
    expect(error, `seed failed: ${error?.message}`).toBeNull();
    createdSessionIds.push(data!.id);
    return data!;
  }

  async function readRow(id: string) {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('id, joiner_profile_id, joiner_name, joiner_seat_claimed_at, live_state')
      .eq('id', id)
      .single();
    expect(error, `readback failed: ${error?.message}`).toBeNull();
    return data!;
  }

  test.beforeAll(async () => {
    host = await createTestUser(generateTestEmail('p1058-host'));
    seatedUser = await createTestUser(generateTestEmail('p1058-seated'));
  });

  test.afterAll(async () => {
    if (createdSessionIds.length > 0) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    if (host) await deleteTestUser(host.user.id);
    if (seatedUser) await deleteTestUser(seatedUser.user.id);
  });

  // ── 1. REACHABILITY ────────────────────────────────────────────────────────────────────

  test('an anonymous caller can read the id of a non-addressed room it holds no code for', async () => {
    const room = await seedRoom('reachability', { guestName: 'Guest A' });

    // No code is used here — this is a blind listing, which is exactly what enumeration means.
    const anon = makeAnonClient();
    const { data, error } = await anon
      .from('clarity_sessions')
      .select('id')
      .eq('id', room.id);

    expect(error, `anon select errored: ${error?.message}`).toBeNull();
    expect(
      data,
      'anon could not read the session id — F4 premise (enumerable ids) does not hold',
    ).toHaveLength(1);
  });

  // ── 2. THE EVICTION ────────────────────────────────────────────────────────────────────

  test('F4: an anonymous caller holding only the session id evicts a seated guest', async () => {
    const room = await seedRoom('f4-eviction', { guestName: 'Guest Under Attack' });
    expect(room.joiner_seat_claimed_at, 'fixture must seed an OCCUPIED guest seat').not.toBeNull();

    const anon = makeAnonClient();
    const { error } = await anon.rpc('release_joiner_seat', { p_session_id: room.id });

    const after = await readRow(room.id);

    // The row is the verdict, not the error. If the seat stamp survives, the guard held.
    expect(
      after.joiner_seat_claimed_at,
      `F4 REPRODUCED: an anon caller with only the id cleared the guest's seat stamp ` +
        `(rpc error: ${error?.message ?? 'none'})`,
    ).not.toBeNull();
    expect(after.joiner_name, 'F4 REPRODUCED: guest name cleared by an anon caller').not.toBeNull();
  });

  test('F4 impact: the eviction also raises joinerEnded, which the live UI reads as a departure', async () => {
    const room = await seedRoom('f4-livestate', { guestName: 'Guest Under Attack' });

    const anon = makeAnonClient();
    await anon.rpc('release_joiner_seat', { p_session_id: room.id });

    const after = await readRow(room.id);
    const live = (after.live_state ?? {}) as Record<string, unknown>;
    expect(
      live.joinerEnded,
      'F4 REPRODUCED: an anon caller flipped joinerEnded, signalling a departure the guest never made',
    ).toBeUndefined();
  });

  // ── 3. THE BOUNDS ──────────────────────────────────────────────────────────────────────

  test('bound: an anonymous caller cannot evict a SIGNED-IN seat holder', async () => {
    const room = await seedRoom('f4-bound-signedin', { occupiedBy: seatedUser });

    const anon = makeAnonClient();
    await anon.rpc('release_joiner_seat', { p_session_id: room.id });

    const after = await readRow(room.id);
    expect(
      after.joiner_seat_claimed_at,
      'BLAST RADIUS WIDER THAN CLAIMED: anon evicted a signed-in participant',
    ).not.toBeNull();
    expect(after.joiner_profile_id).toBe(seatedUser.user.id);
  });

  test('bound: an anonymous caller cannot evict the guest on an ADDRESSED session', async () => {
    // F3's guard: `target_listener_id IS NULL OR target_listener_id = auth.uid()`. For an anon
    // caller auth.uid() is NULL, so the second arm is NULL and the whole term requires
    // target_listener_id IS NULL. An addressed room should therefore be untouchable.
    const room = await seedRoom('f4-bound-addressed', {
      guestName: 'Addressed Guest',
      targetListener: seatedUser,
    });

    const anon = makeAnonClient();
    await anon.rpc('release_joiner_seat', { p_session_id: room.id });

    const after = await readRow(room.id);
    expect(
      after.joiner_seat_claimed_at,
      'F3 REGRESSION: anon evicted the seat on an addressed session',
    ).not.toBeNull();
  });

  // ── 4. NO DISCLOSURE ───────────────────────────────────────────────────────────────────

  // ── 5. EVASION: does F4 defeat the P1053 occupancy guard? ──────────────────────────────

  test('EVASION: release-then-claim lets a code-holder take a seat the occupancy guard refuses', async () => {
    // P1053's occupancy guard exists to make a STAMPED seat unclaimable by a newcomer. This
    // chains around it without ever defeating the guard directly:
    //   1. claim as an attacker while the guest is seated  -> must be REFUSED (guard works)
    //   2. release_joiner_seat(id) as anon                 -> unstamps the seat (F4)
    //   3. claim again with the same code + attacker name  -> now the seat reads FREE
    // If step 3 succeeds, the occupancy guard is decorative for any caller who also holds the
    // id — and the id is anon-readable for exactly the rooms the guest arm accepts.
    const room = await seedRoom('f4-evasion', { guestName: 'Original Guest' });
    const anon = makeAnonClient();

    const first = await anon.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Attacker',
    });
    expect(
      first.error,
      'precondition broken: the occupancy guard did not refuse a claim on a held seat',
    ).not.toBeNull();

    await anon.rpc('release_joiner_seat', { p_session_id: room.id });

    const second = await anon.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Attacker',
    });
    const after = await readRow(room.id);

    expect(
      after.joiner_name,
      'EVASION CONFIRMED: anon evicted the guest via release_joiner_seat, then claimed the ' +
        `seat the occupancy guard had just refused (claim error: ${second.error?.message ?? 'none'})`,
    ).toBe('Original Guest');
  });

  // ── 6. complete_clarity_session: the guard is skipped entirely when auth.uid() IS NULL ──

  test('complete_clarity_session is unreachable by anon — the ONLY thing closing its skipped guard', async () => {
    // Its authorization is `IF auth.uid() IS NOT NULL AND NOT EXISTS (...) THEN RAISE`. For any
    // caller with a NULL auth.uid() the refusal is SKIPPED and the session is ended outright.
    // The comment calls that the trusted service_role path — but `anon` also has a NULL uid.
    // Nothing in the function body distinguishes them; only the absence of a GRANT to anon
    // does. This asserts that grant is really absent, by testing the claim rather than reading
    // the ACL. If it ever fails, an unauthenticated caller can end any session by id, and
    // ended_at is what claim_joiner_seat gates on — the room becomes permanently unjoinable.
    const room = await seedRoom('complete-anon', { guestName: 'Guest' });

    const anon = makeAnonClient();
    const { error } = await anon.rpc('complete_clarity_session', { p_session_id: room.id });

    // Read the row FIRST and assert on it. Whether the RPC returned an error is secondary —
    // the question is whether the session actually ended. An earlier version of this test
    // asserted on `error` first and aborted before ever looking at the row, which is the
    // failure mode this whole suite is written to avoid.
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('ended_at, status, live_state')
      .eq('id', room.id)
      .single();

    expect(
      data!.ended_at,
      `an ANON caller ended a live session by id (rpc error: ${error?.message ?? 'none'}) — ` +
        'complete_clarity_session skips its refusal guard whenever auth.uid() IS NULL, and ' +
        'ended_at is what claim_joiner_seat gates on, so the room is now permanently unjoinable',
    ).toBeNull();
    expect(data!.status, 'an anon caller marked a live session completed').not.toBe('completed');
  });

  test('a release never moves joiner_profile_id — the column every transcript policy keys on', async () => {
    // Separates denial-of-service from disclosure. Even where the eviction succeeds, the
    // attacker gains no read: session_transcripts SELECT is
    // `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`, and a release
    // writes joiner_name / joiner_seat_claimed_at / live_state only.
    const room = await seedRoom('f4-no-disclosure', { guestName: 'Guest' });
    const before = await readRow(room.id);

    const anon = makeAnonClient();
    await anon.rpc('release_joiner_seat', { p_session_id: room.id });

    const after = await readRow(room.id);
    expect(after.joiner_profile_id, 'a release moved joiner_profile_id — this is disclosure, not DoS')
      .toBe(before.joiner_profile_id);
  });
});
