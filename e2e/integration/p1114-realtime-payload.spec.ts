/**
 * @file p1114-realtime-payload.spec.ts
 * @description The WebSocket canary for `event_room_members` realtime delivery,
 * REWRITTEN 2026-08-21 (decisions.md) for the public-roster reversal in
 * 20260821120000_p1114_public_roster_reversal.sql. This file used to prove the
 * OPPOSITE invariant — see git history / the migration's own comment for the
 * original rationale, which does not apply any more.
 *
 * WHAT THIS PROVES NOW. The SELECT policy on `event_room_members` is `USING (true)`
 * — every room member is visible to every subscriber, any answer state. Since
 * decisions.md 2026-08-17 [technical] (P1057) and this file's own prior version
 * established that row-level RLS DOES filter `postgres_changes` payloads the same
 * way it filters a SELECT, the corollary now is the reverse of before: nothing
 * should be filtered any more. This file proves that corollary rather than assuming
 * it — a policy change silently NOT taking effect on the realtime path (stale
 * publication state, a cached policy plan) is exactly the kind of thing P1057 and
 * the old version of this file existed to catch, and "the SQL says USING (true)"
 * is not the same claim as "a live anon subscriber actually receives it."
 *
 * TWO THINGS PROVEN:
 *   (a) an UPDATE on an opted_in = false (or NULL / undecided) row DOES reach a live
 *       anon subscriber — the opposite of what this file asserted before 2026-08-21.
 *   (b) the opt-in -> opt-out TRANSITION itself delivers the new (false) state —
 *       also the opposite of before. Nothing about this transition is special any
 *       more; it is just another UPDATE.
 *
 * WHAT DID NOT CHANGE: `client_secret`'s column-level exclusion (REVOKE/GRANT in
 * both migrations) is untouched by any of this — the roster reversal widens which
 * ROWS are visible, never which COLUMNS are. Both tests below also assert
 * `client_secret` never appears as a key in any received payload, which is the
 * actual security-relevant guarantee left standing after the row-level reversal.
 *
 * STRUCTURE, kept from the pre-2026-08-21 version on purpose (matched to
 * e2e/integration/p1057-realtime-payload.spec.ts):
 *   1. A CONTROL that FAILS on an empty payload set, so silence can never read as
 *      an all-clear (epistemic gate 7b, .claude/rules/epistemic.md).
 *   2. The triggering write is RE-FIRED IN A LOOP, not sent once. `SUBSCRIBED`
 *      means the channel joined, not that the replication slot is already
 *      forwarding this table.
 *   3. RECORD THE RESULT EITHER WAY. If either assertion below fails, that is a
 *      real finding about the channel or the policy, not a flaky test.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, generateTestEmail, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import { seedRoomMember, deleteRoomMembers, type TestRoomMember } from '../helpers/test-event-room';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** Generous: a channel handshake plus one WAL round-trip on a shared test project. */
const SUBSCRIBE_TIMEOUT_MS = 15_000;
const PAYLOAD_TIMEOUT_MS = 15_000;

function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type Payload = Record<string, unknown>;

/** Subscribes an anon client to `postgres_changes` UPDATE events on
 * `event_room_members` filtered to one event, resolving once SUBSCRIBED. */
