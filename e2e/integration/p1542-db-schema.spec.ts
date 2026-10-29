/**
 * P1542 migration 20261022120000_p1542_series_review_handoff: series_reviews.status and
 * source_event_id exist with their constraints, one review per person per close is held by the
 * database, and the public (anon) read shows approved rows only.
 */
/**
 * ALSO — round 6 — group_chat_opens, mark_group_chat_opened, group_chat_opened
 * (migrations 20261027170000_p1542_group_chat_opens.sql and 20261027170100_p1542_group_chat_key_trim.sql).
 *
 * The unit suite (src/tests/p1542-round6.test.tsx) asserts the SQL as text; it cannot execute it. This file runs the
 * cases that matter against the real TEST database, real RLS and real JWTs:
 *
 *   anon                                  → may not execute either RPC
 *   signed in, not registered             → mark: 42501 · read: false
 *   RSVP holder / host                    → mark: true, then read: true
 *   a second mark                         → still one row
 *   SELECT on group_chat_opens            → only the caller's own rows
 *   direct INSERT                         → rejected (no client write policy)
 *   event with no group chat              → mark: false · read: false
 *   two events sharing one link           → opened on one = opened on both
 *   a stored link with a trailing newline → the same key as the clean link (needs the 20261027170100 follow-up)
 *   two different Signal groups           → opening one does NOT count for the other (needs 20261027170100)
 *   a WhatsApp link with ?utm             → the same group as the clean link
 *
 * The positive cases are the control for the negative ones: a function that refused everybody would pass every
 * "refused" case and look correct.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';
import { createTestEvent, type TestEvent } from '../helpers/test-event';
import { createHash } from 'crypto';
import { normaliseChatLink } from '../../src/app/prototypes/events/group-chat-utils';

/**
 * Round 7g/7h (Codex): teardown that never hides a leftover. Every step runs even after an earlier one failed; each
 * RESOLVED Supabase response is inspected (a failed delete resolves with `error` set, it does not throw — checked on
 * TEST: auth deleteUser 404, a bad id 22P02); the teardown then fails naming exactly what was left behind.
 */
