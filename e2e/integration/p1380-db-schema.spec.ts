/**
 * @file p1380-db-schema.spec.ts
 * @description P270 canary + RLS proof for P1380 (20261001190000_p1380_starting_soon_arrivals_links.sql),
 * live against the test DB with real user JWTs:
 *   - mark_event_arrival: registrant only, idempotent (first time kept), refused on a cancelled
 *     event and to anon
 *   - event_arrivals: the person reads their own row, the host reads all, another attendee and
 *     anon read nothing; nobody writes the table directly
 *   - event_email_links: no role but service_role can read or write it; a deleted RSVP takes its
 *     tickets with it
 *   - event_rsvps.starting_soon_attempted_at exists; email_send_log accepts 'starting_soon'
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const HASH = (c: string) => c.repeat(64);

const anon = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function clientFor(u: TestUser): Promise<SupabaseClient> {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  expect(error).toBeNull();
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await supabaseAdmin.auth.signOut();
  return client;
}

test.describe('P1380: arrivals, email-link tickets, starting-soon bookkeeping', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let alice: TestUser; // registered, arrives
  let bob: TestUser; // registered, does not arrive
  let carol: TestUser; // not registered
  let eventId: string;
  let cancelledEventId: string;
  let aliceRsvpId: string;
  let bobRsvpId: string;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1380 Host' });
    alice = await createTestUser({ name: 'P1380 Alice' });
    bob = await createTestUser({ name: 'P1380 Bob' });
    carol = await createTestUser({ name: 'P1380 Carol' });
    const base = {
      description: 'P1380 integration test event',
      datetime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      location: 'Test venue, Test street',
      host_id: host.user.id,
      preparation_enabled: true,
    };
    const { data: evs, error } = await supabaseAdmin
      .from('events')
      .insert([
        // status set on BOTH rows: a multi-row insert whose rows differ in keys writes NULL, not
        // the column default, for a key a row omits (found here: the open event came back NULL).
        { ...base, slug: `p1380-it-${Date.now()}`, title: 'P1380 integration', status: 'upcoming' },
        { ...base, slug: `p1380-it-c-${Date.now()}`, title: 'P1380 integration (cancelled)', status: 'cancelled' },
      ])
      .select('id, status');
    expect(error).toBeNull();
    eventId = evs!.find((e) => e.status !== 'cancelled')!.id;
    cancelledEventId = evs!.find((e) => e.status === 'cancelled')!.id;
    const { data: rsvps, error: rErr } = await supabaseAdmin
      .from('event_rsvps')
      .insert([
        { event_id: eventId, profile_id: alice.user.id },
        { event_id: eventId, profile_id: bob.user.id },
        { event_id: cancelledEventId, profile_id: alice.user.id },
      ])
      .select('id, event_id, profile_id');
    expect(rErr).toBeNull();
    aliceRsvpId = rsvps!.find((r) => r.event_id === eventId && r.profile_id === alice.user.id)!.id;
    bobRsvpId = rsvps!.find((r) => r.profile_id === bob.user.id)!.id;
  });

  test.afterAll(async () => {
    for (const id of [eventId, cancelledEventId]) if (id) await supabaseAdmin.from('events').delete().eq('id', id);
    for (const u of [host, alice, bob, carol]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('schema: starting_soon_attempted_at exists; email_send_log accepts starting_soon', async () => {
    const { error } = await supabaseAdmin.from('event_rsvps').select('starting_soon_attempted_at').limit(1);
    expect(error).toBeNull();
    const { data, error: logErr } = await supabaseAdmin
      .from('email_send_log')
      .insert({ event_id: eventId, profile_id: alice.user.id, email_type: 'starting_soon', status: 'sent', mailgun_message_id: 'p1380-it' })
      .select('id')
      .single();
    expect(logErr).toBeNull();
    await supabaseAdmin.from('email_send_log').delete().eq('id', data!.id);
  });

  test('a registrant checks in; a second check-in keeps the first time', async () => {
    const a = await clientFor(alice);
    const first = await a.rpc('mark_event_arrival', { p_event_id: eventId });
    expect(first.error).toBeNull();
    await new Promise((r) => setTimeout(r, 1100));
    const second = await a.rpc('mark_event_arrival', { p_event_id: eventId });
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);
  });

  test('a non-registrant, anon, and a cancelled event are refused', async () => {
    const c = await clientFor(carol);
    expect((await c.rpc('mark_event_arrival', { p_event_id: eventId })).error?.code).toBe('42501');
    expect((await anon().rpc('mark_event_arrival', { p_event_id: eventId })).error).not.toBeNull();
    const a = await clientFor(alice);
    expect((await a.rpc('mark_event_arrival', { p_event_id: cancelledEventId })).error?.code).toBe('42501');
  });

  test('arrivals: own row, host sees all, another attendee and anon see none, no direct writes', async () => {
    const a = await clientFor(alice);
    const own = await a.from('event_arrivals').select('profile_id').eq('event_id', eventId);
    expect(own.data?.map((r) => r.profile_id)).toEqual([alice.user.id]);

    const b = await clientFor(bob);
    expect((await b.from('event_arrivals').select('profile_id').eq('event_id', eventId)).data).toEqual([]);
    const ins = await b.from('event_arrivals').insert({ event_id: eventId, profile_id: bob.user.id });
    expect(ins.error).not.toBeNull();

    const h = await clientFor(host);
    const hostView = await h.from('event_arrivals').select('profile_id').eq('event_id', eventId);
    expect(hostView.data?.map((r) => r.profile_id)).toEqual([alice.user.id]);

    const anonView = await anon().from('event_arrivals').select('profile_id').eq('event_id', eventId);
    expect(anonView.data ?? []).toEqual([]);
  });

  test('email-link tickets: service_role only; deleted with the RSVP', async () => {
    const { error } = await supabaseAdmin.from('event_email_links').insert([
      { token_hash: HASH('a'), rsvp_id: aliceRsvpId, purpose: 'arrived', expires_at: new Date(Date.now() + 3600e3).toISOString() },
      { token_hash: HASH('b'), rsvp_id: bobRsvpId, purpose: 'prepare', expires_at: new Date(Date.now() + 3600e3).toISOString() },
    ]);
    expect(error).toBeNull();

    const a = await clientFor(alice);
    const read = await a.from('event_email_links').select('token_hash');
    expect(read.error?.code).toBe('42501');
    expect((await anon().from('event_email_links').select('token_hash')).error?.code).toBe('42501');

    const bad = await supabaseAdmin.from('event_email_links').insert({ token_hash: HASH('c'), rsvp_id: bobRsvpId, purpose: 'anything', expires_at: new Date().toISOString() });
    expect(bad.error).not.toBeNull();

    await supabaseAdmin.from('event_rsvps').delete().eq('id', bobRsvpId);
    const left = await supabaseAdmin.from('event_email_links').select('token_hash').in('token_hash', [HASH('a'), HASH('b')]);
    expect(left.data?.map((r) => r.token_hash)).toEqual([HASH('a')]);
  });
});
