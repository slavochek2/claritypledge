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
import { DISPATCH_WINDOW_MS, dispatchRsvp, dueKinds, type RsvpRow } from './event-dispatch.ts';
import { setMessageIds } from './rsvp-message-ids.ts';

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
      assert(await setMessageIds(c, rsvpId, 'reminder', null, { reminder: 'PENDING' }, { attemptedAt: new Date().toISOString() }));
      assertFalse(await setMessageIds(c, rsvpId, 'reminder', null, { reminder: 'PENDING' })); // already claimed
      assert(await setMessageIds(c, rsvpId, 'reminder', 'PENDING', { reminder: '<r>' }));
      // A feedback claim made by a caller whose read predates the reminder id:
      assert(await setMessageIds(c, rsvpId, 'feedback', null, { feedback: 'PENDING' }));
      assert(await setMessageIds(c, rsvpId, 'feedback', 'PENDING', { feedback: null })); // Mailgun failed
      assertEquals(await ids(sb, rsvpId), { reminder: '<r>' });
      // starting_soon set + cleared as a pair, siblings untouched
      assert(await setMessageIds(c, rsvpId, 'starting_soon', null, { starting_soon: '<s>', starting_soon_for: 'x' }));
      assert(await setMessageIds(c, rsvpId, 'starting_soon', '<s>', { starting_soon: null, starting_soon_for: null }, { attemptedAt: null }));
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
