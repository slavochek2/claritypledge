// Deno test, LIVE against the TEST project's database (Mailgun is stubbed — nothing is sent):
//   set -a; . ./.env.test.local; set +a
//   SUPABASE_URL=$VITE_SUPABASE_URL MAILGUN_API_KEY=stub \
//     deno test --allow-env --allow-net supabase/functions/_shared/p1425-dispatch.test.ts
// Skips when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent.
//
// P1425: the reminder for one event was sent 13 times. Each cron tick the feedback claim wrote
// the whole mailgun_message_ids object from a read taken before the reminder id was stored, and
// feedback was attempted > 72h ahead, which Mailgun rejects — so every tick erased the reminder id
// and the next tick sent the reminder again. These tests run the real per-row dispatch against
// the real database for several ticks and count what reached "Mailgun".
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { FEEDBACK_HOST_ID, type SupabaseClient } from './email-helpers.ts';
import { DISPATCH_WINDOW_MS, dispatchReminder, dispatchRsvp, dueKinds, isErrorOutcome, type RsvpRow } from './event-dispatch.ts';
import { claimMessage, clearMessageIds, setMessageIds, writeBackMessage } from './rsvp-message-ids.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? '';
const LIVE = !!URL_ && !!SERVICE && Deno.env.get('MAILGUN_API_KEY') === 'stub';

const HOUR = 60 * 60 * 1000;

// ── pure: which kinds are due ────────────────────────────────────────────────

const NOW = new Date('2026-10-03T10:00:00Z');
const iso = (h: number) => new Date(NOW.getTime() + h * HOUR).toISOString();
const row = (over: Partial<RsvpRow> = {}) => ({
  reminder_scheduled_at: null, feedback_scheduled_at: null,
  reminder_attempted_at: null, feedback_attempted_at: null, mailgun_message_ids: null, ...over,
});

Deno.test('dueKinds: feedback beyond 72h is NOT due even when the reminder is (the incident shape)', () => {
  // Clarity Night #2 on 2026-10-03 10:00 UTC: reminder at +49.5h, feedback at +77.5h.
  assertEquals(dueKinds(row({ reminder_scheduled_at: iso(49.5), feedback_scheduled_at: iso(77.5) }), NOW),
    { reminder: true, feedback: false });
});
Deno.test('dueKinds: sent / fresh PENDING not due; stuck PENDING due; past not due', () => {
  assertFalse(dueKinds(row({ reminder_scheduled_at: iso(5), mailgun_message_ids: { reminder: '<x>' } }), NOW).reminder);
  assertFalse(dueKinds(row({ reminder_scheduled_at: iso(5), mailgun_message_ids: { reminder: 'PENDING' }, reminder_attempted_at: iso(-1) }), NOW).reminder);
  assert(dueKinds(row({ reminder_scheduled_at: iso(5), mailgun_message_ids: { reminder: 'PENDING' }, reminder_attempted_at: iso(-8) }), NOW).reminder);
  assertFalse(dueKinds(row({ reminder_scheduled_at: iso(-1) }), NOW).reminder);
  assert(dueKinds(row({ feedback_scheduled_at: iso(72) }), NOW).feedback); // boundary is inclusive
});

// ── live: real dispatch against the test DB, Mailgun stubbed ─────────────────

type Sent = { to: string; subject: string; deliverAt: string | null };

function stubMailgun(): { sent: Sent[]; rejected: number; restore: () => void } {
  const real = globalThis.fetch;
  const state = { sent: [] as Sent[], rejected: 0, restore: () => { globalThis.fetch = real; } };
  let n = 0;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('mailgun.net')) return real(input, init);
    const body = init?.body as FormData;
    const deliverAt = (body?.get('o:deliverytime') as string | null) ?? null;
    // Mailgun refuses a delivery time more than 72h ahead (what failed 22 times in prod).
    if (deliverAt && new Date(deliverAt).getTime() - Date.now() > DISPATCH_WINDOW_MS) {
      state.rejected++;
      return new Response('deliverytime too far in future', { status: 400 });
    }
    state.sent.push({ to: String(body.get('to')), subject: String(body.get('subject')), deliverAt });
    return new Response(JSON.stringify({ id: `<p1425-${++n}@stub>` }), { status: 200 });
  }) as typeof fetch;
  return state;
}