async function subscribeToEventRoom(
  anon: ReturnType<typeof makeAnonClient>,
  eventId: string,
  onPayload: (p: Payload) => void,
): Promise<RealtimeChannel> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('channel never reached SUBSCRIBED')),
      SUBSCRIBE_TIMEOUT_MS,
    );
    const channel = anon
      .channel(`p1114-canary:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'event_room_members', filter: `event_id=eq.${eventId}` },
        (payload) => onPayload(payload.new as Payload),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(channel); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error(`channel status: ${status}`));
        }
      });
  });
}

/** Re-fires an UPDATE (touching `readiness_value`, which is never the thing
 * under test in either direction) in a loop until `stop()` returns true or the
 * deadline passes. A one-shot trigger sent immediately after SUBSCRIBED can land
 * in the window before the replication slot is forwarding, and that miss is
 * indistinguishable from a real filter without the loop. */
async function pokeUntil(memberId: string, deadline: number, stop: () => boolean): Promise<void> {
  let n = 0;
  while (!stop() && Date.now() < deadline) {
    const { error } = await supabaseAdmin
      .from('event_room_members')
      .update({ readiness_value: n % 11 })
      .eq('id', memberId);
    expect(error, 'the triggering UPDATE must succeed').toBeNull();
    n++;
    for (let i = 0; i < 8 && !stop() && Date.now() < deadline; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

test.describe('P1114: event_room_members realtime delivers every row, client_secret excluded', () => {
  let host: TestUser;
  let event: TestEvent;
  const memberIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1114 Realtime Canary Host' });
    event = await createTestEvent(host.user.id, new Date());
  });

  test.afterAll(async () => {
    await deleteRoomMembers(memberIds);
    await deleteTestEvent(event.id);
    await deleteTestUser(host.user.id);
  });

  test('(a) an opted_in = false row DOES reach a live anon subscriber, and client_secret never appears in any payload', async () => {
    test.setTimeout(60_000);

    const optedOut: TestRoomMember = await seedRoomMember(event.id, { optedIn: false, displayName: 'P1114 Realtime Opted-Out Subject' });
    memberIds.push(optedOut.id);

    const anon = makeAnonClient();
    const received: Payload[] = [];
    let channel: RealtimeChannel | null = null;

    try {
      channel = await subscribeToEventRoom(anon, event.id, (p) => {
        if (p.id === optedOut.id) received.push(p);
      });

      const deadline = Date.now() + PAYLOAD_TIMEOUT_MS;
      await pokeUntil(optedOut.id, deadline, () => received.length > 0);

      // THE ASSERTION. Silence here would mean either the reversal isn't actually
      // in effect on the realtime path, or the channel itself is broken — either
      // way, not something to let pass quietly (epistemic gate 7b).
      expect(
        received.length,
        'no realtime payload arrived for an opted_in = false row. Per the 2026-08-21 ' +
          'reversal (20260821120000_p1114_public_roster_reversal.sql), every room member\'s ' +
          'updates should now reach every subscriber — this row not delivering means either ' +
          'the policy change did not actually take effect on the realtime path, or the ' +
          'channel itself is broken. Investigate before trusting any run of this file.',
      ).toBeGreaterThan(0);

      // client_secret's column-level exclusion is untouched by the row-level reversal —
      // still the actual security boundary here.
      expect(
        received.every((p) => !('client_secret' in p)),
        `COLUMN-LEVEL REALTIME LEAK: client_secret appeared in a payload for member ${optedOut.id}. ` +
          `This is unrelated to the 2026-08-21 row-visibility reversal and must never happen — ` +
          `see the column-level REVOKE/GRANT in both migrations.`,
      ).toBe(true);
    } finally {
      if (channel) await anon.removeChannel(channel);
      await anon.removeAllChannels();
    }
  });

  test('(b) the opt-in -> opt-out TRANSITION delivers the new (false) state', async () => {
    test.setTimeout(60_000);

    const member: TestRoomMember = await seedRoomMember(event.id, { optedIn: true, displayName: 'P1114 Realtime Flip Subject' });
    memberIds.push(member.id);

    const anon = makeAnonClient();
    const received: Payload[] = [];
    let channel: RealtimeChannel | null = null;

    try {
      channel = await subscribeToEventRoom(anon, event.id, (p) => {
        if (p.id === member.id) received.push(p);
      });

      // Phase 1 — CONTROL: prove the channel delivers for this row at all, before
      // the flip. Without this, a later "the flip delivered" reading could just be
      // luck on a channel that happens to deliver everything regardless.
      const phase1Deadline = Date.now() + PAYLOAD_TIMEOUT_MS;
      await pokeUntil(member.id, phase1Deadline, () => received.length > 0);
      expect(
        received.length,
        'no realtime payload arrived while the row was still opted_in = true — the control ' +
          'failed, so nothing below can be trusted as evidence about the flip.',
      ).toBeGreaterThan(0);
      expect(received.every((p) => p.opted_in === true), 'control-phase payloads must all show the pre-flip state').toBe(true);

      // Phase 2 — THE FLIP.
      const beforeFlipCount = received.length;
      const { error: flipError } = await supabaseAdmin
        .from('event_room_members')
        .update({ opted_in: false })
        .eq('id', member.id);
      expect(flipError, 'the flip UPDATE itself must succeed').toBeNull();

      // Wait for a payload showing the post-flip state to arrive, re-poking
      // (touching readiness_value, same as the control loop) so the flip's own
      // WAL entry has every chance to be followed by something the loop can see.
      const phase2Deadline = Date.now() + PAYLOAD_TIMEOUT_MS;
      await pokeUntil(member.id, phase2Deadline, () => received.some((p) => p.opted_in === false));

      // THE ASSERTION. The new (false) state must have reached this subscriber —
      // the reverse of what this file asserted before 2026-08-21.
      expect(
        received.some((p) => p.opted_in === false),
        `the opt-in -> opt-out transition never delivered a payload showing opted_in = false ` +
          `for member ${member.id}. Per the 2026-08-21 reversal this transition should deliver ` +
          `like any other UPDATE — this failing means the reversal is not actually in effect on ` +
          `the realtime path. Received: ${JSON.stringify(received.slice(beforeFlipCount))}`,
      ).toBe(true);

      expect(
        received.every((p) => !('client_secret' in p)),
        `COLUMN-LEVEL REALTIME LEAK: client_secret appeared in a payload for member ${member.id}.`,
      ).toBe(true);
    } finally {
      if (channel) await anon.removeChannel(channel);
      await anon.removeAllChannels();
    }
  });
});
