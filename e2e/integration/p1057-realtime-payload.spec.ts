/**
 * @file p1057-realtime-payload.spec.ts
 * @description The WebSocket canary P1057 Decision 8 exists for: does Supabase Realtime
 * filter `postgres_changes` payload columns by the subscriber's COLUMN-level SELECT
 * privilege, or only by RLS row-visibility?
 *
 * WHY THIS FILE EXISTS AT ALL — this is epistemic gate 7b, applied to P1057's own fix.
 *
 * Migration B revokes SELECT on `clarity_sessions.code` from anon/authenticated, and the REST
 * canaries prove that closes every `.from()` path. But `clarity_sessions` IS in the realtime
 * publication (20250101_initial_schema.sql), and the row policy deliberately keeps every
 * `target_listener_id IS NULL` room visible to anon — that is the founder's standing
 * requirement, not an oversight. Row visibility is NOT column visibility. If Realtime gates
 * on rows only, `code` keeps reaching anonymous subscribers over the WebSocket and the fix is
 * defeated on that channel, while every REST test in the repo stays green.
 *
 * The repo has already refused to take the vendor's word here once:
 * 20260812130000_p1048_close_chat_realtime_channel.sql removed a table from the publication
 * rather than rely on documented behaviour, noting that the REST-based suite "structurally
 * CANNOT test it — it speaks only .from() calls and never opens a WebSocket".
 *
 * This file opens the WebSocket. It is the first test in this repo that does
 * (`grep -rn "postgres_changes" e2e/` previously found only a polling helper).
 *
 * RECORD THE RESULT EITHER WAY. If `code` turns up in payload.new, that is a real finding
 * about the channel, not a flaky test — the follow-up is a separate decision (narrow the
 * publication, as P1048 did, or accept and record).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** Generous: a channel handshake plus one WAL round-trip on a shared test project. */
const SUBSCRIBE_TIMEOUT_MS = 15_000;
const PAYLOAD_TIMEOUT_MS = 15_000;

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

test.describe('P1057 Decision 8: realtime payload column exposure', () => {
  const createdSessionIds: string[] = [];

  test.afterAll(async () => {
    if (createdSessionIds.length) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
  });

  test('an anon postgres_changes subscriber does not receive `code` in payload.new', async () => {
    test.setTimeout(60_000);

    // A null-target room: the shape the anon row policy deliberately keeps visible, and
    // therefore the shape an anonymous subscriber can actually receive events for. Using an
    // addressed room instead would make this test pass vacuously — the subscriber would get
    // no payload at all, and "no code in the payload" would prove nothing.
    const code = makeRoomCode();
    const { data: room, error: seedErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P1057 realtime canary',
        target_listener_id: null,
        state: {},
        demo_status: 'waiting',
        partnership_status: 'pending',
        live_state: {},
      })
      .select('id')
      .single();
    expect(seedErr, 'seed must succeed').toBeNull();
    createdSessionIds.push(room!.id);

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let channel: RealtimeChannel | null = null;
    try {
      const received: Record<string, unknown>[] = [];

      const subscribed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('channel never reached SUBSCRIBED')),
          SUBSCRIBE_TIMEOUT_MS,
        );
        channel = anon
          .channel(`p1057-canary:${room!.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'clarity_sessions', filter: `id=eq.${room!.id}` },
            (payload) => { received.push(payload.new as Record<string, unknown>); },
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              clearTimeout(timer);
              reject(new Error(`channel status: ${status}`));
            }
          });
      });

      await subscribed;

      // Trigger WAL events as service_role (unconstrained by the client grants under test).
      //
      // Fired REPEATEDLY rather than once: `SUBSCRIBED` means the channel is joined, not that
      // the server-side replication slot is already forwarding this table's changes, so a
      // single UPDATE sent immediately after the handshake can land in that window and be
      // missed. A one-shot trigger made this canary flaky (16s miss, then a 1.2s pass on
      // retry) — and a canary whose green depends on a retry is not evidence of anything.
      // Re-firing is safe: every event carries the same row, so the assertion is unchanged.
      const deadline = Date.now() + PAYLOAD_TIMEOUT_MS;
      let triggers = 0;
      while (received.length === 0 && Date.now() < deadline) {
        const { error: updErr } = await supabaseAdmin
          .from('clarity_sessions')
          .update({ live_state: { canary: true, at: new Date().toISOString(), n: triggers } })
          .eq('id', room!.id);
        expect(updErr, 'the triggering UPDATE must succeed').toBeNull();
        triggers++;
        for (let i = 0; i < 8 && received.length === 0; i++) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }

      // The control. If no payload arrived, this test proves NOTHING about column filtering —
      // it must fail loudly rather than report a false all-clear.
      expect(
        received.length,
        'no realtime payload arrived — the canary cannot conclude anything about column ' +
          'exposure from silence (publication membership, RLS row visibility, or the channel ' +
          'itself may be the reason). Investigate before trusting any green run of this file.',
      ).toBeGreaterThan(0);

      const payload = received[0];

      // Sanity: the payload really is the row we changed, so the assertion below is about
      // THIS table's columns and not some unrelated event.
      expect(payload.id, 'payload must be for the seeded room').toBe(room!.id);
      expect(payload).toHaveProperty('live_state');

      // THE ASSERTION. Realtime must not hand an anonymous subscriber a column the SELECT
      // grant denies over REST.
      expect(
        Object.keys(payload),
        `REALTIME LEAK: payload.new carried the room code over an anon WebSocket even though ` +
          `the column grant denies it over REST. P1057's fix is defeated on this channel. ` +
          `Follow-up is a separate decision — narrow the publication (the P1048 precedent) or ` +
          `accept and record. Payload keys: ${Object.keys(payload).join(', ')}`,
      ).not.toContain('code');
    } finally {
      if (channel) await anon.removeChannel(channel);
      await anon.removeAllChannels();
    }
  });
});
