/**
 * @file p1114-realtime-payload.spec.ts
 * @description The WebSocket canary Architecture Decision 2 of
 * features/p1114_event_room_presence_and_cmp_opt_in.md exists for, and which that
 * decision's `UNVERIFIED` block explicitly requires to run "at /generate-tests
 * before any of this ships."
 *
 * WHAT'S UNVERIFIED, PRECISELY. Decision 2's whole design — "opt-ins are shown,
 * opt-outs are never shown" as a DATA-LAYER guarantee, not a frontend-rendering
 * choice — rests on `USING (opted_in = true)` being the filter `postgres_changes`
 * applies too, not just the filter `.from()` REST reads apply. decisions.md
 * 2026-08-17 [technical] (P1057) measured that Realtime filters payload COLUMNS by
 * column-level SELECT privilege, and closed with: "This does NOT generalise to
 * row-level questions." This spec needs the ROW-level case — a row disappearing
 * from what an anon subscriber can see, not a column disappearing from a row it
 * can still see. Nobody has measured that before this file.
 *
 * The repo has already refused to take the vendor's word on an adjacent question
 * once: 20260812130000_p1048_close_chat_realtime_channel.sql removed a table from
 * the publication rather than rely on documented behaviour.
 *
 * TWO DIRECTIONS, BOTH REQUIRED BY "OPT-OUTS ARE NEVER SHOWN":
 *   (a) a row with opted_in = false must never appear in a payload at all — the
 *       row-level equivalent of P1057's column check.
 *   (b) an UPDATE that flips a row from opted_in = true to opted_in = false must
 *       not deliver the new (false) state to a subscriber — the RLS-visible ->
 *       RLS-invisible TRANSITION. Architecture Decision 3 names this direction
 *       explicitly as having "no proven live-removal signal in this repo" and
 *       flags it UNTESTED; no Done-When item covers it on its own, but "opt-outs
 *       are never shown" is not true in general without it.
 *
 * STRUCTURE, matched to e2e/integration/p1057-realtime-payload.spec.ts (the only
 * other WebSocket test in this repo) on purpose:
 *   1. A CONTROL that FAILS on an empty payload set, so silence can never read as
 *      an all-clear (epistemic gate 7b, .claude/rules/epistemic.md).
 *   2. The triggering write is RE-FIRED IN A LOOP, not sent once. `SUBSCRIBED`
 *      means the channel joined, not that the replication slot is already
 *      forwarding this table — P1057's canary went 16s-miss-then-1.2s-pass on a
 *      single trigger, and "passes on retry" is not evidence of anything.
 *   3. RECORD THE RESULT EITHER WAY. If either assertion below fails, that is a
 *      real finding about the channel, not a flaky test. The follow-up is NOT to
 *      retry this file — it's Architecture Decision 2's own named fallback: pull
 *      `event_room_members` out of the `supabase_realtime` publication entirely
 *      (the P1048 move) and drive the roster from Decision 3's 30s reconciliation
 *      poll alone. Build Sequence step 1 makes publication membership conditional
 *      on this file passing.
 *
 * PRE-IMPLEMENTATION STATE: `event_room_members` does not exist yet (this file
 * was authored at /generate-tests, before /dev). Every test below will fail with
 * "relation \"event_room_members\" does not exist" until the migration lands —
 * expected, not a bug in this file. Once the migration exists but BEFORE the
 * table is added to `supabase_realtime`, expect the channel to never reach a
 * useful state / the control to time out — also expected, and exactly the signal
 * that publication membership (Build Sequence step 1) hasn't landed yet either.
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
 * deadline passes. Mirrors P1057's re-fire loop — a one-shot trigger sent
 * immediately after SUBSCRIBED can land in the window before the replication
 * slot is forwarding, and that miss is indistinguishable from a real filter
 * without the loop. */
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