type CleanupStep = { what: string; ids: string[]; run: () => PromiseLike<{ error: unknown }> };
async function cleanUpOrFail(label: string, steps: CleanupStep[]) {
  const leftBehind: string[] = [];
  for (const step of steps) {
    if (!step.ids.length) continue;
    try {
      const { error } = await step.run();
      if (error) leftBehind.push(`${step.what} [${step.ids.join(', ')}]: ${(error as { message?: string }).message ?? String(error)}`);
    } catch (e) {
      leftBehind.push(`${step.what} [${step.ids.join(', ')}]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  expect(leftBehind, `${label} teardown left rows behind:\n${leftBehind.join('\n')}`).toEqual([]);
}

test.describe('Migration: P1542 series_reviews status + source_event_id', () => {
  let userId: string;
  let event: TestEvent;
  const ids: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const { user } = await createTestUser({ name: 'P1542 Schema' });
    userId = user.id;
    event = await createTestEvent(userId, new Date(Date.now() - 3600 * 1000), { title: 'Social Hike: P1542 schema' });
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    // The event is deleted directly (deleteTestEvent logs a failed delete and returns normally).
    await cleanUpOrFail('p1542 series_reviews', [
      { what: 'series_reviews', ids, run: () => supabaseAdmin.from('series_reviews').delete().in('id', ids) },
      { what: 'event', ids: event ? [event.id] : [], run: () => supabaseAdmin.from('events').delete().eq('id', event.id) },
      { what: 'auth user', ids: userId ? [userId] : [], run: () => supabaseAdmin.auth.admin.deleteUser(userId) },
    ]);
  });

  test('status and source_event_id exist; existing-style inserts default to approved', async () => {
    const { data, error } = await supabaseAdmin
      .from('series_reviews')
      .insert({ series_slug: 'p1542-schema-test', quote: 'default status', author_name: 'P1542 Schema' })
      .select('id, status, source_event_id')
      .single();
    expect(error, 'Migration not applied: status / source_event_id missing').toBeNull();
    ids.push(data!.id);
    expect(data).toMatchObject({ status: 'approved', source_event_id: null });
  });

  test('status is limited to pending | approved | rejected', async () => {
    const { error } = await supabaseAdmin
      .from('series_reviews')
      .insert({ series_slug: 'p1542-schema-test', quote: 'bad status', author_name: 'P1542 Schema', status: 'published' });
    expect(error?.code).toBe('23514');
  });

  test('one review per person per close: a second insert for the same event and author is refused', async () => {
    const row = { series_slug: 'p1542-schema-test', quote: 'once', author_name: 'P1542 Schema', author_profile_id: userId, source_event_id: event.id, status: 'pending' };
    const first = await supabaseAdmin.from('series_reviews').insert(row).select('id').single();
    expect(first.error).toBeNull();
    ids.push(first.data!.id);
    const second = await supabaseAdmin.from('series_reviews').insert({ ...row, quote: 'twice' });
    expect(second.error?.code).toBe('23505');
  });

  test('anon sees approved rows only', async () => {
    const pending = await supabaseAdmin
      .from('series_reviews')
      .insert({ series_slug: 'p1542-schema-test', quote: 'hidden', author_name: 'P1542 Schema', status: 'pending' })
      .select('id').single();
    ids.push(pending.data!.id);
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { data, error } = await anon.from('series_reviews').select('id, status').eq('series_slug', 'p1542-schema-test');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((r) => r.status === 'approved')).toBe(true);
    expect(data!.map((r) => r.id)).not.toContain(pending.data!.id);
  });
});

test.describe.configure({ mode: 'serial' });

const LINK = `https://chat.whatsapp.com/P1542Integration${Date.now()}`;
const LINK2 = `https://chat.whatsapp.com/P1542Newline${Date.now()}`;
// Round 7: Signal keeps its group code in the fragment — two different groups on the same host and path.
const SIGNAL_A = `https://signal.group/#CjQKIP1542A${Date.now()}`;
const SIGNAL_B = `https://signal.group/#CjQKIP1542B${Date.now()}`;

function anonClient() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}

// Round 7e (metered-services rule 6): ONE sign-in per user for the whole file, then the client is reused.
const clients = new Map<string, Promise<SupabaseClient>>();
function clientFor(email: string): Promise<SupabaseClient> {
  if (!clients.has(email)) {
    clients.set(email, (async () => {
      // A throwaway client per user: signing in on supabaseAdmin would swap its session (see p1193-db-schema.spec.ts).
      const { data, error } = await anonClient().auth.signInWithPassword({ email, password: TEST_PASSWORD });
      expect(error).toBeNull();
      return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
      });
    })());
  }
  return clients.get(email)!;
}

test.describe('P1542: group-chat opens are recorded per person per link, behind real RLS', () => {
  const userIds: string[] = [];
  const eventIds: string[] = [];
  let host: { id: string; email: string };
  let attendee: { id: string; email: string };
  let stranger: { id: string; email: string };
  let shared1: string; // chat LINK
  let shared2: string; // the same LINK — one group, two hikes
  let noChat: string;
  let withNewline: string; // LINK2 stored with a trailing newline
  let clean2: string; // LINK2 stored clean
  let signalA: string;
  let signalB: string;
  let utmVariant: string; // LINK with ?utm — the same WhatsApp group as shared1

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    // Round 7e (metered-services rule 1): fixtures go in as ONE batch per table. Auth users are the exception: the
    // admin API has no batch endpoint, so they are created (and deleted, below) one call per user.
    const people = [['host', 'P1542 DB Host'], ['attendee', 'P1542 DB Attendee'], ['stranger', 'P1542 DB Stranger']] as const;
    const made: { role: string; id: string; email: string; name: string }[] = [];
    for (const [role, name] of people) {
      const email = generateTestEmail();
      const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true, user_metadata: { name } });
      if (error || !data.user) throw error ?? new Error('createUser returned no user');
      made.push({ role, id: data.user.id, email, name });
      userIds.push(data.user.id);
    }
    // One insert for all three profiles (the same verified + pledged row createTestUser writes).
    const stamp = Date.now();
    const { error: profilesError } = await supabaseAdmin.from('profiles').insert(made.map((m, k) => ({
      id: m.id, email: m.email, name: m.name, slug: `p1542-db-${stamp}-${k}`, role: 'Test Engineer', linkedin_url: '',
      reason: 'Testing the Clarity Pledge', avatar_color: '#4A90E2', pledge_version: 2, accepted_terms_version: 'v1.4',
      banner_generation_attempted: false, is_verified: true, has_pledged: true,
    })));
    if (profilesError) throw profilesError;
    const byRole = (r: string) => { const m = made.find((x) => x.role === r)!; return { id: m.id, email: m.email }; };
    host = byRole('host');
    attendee = byRole('attendee');
    stranger = byRole('stranger');

    // One insert for all eight events, one for their group-chat links, one for the attendee's RSVPs.
    const plan: { key: string; title: string; url: string | null }[] = [
      { key: 'shared1', title: 'P1542 chat A', url: LINK },
      { key: 'shared2', title: 'P1542 chat A again', url: LINK },
      { key: 'noChat', title: 'P1542 no chat', url: null },
      { key: 'withNewline', title: 'P1542 chat B (newline)', url: `${LINK2}\n` },
      { key: 'clean2', title: 'P1542 chat B (clean)', url: LINK2 },
      { key: 'signalA', title: 'P1542 Signal A', url: SIGNAL_A },
      { key: 'signalB', title: 'P1542 Signal B', url: SIGNAL_B },
      { key: 'utmVariant', title: 'P1542 chat A (utm)', url: `${LINK}?utm_source=p1542` },
    ];
    const at = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data: evs, error: eventsError } = await supabaseAdmin.from('events').insert(plan.map((p, k) => ({
      slug: `test-event-p1542-db-${stamp}-${k}`, title: p.title, description: 'P1542 integration fixture', datetime: at,
      duration_minutes: 120, timezone: 'America/Los_Angeles', location: 'Somewhere', host_id: host.id, status: 'upcoming',
    }))).select('id, slug');
    if (eventsError || !evs) throw eventsError ?? new Error('events insert returned nothing');
    const idOf: Record<string, string> = {};
    plan.forEach((p, k) => { const e = evs.find((x) => x.slug === `test-event-p1542-db-${stamp}-${k}`)!; idOf[p.key] = e.id; eventIds.push(e.id); });
    const { error: linksError } = await supabaseAdmin.from('event_private_info')
      .insert(plan.filter((p) => p.url !== null).map((p) => ({ event_id: idOf[p.key], group_chat_url: p.url })));
    if (linksError) throw linksError;
    const { error: rsvpError } = await supabaseAdmin.from('event_rsvps').insert(plan.map((p) => ({ event_id: idOf[p.key], profile_id: attendee.id })));
    if (rsvpError) throw rsvpError;
    ({ shared1, shared2, noChat, withNewline, clean2, signalA, signalB, utmVariant } = idOf as Record<string, string>);
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    // Every row, user and event this file created — also after a failure. One call per table (rule 1): opens, then
    // events (their links and RSVPs cascade). Auth users one call each (no batch endpoint); profiles cascade from them.
    await cleanUpOrFail('p1542 group chat', [
      { what: 'group_chat_opens for profiles', ids: userIds, run: () => supabaseAdmin.from('group_chat_opens').delete().in('profile_id', userIds) },
      { what: 'events', ids: eventIds, run: () => supabaseAdmin.from('events').delete().in('id', eventIds) },
      ...userIds.map((id) => ({ what: 'auth user', ids: [id], run: () => supabaseAdmin.auth.admin.deleteUser(id) })),
    ]);
  });

  test('anon may not execute either function', async () => {
    const a = anonClient();
    const mark = await a.rpc('mark_group_chat_opened', { p_event_id: shared1 });
    const read = await a.rpc('group_chat_opened', { p_event_id: shared1 });
    expect(mark.error, 'anon mark must be refused').not.toBeNull();
    expect(read.error, 'anon read must be refused').not.toBeNull();
  });

  test('signed in but not registered: mark is refused (42501), read says false', async () => {
    const c = await clientFor(stranger.email);
    const mark = await c.rpc('mark_group_chat_opened', { p_event_id: shared1 });
    expect(mark.error?.code).toBe('42501');
    const read = await c.rpc('group_chat_opened', { p_event_id: shared1 });
    expect(read.error).toBeNull();
    expect(read.data).toBe(false);
  });

  test('an RSVP holder and the host: mark → true, then read → true', async () => {
    for (const who of [attendee, host]) {
      const c = await clientFor(who.email);
      const before = await c.rpc('group_chat_opened', { p_event_id: shared1 });
      expect(before.data, `${who === host ? 'host' : 'attendee'} not opened before the tap`).toBe(false);
      const mark = await c.rpc('mark_group_chat_opened', { p_event_id: shared1 });
      expect(mark.error).toBeNull();
      expect(mark.data).toBe(true);
      const read = await c.rpc('group_chat_opened', { p_event_id: shared1 });
      expect(read.data).toBe(true);
    }
  });

  test('a second mark adds no second row', async () => {
    const c = await clientFor(attendee.email);
    const again = await c.rpc('mark_group_chat_opened', { p_event_id: shared1 });
    expect(again.data).toBe(true);
    const { data } = await supabaseAdmin.from('group_chat_opens').select('chat_key').eq('profile_id', attendee.id);
    expect(data ?? []).toHaveLength(1);
  });

  test("a user's SELECT returns only their own rows (the host's row exists and stays invisible)", async () => {
    const { data: all } = await supabaseAdmin.from('group_chat_opens').select('profile_id').in('profile_id', [attendee.id, host.id]);
    expect((all ?? []).map((r) => r.profile_id).sort()).toEqual([attendee.id, host.id].sort()); // control: both rows exist
    const c = await clientFor(attendee.email);
    const { data, error } = await c.from('group_chat_opens').select('profile_id, chat_key');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).every((r) => r.profile_id === attendee.id)).toBe(true);
  });

  test('a direct INSERT is rejected (no client write policy; the RPC is the only writer)', async () => {
    const c = await clientFor(attendee.email);
    const { error } = await c.from('group_chat_opens').insert({ profile_id: attendee.id, chat_key: 'forged-key' });
    expect(error).not.toBeNull();
    const { data } = await supabaseAdmin.from('group_chat_opens').select('chat_key').eq('chat_key', 'forged-key');
    expect(data ?? []).toHaveLength(0);
  });

  test('an event with no group chat: mark → false, read → false', async () => {
    const c = await clientFor(attendee.email);
    const mark = await c.rpc('mark_group_chat_opened', { p_event_id: noChat });
    expect(mark.error).toBeNull();
    expect(mark.data).toBe(false);
    const read = await c.rpc('group_chat_opened', { p_event_id: noChat });
    expect(read.data).toBe(false);
  });

  test('two events sharing one link: opened on one counts as opened on both', async () => {
    const c = await clientFor(attendee.email);
    const read = await c.rpc('group_chat_opened', { p_event_id: shared2 }); // never marked on shared2 itself
    expect(read.error).toBeNull();
    expect(read.data).toBe(true);
  });

  test('a stored link with a trailing newline has the same key as the clean link (20261027170100 follow-up)', async () => {
    const c = await clientFor(attendee.email);
    const before = await c.rpc('group_chat_opened', { p_event_id: clean2 });
    expect(before.data).toBe(false); // control: not opened yet
    const mark = await c.rpc('mark_group_chat_opened', { p_event_id: withNewline });
    expect(mark.data).toBe(true);
    const read = await c.rpc('group_chat_opened', { p_event_id: clean2 });
    expect(read.data, 'newline-stored and clean link must share one key — needs migration 20261027170100').toBe(true);
  });

  test('two events with different Signal groups: opening one does not count for the other (20261027170100 follow-up)', async () => {
    const c = await clientFor(attendee.email);
    const mark = await c.rpc('mark_group_chat_opened', { p_event_id: signalA });
    expect(mark.data).toBe(true);
    const sameGroup = await c.rpc('group_chat_opened', { p_event_id: signalA });
    expect(sameGroup.data).toBe(true); // control: the opened group reads opened
    const other = await c.rpc('group_chat_opened', { p_event_id: signalB });
    expect(other.data, 'a different Signal group must not read as opened — needs migration 20261027170100').toBe(false);
  });

  test('a WhatsApp link differing only by ?utm is the same group (opened via the clean link)', async () => {
    const c = await clientFor(attendee.email);
    const read = await c.rpc('group_chat_opened', { p_event_id: utmVariant });
    expect(read.data).toBe(true);
  });
});

