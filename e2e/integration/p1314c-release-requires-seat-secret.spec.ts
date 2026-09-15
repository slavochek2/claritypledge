/**
 * P1314 (C) — leaving a seat must require the seat secret, not the room code.
 *
 * The defect this pins: P1269 bound CLAIMING a seat to a per-seat secret and left
 * RELEASING it bound to the room code (P1058). `release_joiner_seat` sets
 * `joiner_seat_claimed_at = NULL`, which is the exact column P1269's occupancy guard is
 * gated on — so release-then-claim walks past a guard that refuses the direct claim.
 * For event practice rooms the code was published to every visitor, so in that room class
 * the release was authorized by a public value.
 *
 * Measured on test 2026-09-15 against the PRE-FIX function: a caller holding only the room
 * code released a seat that was occupied one line earlier — HTTP 204, joiner_name NULL.
 * That run is the reason the refusals below count as evidence rather than as an artefact
 * of how the call is made.
 *
 * THREE CONTROLS, all load-bearing (CLAUDE.md, the all-empty-probe trap):
 *   1. the seat is genuinely occupied at the moment of each refusal — otherwise "refused"
 *      is indistinguishable from "there was nothing to release";
 *   2. the rightful guest CAN still leave with the secret — otherwise a function that
 *      refuses everybody would pass every assertion above it;
 *   3. a legacy seat carrying no secret still releases on the room code — the false-
 *      positive half (`.claude/rules/epistemic.md` gate 7c), and the reason the fallback
 *      is gated on the ROW's column rather than on what the caller chose to send.
 *
 * REQUIRES P1269 (20260911090000) — `clarity_sessions.joiner_seat_secret`. The first test
 * asserts the column is there rather than letting every later assertion fail obscurely.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';

const ANON_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** A fresh anonymous client — the public key that ships in the browser bundle, nothing more. */
const anonClient = () => createClient(ANON_URL, ANON_KEY);

/** Six characters, the length claim_joiner_seat requires. */
const fixtureCode = () => `Q${Date.now().toString().slice(-5)}`;