test.describe('P1114 Decision 2: event_room_members realtime row-level opt-out filtering', () => {
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

  test('(a) a row with opted_in = false never appears in a received payload, proven against a live control channel', async () => {
    test.setTimeout(60_000);

    const visible: TestRoomMember = await seedRoomMember(event.id, { optedIn: true, displayName: 'P1114 Realtime Control (visible)' });
    const hidden: TestRoomMember = await seedRoomMember(event.id, { optedIn: false, displayName: 'P1114 Realtime Hidden (opted out)' });
    memberIds.push(visible.id, hidden.id);

    const anon = makeAnonClient();
    const receivedByMember: Record<string, Payload[]> = { [visible.id]: [], [hidden.id]: [] };
    let channel: RealtimeChannel | null = null;

    try {
      channel = await subscribeToEventRoom(anon, event.id, (p) => {
        const id = p.id as string;
        if (id in receivedByMember) receivedByMember[id].push(p);
      });

      const deadline = Date.now() + PAYLOAD_TIMEOUT_MS;
      // Poke BOTH rows every round — the control and the hidden row get identical
      // treatment, so a difference in what arrives is attributable to the RLS
      // filter and nothing else (test setup asymmetry).
      await pokeUntil(visible.id, deadline, () => receivedByMember[visible.id].length > 0);
      await pokeUntil(hidden.id, Date.now() + 3_000, () => false); // a few extra pokes on the hidden row after the control lands

      // THE CONTROL. If this is empty, the test proves nothing about row
      // filtering — silence must fail loudly, never read as an all-clear.
      expect(
        receivedByMember[visible.id].length,
        'no realtime payload arrived for the CONTROL (opted_in = true) row — the canary ' +
          'cannot conclude anything about row-level filtering from silence (publication ' +
          'membership, the channel itself, or something else entirely may be the reason). ' +
          'Investigate before trusting any green OR red run of this file.',
      ).toBeGreaterThan(0);

      // THE ASSERTION. The opted_in = false row's updates must never have reached
      // this subscriber, on the same channel, in the same time window, as proven
      // live by the control above.
      expect(
        receivedByMember[hidden.id].length,
        `ROW-LEVEL REALTIME LEAK: an anon subscriber received ${receivedByMember[hidden.id].length} ` +
          `payload(s) for event_room_members row ${hidden.id}, which has opted_in = false. ` +
          `Architecture Decision 2 is VOID if this fails — the fallback is Decision 2's own ` +
          `named move: drop event_room_members from the supabase_realtime publication and ` +
          `drive the roster from the Decision 3 reconciliation poll alone. Received: ` +
          `${JSON.stringify(receivedByMember[hidden.id])}`,
      ).toBe(0);
    } finally {
      if (channel) await anon.removeChannel(channel);
      await anon.removeAllChannels();
    }
  });

  test('(b) flipping a row from opted_in = true to false is not delivered as the new (false) state', async () => {
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

      // Phase 1 — CONTROL: prove the channel delivers for this row while it is
      // still genuinely visible (opted_in = true). Without this, a later "no
      // false-state payload arrived" reading is indistinguishable from the
      // channel never delivering for this row at all.
      const phase1Deadline = Date.now() + PAYLOAD_TIMEOUT_MS;
      await pokeUntil(member.id, phase1Deadline, () => received.length > 0);
      expect(
        received.length,
        'no realtime payload arrived while the row was still opted_in = true — the control ' +
          'failed, so nothing below can be trusted as evidence about the flip.',
      ).toBeGreaterThan(0);
      expect(received.every((p) => p.opted_in === true), 'control-phase payloads must all show the pre-flip state').toBe(true);

      // Phase 2 — THE FLIP. This is the transition Architecture Decision 3 flags
      // UNTESTED: an UPDATE that moves the row from matching the SELECT policy
      // to NOT matching it.
      const { error: flipError } = await supabaseAdmin
        .from('event_room_members')
        .update({ opted_in: false })
        .eq('id', member.id);
      expect(flipError, 'the flip UPDATE itself must succeed').toBeNull();

      // Keep poking after the flip (touching readiness_value, same as the
      // control loop) so any further WAL activity on this row has every chance
      // to reach the subscriber if the row is still (wrongly) visible.
      await pokeUntil(member.id, Date.now() + PAYLOAD_TIMEOUT_MS, () => false);

      // THE ASSERTION. Whatever DID or did not arrive after the flip, no
      // received payload for this row may ever show opted_in = false — that is
      // the literal content of "opt-outs are never shown," independent of
      // whether Realtime represents the transition as an UPDATE, a synthesized
      // DELETE, or nothing at all.
      expect(
        received.some((p) => p.opted_in === false),
        `ROW-LEVEL REALTIME LEAK on the opt-in -> opt-out TRANSITION: a payload showing ` +
          `opted_in = false for member ${member.id} reached an anon subscriber. Architecture ` +
          `Decision 3 flagged this direction UNTESTED — this is that test, and it failed. ` +
          `Fallback is the same as direction (a): drop event_room_members from ` +
          `supabase_realtime and rely on the reconciliation poll. Received after flip: ` +
          `${JSON.stringify(received.filter((p) => received.indexOf(p) >= 0))}`,
      ).toBe(false);
    } finally {
      if (channel) await anon.removeChannel(channel);
      await anon.removeAllChannels();
    }
  });
});