/**
 * Round 7b (Codex + Opus): the server's public.group_chat_key(x) must equal sha256(normaliseChatLink(x)) — the client's
 * own function, imported from the app — for realistic links. If the two rules ever drift, an "opened" tap recorded on
 * the server stops matching what the browser expects.
 */
test.describe('P1542: server and client chat keys agree (group_chat_key == sha256(normaliseChatLink))', () => {
  const INPUTS = [
    'https://signal.group/#CjQKIABCdefGHI',
    'https://signal.group/#CjQKIXYZuvw/',
    'https://chat.whatsapp.com/AbC123?utm_source=x',
    'https://chat.whatsapp.com/AbC123/?utm_source=x',
    'https://www.chat.whatsapp.com/AbC123',
    'https://CHAT.WhatsApp.com/AbC123',
    'https://chat.whatsapp.com:443/AbC123',
    '\thttps://chat.whatsapp.com/AbC123\r\n',
    ' https://chat.whatsapp.com/AbC123/// ',
    'https://wa.me/123456?text=hi',
    'https://t.me/joinchat/AbC?x=1',
    'https://t.me/+AbCdEf',
    'https://discord.gg/abc#y',
    'https://discord.com/invite/abc/',
    'https://example.org/groups/x/?id=1',
    'https://example.org/groups/x/#frag',
  ];
  const clientKey = (x: string) => createHash('sha256').update(normaliseChatLink(x), 'utf8').digest('hex');

  test('every realistic input hashes the same on both sides', async () => {
    // Round 7c (Codex): an error FAILS this test — the service role can execute group_chat_key, so a failure here is a
    // real regression (grants or the function), never a reason to skip the comparisons.
    const probe = await supabaseAdmin.rpc('group_chat_key', { p_url: INPUTS[0] });
    expect(probe.error, `group_chat_key must be callable by the service role: ${probe.error?.message}`).toBeNull();
    const mismatches: string[] = [];
    for (const x of INPUTS) {
      const { data, error } = await supabaseAdmin.rpc('group_chat_key', { p_url: x });
      expect(error, JSON.stringify(x)).toBeNull();
      if (data !== clientKey(x)) mismatches.push(`${JSON.stringify(x)} → client ${JSON.stringify(normaliseChatLink(x))}`);
    }
    expect(mismatches).toEqual([]);
    // Control: different groups really do get different keys on the server (the comparison is not trivially equal).
    const [a, b] = await Promise.all([INPUTS[0], INPUTS[1]].map((x) => supabaseAdmin.rpc('group_chat_key', { p_url: x })));
    expect(a.data).not.toBe(b.data);
  });
});