const SELECT = `
  id, event_id, profile_id,
  reminder_scheduled_at, feedback_scheduled_at,
  reminder_attempted_at, feedback_attempted_at,
  mailgun_message_ids,
  profiles(email, name),
  events!inner(id, title, datetime, duration_minutes, timezone, location, description, slug, host_id, status, preparation_enabled)`;

async function withEvent(
  hoursAhead: number,
  fn: (sb: SupabaseClient, rsvpId: string, eventId: string) => Promise<void>,
) {
  const sb = createClient<any>(URL_, SERVICE, { auth: { persistSession: false } });
  const start = new Date(Date.now() + hoursAhead * HOUR);
  const { data: ev, error: evErr } = await sb.from('events').insert({
    slug: `p1425-test-${crypto.randomUUID()}`,
    title: 'P1425 dispatch test (safe to delete)',
    description: 'P1425 test fixture',
    datetime: start.toISOString(),
    duration_minutes: 120,
    timezone: 'Asia/Bangkok',
    location: 'Test venue, Chiang Mai',
    host_id: FEEDBACK_HOST_ID,
    preparation_enabled: false,
  }).select('id, datetime, duration_minutes').single();
  if (evErr) throw evErr;
  try {
    const { data: rsvp, error: rErr } = await sb.from('event_rsvps').insert({
      event_id: ev.id,
      profile_id: FEEDBACK_HOST_ID,
      reminder_scheduled_at: new Date(start.getTime() - 24 * HOUR).toISOString(),
      feedback_scheduled_at: new Date(start.getTime() + 120 * 60_000 + 2 * HOUR).toISOString(),
    }).select('id').single();
    if (rErr) throw rErr;
    await fn(sb, rsvp.id, ev.id);
  } finally {
    await sb.from('email_send_log').delete().eq('event_id', ev.id);
    await sb.from('events').delete().eq('id', ev.id); // cascades the rsvp
  }
}

async function tick(sb: SupabaseClient, rsvpId: string) {
  const { data, error } = await sb.from('event_rsvps').select(SELECT).eq('id', rsvpId).single();
  if (error) throw error;
  return dispatchRsvp(sb, data as unknown as RsvpRow, new Date());
}

async function ids(sb: SupabaseClient, rsvpId: string) {
  const { data } = await sb.from('event_rsvps').select('mailgun_message_ids').eq('id', rsvpId).single();
  return (data?.mailgun_message_ids ?? {}) as Record<string, string>;
}

Deno.test({
  name: 'live: incident shape — feedback > 72h out, 4 ticks → exactly ONE reminder, feedback never attempted',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mg = stubMailgun();
    try {
      await withEvent(74, async (sb, rsvpId) => {
        for (let i = 0; i < 4; i++) await tick(sb, rsvpId);
        assertEquals(mg.sent.length, 1, `reminder sends: ${JSON.stringify(mg.sent)}`);
        assertEquals(mg.rejected, 0);
        const stored = await ids(sb, rsvpId);
        assertEquals(stored.reminder, '<p1425-1@stub>');
        assertEquals(stored.feedback, undefined);
      });
    } finally { mg.restore(); }
  },
});

Deno.test({
  name: 'live: reminder and feedback due in the SAME tick → both stored, second tick sends nothing',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mg = stubMailgun();
    try {
      await withEvent(30, async (sb, rsvpId) => {
        await tick(sb, rsvpId);
        assertEquals(mg.sent.length, 2);
        const first = await ids(sb, rsvpId);
        assertEquals(first.reminder, '<p1425-1@stub>');
        assertEquals(first.feedback, '<p1425-2@stub>');
        await tick(sb, rsvpId);
        await tick(sb, rsvpId);
        assertEquals(mg.sent.length, 2, `extra sends: ${JSON.stringify(mg.sent.slice(2))}`);
      });
    } finally { mg.restore(); }
  },
});

