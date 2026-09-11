/**
 * @file p1269-guest-seat-forgery.spec.ts
 * @description P1269 — a guest's display name must not be a credential.
 *
 * THE DEFECT. claim_joiner_seat's guest-reclaim arm authorized on the seated guest's
 * display name. `joiner_name` is inside the anon SELECT allowlist, and for event practice
 * rooms the room code is handed to any anonymous caller that names an event id. So a
 * stranger reads the name, re-claims the seat under it, and is treated as that guest.
 *
 * P270 coverage — this file is the integration test for:
 *   - 20260911090000_p1269_guest_seat_secret_and_presence
 *
 * WHAT THESE CANARIES ESTABLISH:
 *   1. THE FORGERY, reproduced first and then closed — an anon caller holding the code and
 *      the seated guest's name takes an OCCUPIED, freshly-present seat.
 *   2. THE REPLACEMENT WORKS — the real guest reclaims with the secret, keeps it, and the
 *      name is irrelevant to whether they get in.
 *   3. THE ABANDONMENT TIMER — a seat with no presence for 15 minutes is free; one that is
 *      two minutes old is not. Both directions, because a timer only tested in the
 *      direction that frees seats is a timer whose false-positive rate is unmeasured
 *      (.claude/rules/epistemic.md gate 7c).
 *   4. LEGACY SEATS DO NOT FAIL OPEN — a seat claimed before this migration carries no
 *      presence column at all, and must fall back to its claim time rather than reading as
 *      abandoned.
 *   5. THE CAPABILITY IS NOT READABLE — if anon can SELECT joiner_seat_secret it is exactly
 *      as forgeable as the name it replaced.
 *   6. THE PRODUCT STILL WORKS — anonymous first join, and signed-in rejoin, both unbroken.
 *
 * Assertions read the row back through the ADMIN client and check the persisted value —
 * never `error` alone (the P1058 convention: only the row proves what happened).
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

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

test.describe('P1269: guest seat ownership is a secret, not a name', () => {
  let host: TestUser;
  let signedInGuest: TestUser;
  const createdSessionIds: string[] = [];

  /**
   * Seeds a room. `seat` describes the guest occupancy directly in DB terms so each canary
   * states the exact precondition it depends on — an omitted joiner_seat_claimed_at seeds a
   * seat that reads FREE, and the canary would then measure an empty seat and report a
   * refusal that never happened (P1058 AD1 / epistemic gate 7b).
   */
  async function seedRoom(
    label: string,
    seat?: {
      guestName: string;
      claimedAt: string;
      /** omit to simulate a LEGACY seat that predates P1269 */
      secret?: string;
      /** omit to simulate a LEGACY seat with no presence column written */
      lastSeenAt?: string;
    },
  ): Promise<{ id: string; code: string }> {
    const code = makeRoomCode();
    const insert: Record<string, unknown> = {
      code,
      creator_name: `P1269 ${label}`,
      creator_profile_id: host.user.id,
      target_listener_id: null,
      state: {},
    };
    if (seat) {
      insert.joiner_name = seat.guestName;
      insert.joiner_profile_id = null;
      insert.joiner_seat_claimed_at = seat.claimedAt;
      if (seat.secret) insert.joiner_seat_secret = seat.secret;
      if (seat.lastSeenAt) insert.joiner_last_seen_at = seat.lastSeenAt;
    }
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert(insert)
      .select('id, code')
      .single();
    expect(error, `seed failed for ${label}: ${error?.message}`).toBeNull();
    createdSessionIds.push(data!.id);
    return { id: data!.id, code: data!.code };
  }

  /** Reads the columns a client role is not allowed to see. */
  async function readSeat(id: string) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('joiner_name, joiner_profile_id, joiner_seat_claimed_at, joiner_seat_secret, joiner_last_seen_at')
      .eq('id', id)
      .single();
    return data!;
  }

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1269 Host' });
    signedInGuest = await createTestUser({ email: generateTestEmail(), name: 'P1269 Signed-in Guest' });
  });

  test.afterAll(async () => {
    for (const id of createdSessionIds) {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', id);
    }
    await deleteTestUser(host.user.id);
    await deleteTestUser(signedInGuest.user.id);
  });

  // ── 1. THE FORGERY ───────────────────────────────────────────────────────────────────
  test('THE DEFECT: an anon caller with the code and the seated guest name cannot take a live seat', async () => {
    const room = await seedRoom('forgery target', {
      guestName: 'Mallory Target',
      claimedAt: new Date().toISOString(),
      secret: crypto.randomUUID(),
      lastSeenAt: new Date().toISOString(), // the real guest is RIGHT THERE
    });
    const before = await readSeat(room.id);

    // The attacker sends exactly what the anon SELECT allowlist and the event-room RPC hand
    // them: the code and the name. No secret.
    const attacker = makeAnonClient();
    await attacker.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Mallory Target',
    });

    const after = await readSeat(room.id);
    expect(
      after.joiner_seat_secret,
      'P1269 NOT FIXED: a name-only anon claim took a live guest seat — the secret was re-minted for the attacker'
    ).toBe(before.joiner_seat_secret);
    expect(
      after.joiner_seat_claimed_at,
      'P1269 NOT FIXED: the seat was re-stamped by a caller presenting only a published name'
    ).toBe(before.joiner_seat_claimed_at);
  });

  // ── 2. THE REPLACEMENT WORKS ─────────────────────────────────────────────────────────
  test('the real guest reclaims with the seat secret, and KEEPS it', async () => {
    const secret = crypto.randomUUID();
    const room = await seedRoom('secret reclaim', {
      guestName: 'Real Guest',
      claimedAt: minutesAgo(3),
      secret,
      lastSeenAt: minutesAgo(1),
    });

    const guest = makeAnonClient();
    const { data, error } = await guest.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Real Guest',
      p_seat_secret: secret,
    });
    expect(error, `the seated guest was refused their own seat: ${error?.message}`).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row, 'claim returned no row').toBeTruthy();
    // Re-minting on reclaim would invalidate the guest's other open tabs.
    expect(row.joiner_seat_secret, 'the secret was re-minted on a legitimate reclaim').toBe(secret);

    const after = await readSeat(room.id);
    expect(after.joiner_seat_secret).toBe(secret);
  });

  test('the NAME is irrelevant: the secret holder gets in under a different name', async () => {
    const secret = crypto.randomUUID();
    const room = await seedRoom('name irrelevant', {
      guestName: 'Original Name',
      claimedAt: minutesAgo(2),
      secret,
      lastSeenAt: minutesAgo(1),
    });

    const guest = makeAnonClient();
    const { error } = await guest.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'A Completely Different Name',
      p_seat_secret: secret,
    });
    expect(error, 'the secret holder was refused because the name differed').toBeNull();
  });

  test('a WRONG secret on a live seat is refused', async () => {
    const room = await seedRoom('wrong secret', {
      guestName: 'Real Guest',
      claimedAt: minutesAgo(2),
      secret: crypto.randomUUID(),
      lastSeenAt: minutesAgo(1),
    });
    const before = await readSeat(room.id);

    const attacker = makeAnonClient();
    await attacker.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Real Guest',
      p_seat_secret: crypto.randomUUID(),
    });

    const after = await readSeat(room.id);
    expect(after.joiner_seat_secret, 'a wrong secret took the seat').toBe(before.joiner_seat_secret);
  });

  // ── 3. THE ABANDONMENT TIMER, BOTH DIRECTIONS ────────────────────────────────────────
  test('a seat with no presence for 15 minutes is free to claim', async () => {
    const room = await seedRoom('abandoned', {
      guestName: 'Vanished Guest',
      claimedAt: minutesAgo(40),
      secret: crypto.randomUUID(),
      lastSeenAt: minutesAgo(16),
    });
    const before = await readSeat(room.id);

    const newcomer = makeAnonClient();
    const { error } = await newcomer.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Newcomer',
    });
    expect(error, `an abandoned seat refused a fresh claim: ${error?.message}`).toBeNull();

    const after = await readSeat(room.id);
    expect(after.joiner_name).toBe('Newcomer');
    // A fresh claim must mint a NEW secret, or the previous holder could still act as the seat.
    expect(after.joiner_seat_secret, 'the abandoned seat kept its old secret').not.toBe(before.joiner_seat_secret);
    expect(after.joiner_seat_secret).toBeTruthy();
  });

  test('FALSE-POSITIVE CONTROL: a seat present 2 minutes ago is NOT free', async () => {
    const room = await seedRoom('still present', {
      guestName: 'Present Guest',
      claimedAt: minutesAgo(30),
      secret: crypto.randomUUID(),
      lastSeenAt: minutesAgo(2),
    });
    const before = await readSeat(room.id);

    const newcomer = makeAnonClient();
    await newcomer.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Newcomer',
    });

    const after = await readSeat(room.id);
    expect(
      after.joiner_name,
      'the abandonment timer fired on a guest who was present 2 minutes ago — it is reading claim time, not presence'
    ).toBe('Present Guest');
    expect(after.joiner_seat_secret).toBe(before.joiner_seat_secret);
  });

  // ── 4. LEGACY SEATS ──────────────────────────────────────────────────────────────────
  test('LEGACY: a pre-P1269 seat claimed 2 minutes ago does NOT fail open', async () => {
    // No secret, no presence — exactly the shape every seat had before this migration.
    const room = await seedRoom('legacy fresh', {
      guestName: 'Legacy Guest',
      claimedAt: minutesAgo(2),
    });

    const attacker = makeAnonClient();
    await attacker.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Legacy Guest',
    });

    const after = await readSeat(room.id);
    expect(
      after.joiner_seat_secret,
      'a legacy seat with no presence column read as abandoned and was taken — presence must fall back to claim time'
    ).toBeNull();
  });

  test('LEGACY: a pre-P1269 seat claimed 40 minutes ago IS free', async () => {
    const room = await seedRoom('legacy stale', {
      guestName: 'Legacy Guest',
      claimedAt: minutesAgo(40),
    });

    const newcomer = makeAnonClient();
    const { error } = await newcomer.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Newcomer',
    });
    expect(error, `a long-abandoned legacy seat stayed stranded: ${error?.message}`).toBeNull();

    const after = await readSeat(room.id);
    expect(after.joiner_name).toBe('Newcomer');
    expect(after.joiner_seat_secret).toBeTruthy();
  });

  // ── 5. THE CAPABILITY IS NOT READABLE ────────────────────────────────────────────────
  test('anon cannot SELECT joiner_seat_secret', async () => {
    const room = await seedRoom('secret hidden', {
      guestName: 'Hidden',
      claimedAt: new Date().toISOString(),
      secret: crypto.randomUUID(),
      lastSeenAt: new Date().toISOString(),
    });

    const anon = makeAnonClient();
    const { data, error } = await anon
      .from('clarity_sessions')
      .select('joiner_seat_secret')
      .eq('id', room.id);

    expect(
      error,
      'anon read joiner_seat_secret — the seat capability is exactly as forgeable as the name it replaced'
    ).not.toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  test('REALTIME: an anon WebSocket subscriber never receives joiner_seat_secret', async () => {
    // Found by adversarial Codex review, 2026-09-11. clarity_sessions is in the
    // supabase_realtime publication with NO column list, and the client subscribes to its
    // UPDATE events (src/app/data/api.ts, the clarity_session:<id> channel). If Realtime
    // shipped the full row, an attacker would subscribe, wait for the guest's 30s presence
    // ping, and read the secret straight off the wire — voiding this entire fix.
    //
    // Measured the same day, both directions, before this canary was written: with the
    // column ungranted the anon payload carries exactly the 21 granted columns and no
    // secret; with `GRANT SELECT (joiner_seat_secret) TO anon` applied, the secret arrives.
    // So Realtime filters by column grant, and that ONE grant is load-bearing for BOTH the
    // REST and the WebSocket surface. The migration asserts it once, at apply time; this
    // canary asserts it on every run, which is what catches a later table-level grant.
    const secret = crypto.randomUUID();
    const room = await seedRoom('realtime surface', {
      guestName: 'Watched Guest',
      claimedAt: new Date().toISOString(),
      secret,
      lastSeenAt: new Date().toISOString(),
    });

    const watcher = makeAnonClient();
    let received: Record<string, unknown> | null = null;
    const channel = watcher
      .channel(`p1269-probe:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'clarity_sessions', filter: `id=eq.${room.id}` },
        (payload) => { received = payload.new as Record<string, unknown>; },
      );

    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('realtime subscribe timed out')), 15_000);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(); }
        });
      });

      // The exact write a seated guest's presence ping produces, every 30 seconds.
      //
      // RE-SENT until an event lands, not fired once. Supabase Realtime can report SUBSCRIBED
      // before the postgres_changes listener is bound server-side, so a single write issued
      // immediately afterwards can be published into that gap and never delivered. Measured
      // 2026-09-11: the first attempt waited the full 15s with no event, the retry received one
      // in 1.8s. Re-sending the STIMULUS does not weaken the ASSERTION — an event must still
      // arrive, and it must still carry no secret. Every ping is a real presence write,
      // byte-identical to what the client sends.
      const pinger = makeAnonClient();
      await expect
        .poll(
          async () => {
            if (received === null) {
              await pinger.rpc('touch_joiner_seat', { p_session_id: room.id, p_seat_secret: secret });
            }
            return received;
          },
          {
            timeout: 20_000,
            intervals: [500, 1_000, 2_000],
            message: 'no realtime UPDATE arrived — without an event this canary proves nothing',
          },
        )
        .not.toBeNull();

      const payload = received as unknown as Record<string, unknown>;
      // A payload DID arrive and carries a column anon is granted — so the probe is live.
      expect(payload.id).toBe(room.id);
      expect(
        Object.prototype.hasOwnProperty.call(payload, 'joiner_seat_secret'),
        'P1269 VOID: the seat secret was broadcast to an anonymous realtime subscriber — anyone can read it off the wire and take the seat'
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(payload, 'joiner_last_seen_at'),
        'joiner_last_seen_at reached an anon subscriber — the column grant is no longer filtering realtime'
      ).toBe(false);
    } finally {
      await watcher.removeChannel(channel);
    }
  });

  test('anon cannot UPDATE joiner_seat_secret or joiner_last_seen_at directly', async () => {
    const secret = crypto.randomUUID();
    const room = await seedRoom('no direct write', {
      guestName: 'Hidden',
      claimedAt: minutesAgo(1),
      secret,
      lastSeenAt: minutesAgo(1),
    });

    const anon = makeAnonClient();
    const chosen = crypto.randomUUID();
    await anon.from('clarity_sessions').update({ joiner_seat_secret: chosen }).eq('id', room.id);
    await anon.from('clarity_sessions').update({ joiner_last_seen_at: minutesAgo(99) }).eq('id', room.id);

    const after = await readSeat(room.id);
    expect(after.joiner_seat_secret, 'anon set a seat secret of its own choosing').toBe(secret);
    expect(
      new Date(after.joiner_last_seen_at as string).getTime(),
      'anon forged presence backwards to expire a live seat'
    ).toBeGreaterThan(Date.now() - 5 * 60_000);
  });

  // ── 6. PRESENCE WRITE ────────────────────────────────────────────────────────────────
  test('touch_joiner_seat refreshes presence for the secret holder, and only for them', async () => {
    const secret = crypto.randomUUID();
    const room = await seedRoom('presence', {
      guestName: 'Present Guest',
      claimedAt: minutesAgo(10),
      secret,
      lastSeenAt: minutesAgo(10),
    });

    const anon = makeAnonClient();
    const { data: wrong } = await anon.rpc('touch_joiner_seat', {
      p_session_id: room.id,
      p_seat_secret: crypto.randomUUID(),
    });
    expect(wrong, 'a wrong secret refreshed someone else\'s presence').toBe(false);

    const afterWrong = await readSeat(room.id);
    expect(new Date(afterWrong.joiner_last_seen_at as string).getTime()).toBeLessThan(Date.now() - 5 * 60_000);

    const { data: right } = await anon.rpc('touch_joiner_seat', {
      p_session_id: room.id,
      p_seat_secret: secret,
    });
    expect(right, 'the secret holder could not refresh their own presence').toBe(true);

    const afterRight = await readSeat(room.id);
    expect(new Date(afterRight.joiner_last_seen_at as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  // ── 7. THE PRODUCT STILL WORKS ───────────────────────────────────────────────────────
  test('an anonymous guest can still take an EMPTY seat and is handed a secret', async () => {
    const room = await seedRoom('empty seat');

    const guest = makeAnonClient();
    const { data, error } = await guest.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'First Guest',
    });
    expect(error, `the anonymous join path is broken: ${error?.message}`).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row.joiner_seat_secret, 'a guest claimed a seat but was handed no secret — they can never reclaim it').toBeTruthy();
    expect(row.joiner_name).toBe('First Guest');
  });

  test('a signed-in joiner can still reclaim their own seat with no secret at all', async () => {
    const room = await seedRoom('signed-in seat');

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email: signedInGuest.email,
      password: TEST_PASSWORD,
    });
    expect(signInError, 'test sign-in failed').toBeNull();

    const first = await client.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Signed In',
    });
    expect(first.error, `signed-in first claim failed: ${first.error?.message}`).toBeNull();

    // Reload / mic retry — same user, no secret involved anywhere.
    const again = await client.rpc('claim_joiner_seat', {
      p_code: room.code,
      p_joiner_name: 'Signed In',
    });
    expect(again.error, `signed-in rejoin was refused: ${again.error?.message}`).toBeNull();

    const after = await readSeat(room.id);
    expect(after.joiner_profile_id).toBe(signedInGuest.user.id);
    expect(after.joiner_seat_secret, 'a signed-in seat was given a guest secret').toBeNull();
  });
});