test.describe('P1314 C — release_joiner_seat requires the seat secret', () => {
  let sessionId: string;
  let code: string;

  test.beforeEach(async () => {
    code = fixtureCode();
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code, creator_name: 'P1314C fixture' })
      .select('id')
      .single();
    expect(error, 'fixture session must insert').toBeNull();
    sessionId = data!.id;
  });

  test.afterEach(async () => {
    // Guarded: when beforeEach fails sessionId is undefined, and an unguarded delete
    // reports a TypeError in teardown that buries the real cause.
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
  });

  /** Claims the seat anonymously and returns the secret the server minted for it. */
  async function claimAsGuest(name: string): Promise<string> {
    const { data, error } = await anonClient().rpc('claim_joiner_seat', {
      p_code: code,
      p_joiner_name: name,
      p_seat_secret: null,
    });
    expect(error, 'the guest join path must keep working anonymously').toBeNull();
    const secret = (data as Array<{ joiner_seat_secret: string }>)[0].joiner_seat_secret;
    expect(secret, 'P1269 mints a secret on every fresh guest claim').toBeTruthy();
    return secret;
  }

  async function seatRow() {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('joiner_name, joiner_seat_claimed_at, joiner_seat_secret, live_state')
      .eq('id', sessionId)
      .single();
    return data!;
  }

  test('PRECONDITION: P1269 is live — clarity_sessions carries joiner_seat_secret', async () => {
    const secret = await claimAsGuest('Precondition Guest');
    expect(secret, 'without P1269 there is no secret to require and this whole suite is vacuous')
      .toMatch(/^[0-9a-f-]{36}$/);
  });

  test('CONTROL: the seat is occupied — so a refusal below is a refusal, not an empty room', async () => {
    await claimAsGuest('Real Guest');
    const row = await seatRow();
    expect(row.joiner_name).toBe('Real Guest');
    expect(row.joiner_seat_claimed_at, 'the occupancy column the guard reads').not.toBeNull();
    expect(row.joiner_seat_secret, 'the seat carries a secret, so the code branch must be unreachable').not.toBeNull();
  });

  test('CONTROL: P1269 still refuses the direct claim — the defect is the path around it', async () => {
    await claimAsGuest('Real Guest');
    const { error } = await anonClient().rpc('claim_joiner_seat', {
      p_code: code,
      p_joiner_name: 'Attacker',
      p_seat_secret: null,
    });
    expect(error?.message, 'P1269 is correct on its own path; this spec covers the path it leaves open')
      .toContain('cannot join this room');
  });

  test('THE DEFECT: a caller holding only the room code cannot release an occupied seat', async () => {
    await claimAsGuest('Real Guest');

    const { error } = await anonClient().rpc('release_joiner_seat', {
      p_session_id: sessionId,
      p_code: code,
    });
    expect(error, 'a published room code must not authorize evicting the seated guest').not.toBeNull();
    expect(error!.message).toContain('not the seated joiner');

    const row = await seatRow();
    expect(row.joiner_name, 'the guest must still be seated').toBe('Real Guest');
    expect(row.joiner_seat_claimed_at, 'joiner_seat_claimed_at must not have been nulled').not.toBeNull();
  });

  test('a WRONG secret is refused, and so is a call carrying neither code nor secret', async () => {
    await claimAsGuest('Real Guest');

    const wrong = await anonClient().rpc('release_joiner_seat', {
      p_session_id: sessionId,
      p_code: code,
      p_seat_secret: '00000000-0000-4000-8000-000000000000',
    });
    expect(wrong.error, 'guessing the secret must not work').not.toBeNull();

    const neither = await anonClient().rpc('release_joiner_seat', { p_session_id: sessionId });
    expect(neither.error, 'the id alone was the P1058 defect and must stay closed').not.toBeNull();

    const row = await seatRow();
    expect(row.joiner_name).toBe('Real Guest');
  });

  test('CONTROL: the rightful guest still leaves with the secret (a function that refuses everyone would pass the tests above)', async () => {
    const secret = await claimAsGuest('Real Guest');

    const { error } = await anonClient().rpc('release_joiner_seat', {
      p_session_id: sessionId,
      p_seat_secret: secret,
    });
    expect(error, 'the anonymous guest leave path must keep working with no account').toBeNull();

    const row = await seatRow();
    expect(row.joiner_name, 'the seat is vacant').toBeNull();
    expect(row.joiner_seat_claimed_at).toBeNull();
    expect(
      (row.live_state as { joinerEnded?: boolean } | null)?.joinerEnded,
      'the creator must still be told the guest left — P1053/P1058 behaviour is unchanged',
    ).toBe(true);
  });

  test('gate 7c: a LEGACY seat carrying no secret still releases on the room code', async () => {
    await claimAsGuest('Legacy Guest');
    // Simulate a seat claimed before P1269 — the only state in which the code branch applies.
    await supabaseAdmin
      .from('clarity_sessions')
      .update({ joiner_seat_secret: null })
      .eq('id', sessionId);

    const before = await seatRow();
    expect(before.joiner_seat_claimed_at, 'control: the legacy seat is occupied').not.toBeNull();
    expect(before.joiner_seat_secret, 'control: and holds no secret').toBeNull();

    const { error } = await anonClient().rpc('release_joiner_seat', {
      p_session_id: sessionId,
      p_code: code,
    });
    expect(error, 'a guest mid-session when this deploys must still be able to leave').toBeNull();
    expect((await seatRow()).joiner_seat_claimed_at).toBeNull();
  });

  test('the fallback is gated on the ROW, not the argument — a secret-bearing seat ignores the code', async () => {
    await claimAsGuest('Real Guest');
    // The attacker-selectable form of the fallback would be "use the secret if one was
    // supplied, else the code". Sending an explicit null secret alongside a valid code is
    // exactly that choice, and it must change nothing.
    const { error } = await anonClient().rpc('release_joiner_seat', {
      p_session_id: sessionId,
      p_code: code,
      p_seat_secret: null,
    });
    expect(error, 'the caller must not be able to select which branch authorizes them').not.toBeNull();
    expect((await seatRow()).joiner_name).toBe('Real Guest');
  });

  test('the anon and authenticated EXECUTE grants are retained (P886: a gate narrower than the flow)', async () => {
    // The grant is asserted by the migration's own DO block against the live catalog; here
    // the observable proof is that an anonymous client reached the function at all in the
    // tests above — a dropped grant would surface as 'permission denied for function'
    // rather than as 'not the seated joiner'.
    const { error } = await anonClient().rpc('release_joiner_seat', { p_session_id: sessionId });
    expect(error!.message, 'a lost grant would read as permission denied, not as a refusal')
      .toContain('not the seated joiner');
  });
});