Deno.test({
  name: 'live: set_rsvp_message_ids is a per-key CAS — a stale writer cannot erase a sibling id',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await withEvent(30, async (sb, rsvpId) => {
      const c = sb;
      assertEquals(await setMessageIds(c, rsvpId, 'reminder', null, { reminder: 'PENDING' }, { attemptedAt: new Date().toISOString() }), 'ok');
      assertEquals(await setMessageIds(c, rsvpId, 'reminder', null, { reminder: 'PENDING' }), 'conflict'); // already claimed
      assertEquals(await setMessageIds(c, rsvpId, 'reminder', 'PENDING', { reminder: '<r>' }), 'ok');
      // A feedback claim made by a caller whose read predates the reminder id:
      assertEquals(await setMessageIds(c, rsvpId, 'feedback', null, { feedback: 'PENDING' }), 'ok');
      const fbWrite = await setMessageIds(c, rsvpId, 'feedback', 'PENDING', { feedback: null }); // Mailgun failed
      if (fbWrite !== 'ok') {
        const { data } = await sb.from('event_rsvps').select('mailgun_message_ids, reminder_attempted_at, feedback_attempted_at').eq('id', rsvpId).single();
        console.error('P1425 DIAG feedback write-back', fbWrite, JSON.stringify(data));
      }
      assertEquals(fbWrite, 'ok');
      assertEquals(await ids(sb, rsvpId), { reminder: '<r>' });
      // starting_soon set + cleared as a pair, siblings untouched
      assertEquals(await setMessageIds(c, rsvpId, 'starting_soon', null, { starting_soon: '<s>', starting_soon_for: 'x' }), 'ok');
      assertEquals(await setMessageIds(c, rsvpId, 'starting_soon', '<s>', { starting_soon: null, starting_soon_for: null }, { attemptedAt: null }), 'ok');
      assertEquals(await ids(sb, rsvpId), { reminder: '<r>' });
      // unknown key / unknown patch key are refused by the database
      const bad = await sb.rpc('set_rsvp_message_ids', { p_rsvp_id: rsvpId, p_key: 'confirmation', p_expected: null, p_patch: {} });
      assert(bad.error, 'unknown key must raise');
      const bad2 = await sb.rpc('set_rsvp_message_ids', { p_rsvp_id: rsvpId, p_key: 'reminder', p_expected: '<r>', p_patch: { other: 'x' } });
      assert(bad2.error, 'unknown patch key must raise');
      assertEquals(await ids(sb, rsvpId), { reminder: '<r>' });
    });
  },
});

Deno.test({
  name: 'live: anon cannot call set_rsvp_message_ids',
  ignore: !LIVE || !ANON,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const anon = createClient<any>(URL_, ANON, { auth: { persistSession: false } });
    const { error } = await anon.rpc('set_rsvp_message_ids', {
      p_rsvp_id: crypto.randomUUID(), p_key: 'reminder', p_expected: null, p_patch: { reminder: 'PENDING' },
    });
    assert(error, 'anon call must be refused');
  },
});

// ── review round 1 (Codex / Gemini / Opus): claim tokens, takeover, resets, error accounting ──

