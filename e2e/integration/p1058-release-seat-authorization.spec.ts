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
 * THAT PREMISE IS CLOSED (P1302). The policy quoted above is gone: a room is reachable by its
 * parties, or by a caller presenting its code. The reachability canary below is therefore
 * INVERTED — it now asserts that an anon caller holding no code reads nothing, and stands as the
 * regression guard for it. The F4 tests that follow still hand the attacker the session id from
 * the fixture, so they keep testing release_joiner_seat's own authorization rather than leaning
 * on enumeration to supply the id.
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
  const createdEventIds: string[] = [];

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
      // event_practice_rooms.session_id is ON DELETE SET NULL, so practice rooms must go
      // first or they linger pointing at nothing.
      await supabaseAdmin.from('event_practice_rooms').delete().in('session_id', createdSessionIds);
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    if (createdEventIds.length > 0) {
      await supabaseAdmin.from('events').delete().in('id', createdEventIds);
    }
    if (host) await deleteTestUser(host.user.id);
    if (seatedUser) await deleteTestUser(seatedUser.user.id);
  });

  // ── 1. REACHABILITY ────────────────────────────────────────────────────────────────────

  test('an anonymous caller can NOT read the id of a non-addressed room it holds no code for (P1302)', async () => {
    // This test used to assert the opposite: it pinned F4's premise that room ids were enumerable
    // by anyone. P1302 closed that — an open room is reachable by anon only with its code — so
    // the premise is now a regression guard. The F4 tests below still hand the attacker the id
    // from the fixture, so they keep testing release_joiner_seat's own authorization.
    const room = await seedRoom('reachability', { guestName: 'Guest A' });

    // No code is used here — this is a blind listing, which is exactly what enumeration means.
    const anon = makeAnonClient();
    const { data, error } = await anon
      .from('clarity_sessions')
      .select('id')
      .eq('id', room.id);

    expect(error, `anon select errored: ${error?.message}`).toBeNull();
    expect(data ?? [], 'anon enumerated a room id it holds no code for — P1302 has regressed').toEqual([]);
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

  // ── 7. THE FIX: the code is what authorizes an anonymous release ───────────────────────
  //
  // Everything above asserts a REFUSAL. A gate whose whole fixture is inputs it should reject
  // has an unmeasured false-positive rate (epistemic.md 7c) — and the failure mode that costs
  // most here is not a surviving exploit, it is a guest who can no longer leave a room. The
  // next three tests are the positive controls: the legitimate flows must still work.

  test('POSITIVE CONTROL: a guest holding the room code CAN release their own seat', async () => {
    const room = await seedRoom('fix-positive', { guestName: 'Legitimate Guest' });

    const anon = makeAnonClient();
    const { error } = await anon.rpc('release_joiner_seat', {
      p_session_id: room.id,
      p_code: room.code,
    });

    const after = await readRow(room.id);
    expect(
      after.joiner_seat_claimed_at,
      `GUEST LEAVE IS BROKEN: a guest passing the correct code could not vacate their own ` +
        `seat (rpc error: ${error?.message ?? 'none'}). This is the P886 shape — a gate ` +
        'narrower than the flow it guards.',
    ).toBeNull();
    expect(after.joiner_name, 'the guest name should be cleared by a legitimate release').toBeNull();
  });

  // The SIGNED-IN arm's positive control deliberately lives elsewhere. It needs an
  // authenticated client, and this file's whole point is that it performs zero sign-ins (see
  // the header — the P1053 suite exhausted the per-project auth rate limit once already).
  // p1053-claim-joiner-seat.spec.ts already releases a signed-in joiner's seat with
  // p_session_id alone and asserts it succeeds; that is the regression guard for the arm
  // P1058 leaves untouched, and the P1058 Done-When requires that suite to stay green.

  test('a WRONG code is refused — the code is checked, not merely required', async () => {
    // Without this, a fix that accepted any non-null string would pass every other test here.
    const room = await seedRoom('fix-wrong-code', { guestName: 'Guest' });
    const wrong = room.code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';

    const anon = makeAnonClient();
    await anon.rpc('release_joiner_seat', { p_session_id: room.id, p_code: wrong });

    const after = await readRow(room.id);
    expect(
      after.joiner_seat_claimed_at,
      'a WRONG room code released the seat — p_code is being required but not verified',
    ).not.toBeNull();
  });

  // ── 8. THE RESIDUE IS CLOSED (P1314) — this test was inverted on 2026-09-15 ─────────────

  test('RESIDUE CLOSED (P1314): an event practice room code is no longer anon-readable, and F4 does not survive there', async () => {
    // This assertion used to run the other way. As written for P1058 it asserted the residue
    // EXISTED — get_practice_room_codes was granted to anon and returned codes to every
    // visitor of a public event page (P1057 D-A, "a stranger can still join one") — and it
    // carried this instruction: "If it ever starts failing, event-room codes stopped being
    // public and this note should be revisited — a green-turned-red here is good news, not a
    // regression." That is what happened, so the canary is inverted rather than deleted.
    //
    // P1314 found that P1057 D-A had already been reversed as a product decision by P1114 rev2
    // on 2026-08-20 ("gate + split pages, retire the anon room surface") and that the grant was
    // never brought along — so this residue had been accepted on a premise that stopped
    // describing the product nineteen days earlier. Two migrations close it:
    //   D (20260914150000) — get_practice_room_codes requires a signed-in registrant or the host
    //   C (20260915100000) — release_joiner_seat requires the seat secret, not the room code
    // Either one alone breaks the chain below; both are asserted, in the order an attacker
    // would hit them.
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .insert({
        slug: `p1058-residue-${Date.now()}`,
        title: 'P1058 residue canary',
        description: 'Event practice rooms publish their room codes by design (P1057 D-A).',
        datetime: new Date(Date.now() + 86_400_000).toISOString(),
        location: 'Test Location',
        host_id: host.user.id,
      })
      .select('id')
      .single();
    expect(eventError, `event seed failed: ${eventError?.message}`).toBeNull();
    createdEventIds.push(event!.id);

    const room = await seedRoom('residue', { guestName: 'Event Guest' });
    const { error: roomError } = await supabaseAdmin.from('event_practice_rooms').insert({
      event_id: event!.id,
      creator_id: host.user.id,
      session_id: room.id,
      status: 'waiting',
    });
    expect(roomError, `practice room seed failed: ${roomError?.message}`).toBeNull();

    // The seat must carry a SECRET for step 2 to mean anything. seedRoom stamps occupancy but
    // not joiner_seat_secret, and P1314 C falls back to the room code for a seat that holds no
    // secret (a legacy seat, claimed before P1269) — so without this the release below would be
    // correctly ALLOWED and the assertion would read as a regression. Same shape as the
    // occupancy note in seedRoom itself: epistemic gate 7b, a fixture that cannot emit the
    // state under test.
    const { error: secretError } = await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_seat_secret: crypto.randomUUID() })
      .eq('id', room.id);
    expect(
      secretError,
      'could not stamp a seat secret — P1269 (20260911090000) must be applied for this test',
    ).toBeNull();

    // CONTROL — the seat is genuinely occupied right now. Without this the refusals below are
    // indistinguishable from "there was nothing to release" (CLAUDE.md, the all-empty-probe trap).
    const before = await readRow(room.id);
    expect(before.joiner_seat_claimed_at, 'control: the fixture seat must be occupied').not.toBeNull();

    // Step 1 (P1314 D) — an anonymous visitor can no longer learn the code.
    const anon = makeAnonClient();
    const { data: codes, error: codesError } = await anon.rpc('get_practice_room_codes', {
      p_event_id: event!.id,
    });
    expect(
      codesError,
      'the refusal must stay an empty result, never a distinguishable error (P1057)',
    ).toBeNull();
    expect(
      (codes as Array<{ code: string }> | null)?.find((c) => c.code === room.code),
      'an anonymous visitor received an event practice room code — P1314 D has regressed',
    ).toBeUndefined();

    // Step 2 (P1314 C) — and even handed the code directly, the eviction is refused. This is
    // the half that still holds when a code leaks some other way (P1098: a leaked code cannot
    // be revoked), and the reason both migrations exist rather than just D.
    const { error: releaseError } = await anon.rpc('release_joiner_seat', {
      p_session_id: room.id,
      p_code: room.code,
      p_seat_secret: null,
    });
    expect(
      releaseError,
      'the room code alone released a secret-bearing seat — P1314 C has regressed',
    ).not.toBeNull();

    const after = await readRow(room.id);
    expect(
      after.joiner_seat_claimed_at,
      'the seated guest was evicted — the P1058 F4 residue is open again',
    ).not.toBeNull();
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