Deno.test({
  name: 'live: an old write-back cannot land on a NEWER claim (claim token)',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await withEvent(30, async (sb, rsvpId, eventId) => {
      const row = { id: rsvpId, event_id: eventId, profile_id: FEEDBACK_HOST_ID };
      const a = await claimMessage(sb, row, 'reminder', null, null, new Date(Date.now() - 5000), HOUR);
      assertEquals(a.status, 'claimed');
      // handleUpdate resets the row, then the next tick claims the replacement reminder
      assertEquals(await clearMessageIds(sb, rsvpId, ['reminder'], async () => {}), 'ok');
      const b = await claimMessage(sb, row, 'reminder', null, null, new Date(), HOUR);
      assertEquals(b.status, 'claimed');
      // A's delayed Mailgun rejection must not clear B's claim …
      if (a.status !== 'claimed' || b.status !== 'claimed') throw new Error('unreachable');
      assertEquals(await writeBackMessage(sb, rsvpId, 'reminder', a.token, { reminder: null }), 'conflict');
      assertEquals((await ids(sb, rsvpId)).reminder, 'PENDING');
      // … and B's own write-back lands
      assertEquals(await writeBackMessage(sb, rsvpId, 'reminder', b.token, { reminder: '<b>' }), 'ok');
      assertEquals((await ids(sb, rsvpId)).reminder, '<b>');
    });
  },
});

async function stickClaim(sb: SupabaseClient, rsvpId: string, hoursAgo: number) {
  const at = new Date(Date.now() - hoursAgo * HOUR).toISOString();
  assertEquals(await setMessageIds(sb, rsvpId, 'reminder', null, { reminder: 'PENDING' }, { attemptedAt: at }), 'ok');
  return at;
}

Deno.test({
  name: 'live: stuck claim whose send WAS logged → id repaired from the log, nothing re-sent',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mg = stubMailgun();
    try {
      await withEvent(30, async (sb, rsvpId, eventId) => {
        await setMessageIds(sb, rsvpId, 'feedback', null, { feedback: '<fb>' }); // keep feedback out of it
        await stickClaim(sb, rsvpId, 8);
        // the original claimer's send went out and was logged, but its write-back never landed
        const { error } = await sb.from('email_send_log').insert({
          event_id: eventId, profile_id: FEEDBACK_HOST_ID, email_type: 'reminder', status: 'sent',
          mailgun_message_id: '<logged@stub>', created_at: new Date(Date.now() - 8 * HOUR + 1000).toISOString(),
        });
        if (error) throw error;
        const outcomes = await tick(sb, rsvpId);
        assertEquals(outcomes, ['skipped:already-sent']);
        assertEquals(mg.sent.length, 0);
        assertEquals((await ids(sb, rsvpId)).reminder, '<logged@stub>');
      });
    } finally { mg.restore(); }
  },
});

Deno.test({
  name: 'live: stuck claim with NO logged send → taken over and sent exactly once',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mg = stubMailgun();
    try {
      await withEvent(30, async (sb, rsvpId) => {
        await setMessageIds(sb, rsvpId, 'feedback', null, { feedback: '<fb>' });
        await stickClaim(sb, rsvpId, 8);
        assertEquals(await tick(sb, rsvpId), ['sent']);
        assertEquals(await tick(sb, rsvpId), []);
        assertEquals(mg.sent.length, 1);
        assertEquals((await ids(sb, rsvpId)).reminder, '<p1425-1@stub>');
      });
    } finally { mg.restore(); }
  },
});

Deno.test({
  name: 'live: two overlapping takeovers of one stuck claim (attempted_at NULL) — only one wins',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await withEvent(30, async (sb, rsvpId, eventId) => {
      assertEquals(await setMessageIds(sb, rsvpId, 'reminder', null, { reminder: 'PENDING' }, { attemptedAt: null }), 'ok');
      const row = { id: rsvpId, event_id: eventId, profile_id: FEEDBACK_HOST_ID };
      // both ticks read the same stuck state (PENDING, attempted_at NULL)
      const [a, b] = await Promise.all([
        claimMessage(sb, row, 'reminder', 'PENDING', null, new Date(), HOUR),
        claimMessage(sb, row, 'reminder', 'PENDING', null, new Date(Date.now() + 1), HOUR),
      ]);
      assertEquals([a.status, b.status].filter((s) => s === 'claimed').length, 1);
    });
  },
});

Deno.test({
  name: 'live: a FRESH (not stuck) claim is left alone',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mg = stubMailgun();
    try {
      await withEvent(30, async (sb, rsvpId) => {
        await setMessageIds(sb, rsvpId, 'feedback', null, { feedback: '<fb>' });
        await stickClaim(sb, rsvpId, 1);
        assertEquals(await tick(sb, rsvpId), []); // not due: claim is live
        assertEquals(mg.sent.length, 0);
      });
    } finally { mg.restore(); }
  },
});

Deno.test({
  name: 'live: clearMessageIds (uncancel / edit) clears every kind, cancels ids it had not seen, keeps a same-start starting-soon',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await withEvent(30, async (sb, rsvpId) => {
      await setMessageIds(sb, rsvpId, 'reminder', null, { reminder: '<r>' });
      await setMessageIds(sb, rsvpId, 'feedback', null, { feedback: '<f>' });
      await setMessageIds(sb, rsvpId, 'starting_soon', null, { starting_soon: '<s>', starting_soon_for: 'D1' });
      const cancelled: string[] = [];
      const cancel = async (id: string) => { cancelled.push(id); };
      // an edit that kept the start: reminder/feedback cleared, starting-soon kept; '<r>' already cancelled
      assertEquals(await clearMessageIds(sb, rsvpId, ['reminder', 'feedback', 'starting_soon'], cancel, {
        keepStartingSoonFor: 'D1', alreadyCancelled: new Set(['<r>']),
      }), 'ok');
      assertEquals(await ids(sb, rsvpId), { starting_soon: '<s>', starting_soon_for: 'D1' });
      assertEquals(cancelled, ['<f>']);
      // an edit that moved the start (or an uncancel): starting-soon cleared and cancelled
      assertEquals(await clearMessageIds(sb, rsvpId, ['reminder', 'feedback', 'starting_soon'], cancel, {
        keepStartingSoonFor: 'D2',
      }), 'ok');
      assertEquals(await ids(sb, rsvpId), {});
      assertEquals(cancelled, ['<f>', '<s>']);
    });
  },
});

Deno.test({
  name: 'live: after cancel → uncancel the reminder is scheduled again (was: never)',
  ignore: !LIVE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mg = stubMailgun();
    try {
      await withEvent(30, async (sb, rsvpId) => {
        assertEquals(await tick(sb, rsvpId), ['sent', 'sent']); // reminder + feedback scheduled
        // handleCancel withdraws them at Mailgun but leaves the ids; handleUncancel now clears them
        await clearMessageIds(sb, rsvpId, ['reminder', 'feedback', 'starting_soon'], async () => {});
        assertEquals(await tick(sb, rsvpId), ['sent', 'sent']);
        assertEquals(mg.sent.length, 4);
      });
    } finally { mg.restore(); }
  },
});

// ── pure: an RPC failure is an ERROR, never a skip ───────────────────────────

Deno.test('setMessageIds / dispatchReminder: an RPC error is reported as error, counted by the cron', async () => {
  const dead = { rpc: () => Promise.resolve({ data: null, error: { message: 'PGRST202 function not found' } }) } as unknown as SupabaseClient;
  assertEquals(await setMessageIds(dead, 'r', 'reminder', null, { reminder: 'PENDING' }), 'error');
  const start = new Date(Date.now() + 30 * HOUR);
  const rsvp = {
    id: 'r', event_id: 'e', profile_id: 'p',
    reminder_scheduled_at: new Date(start.getTime() - 24 * HOUR).toISOString(),
    feedback_scheduled_at: null, reminder_attempted_at: null, feedback_attempted_at: null,
    mailgun_message_ids: null,
    profiles: { email: 'test@example.com', name: 'Test' },
    events: {
      id: 'e', title: 'T', datetime: start.toISOString(), duration_minutes: 120, timezone: 'UTC',
      location: 'x', description: null, slug: 's', host_id: 'h', status: 'upcoming', preparation_enabled: false,
    },
  } as unknown as RsvpRow;
  const outcome = await dispatchReminder(dead, rsvp, new Date());
  assertEquals(outcome, 'error:db');
  assert(isErrorOutcome(outcome));
});
