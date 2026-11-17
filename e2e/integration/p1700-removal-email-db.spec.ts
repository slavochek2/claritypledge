/**
 * @file p1700-removal-email-db.spec.ts
 * @description P1700 integration proof on the TEST backend with real user JWTs:
 *   - remove_event_attendee records had_registration; my_event_removed answers only for the caller
 *   - send-event-emails action 'removed': host-only (403), needs userId (400), one 'removal' log row per removal
 *   - a profile that never registered is recorded with had_registration=false and gets no email
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const FN_URL = `${SUPABASE_URL}/functions/v1/send-event-emails`;

const anon = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function tokenFor(u: TestUser): Promise<string> {
  // The edge function validates the session (auth.getUser), so the session must stay alive: no signOut.
  const { data, error } = await anon().auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  expect(error).toBeNull();
  return data!.session!.access_token;
}

async function clientFor(u: TestUser): Promise<SupabaseClient> {
  const token = await tokenFor(u);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function callRemoved(u: TestUser, body: Record<string, unknown>) {
  const token = await tokenFor(u);
  return fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: 'removed', ...body }),
  });
}

test.describe('P1700: removed-attendee notice', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  let host: TestUser;
  let removed: TestUser;
  let bystander: TestUser;
  let neverRegistered: TestUser;
  let eventId: string;

  const removalLogs = async (profileId: string) => {
    const { data, error } = await supabaseAdmin
      .from('email_send_log').select('id, status, email_type')
      .eq('event_id', eventId).eq('profile_id', profileId).eq('email_type', 'removal');
    expect(error).toBeNull();
    return data ?? [];
  };
  const removalRow = async (userId: string) => {
    const { data, error } = await supabaseAdmin
      .from('event_removals').select('had_registration, notified_at')
      .eq('event_id', eventId).eq('user_id', userId).single();
    expect(error).toBeNull();
    return data!;
  };

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1700 Host' });
    removed = await createTestUser({ name: 'P1700 Removed' });
    bystander = await createTestUser({ name: 'P1700 Bystander' });
    neverRegistered = await createTestUser({ name: 'P1700 Never' });
    const { data: ev, error } = await supabaseAdmin.from('events').insert({
      slug: `p1700-it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: 'P1700 integration',
      description: 'P1700 integration test event',
      datetime: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      location: 'Test venue, Test street',
      host_id: host.user.id,
      status: 'upcoming',
    }).select('id').single();
    expect(error).toBeNull();
    eventId = ev!.id;
    const { error: rErr } = await supabaseAdmin.from('event_rsvps').insert({ event_id: eventId, profile_id: removed.user.id });
    expect(rErr).toBeNull();
  });

  test.afterAll(async () => {
    const ids = [host, removed, bystander, neverRegistered].map(u => u?.user?.id).filter(Boolean) as string[];
    if (eventId) {
      await supabaseAdmin.from('email_send_log').delete().eq('event_id', eventId);
      await supabaseAdmin.from('event_removals').delete().eq('event_id', eventId);
      await supabaseAdmin.from('event_rsvps').delete().eq('event_id', eventId);
      await supabaseAdmin.from('events').delete().eq('id', eventId);
    }
    for (const id of ids) await supabaseAdmin.from('email_send_log').delete().eq('profile_id', id);
    for (const id of ids) await deleteTestUser(id);
  });

  test('host removes a registered person: had_registration true; my_event_removed is caller-scoped', async () => {
    const h = await clientFor(host);
    const { error } = await h.rpc('remove_event_attendee', { p_event: eventId, p_user: removed.user.id });
    expect(error).toBeNull();
    expect((await removalRow(removed.user.id)).had_registration).toBe(true);

    const r = await clientFor(removed);
    expect((await r.rpc('my_event_removed', { p_event: eventId })).data).toBe(true);
    expect((await anon().rpc('my_event_removed', { p_event: eventId })).data).toBe(false);
    const b = await clientFor(bystander);
    expect((await b.rpc('my_event_removed', { p_event: eventId })).data).toBe(false);
  });

  test('a non-host gets 403 and a host call without userId gets 400', async () => {
    expect((await callRemoved(bystander, { eventId, userId: removed.user.id })).status).toBe(403);
    expect((await callRemoved(host, { eventId })).status).toBe(400);
    expect(await removalLogs(removed.user.id)).toHaveLength(0);
  });

  test('host calls removed: 200 and exactly one removal log row', async () => {
    const res = await callRemoved(host, { eventId, userId: removed.user.id });
    expect(res.status).toBe(200);
    const logs = await removalLogs(removed.user.id);
    // /finish review: the send must actually go out (TEST sends through the real mail service); a failure fails the run.
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('sent');
    expect((await removalRow(removed.user.id)).notified_at).not.toBeNull();
  });

  test('calling again sends nothing more, sequentially and concurrently', async () => {
    const res = await callRemoved(host, { eventId, userId: removed.user.id });
    expect(res.status).toBe(200);
    const both = await Promise.all([
      callRemoved(host, { eventId, userId: removed.user.id }),
      callRemoved(host, { eventId, userId: removed.user.id }),
    ]);
    expect(both.map(r => r.status)).toEqual([200, 200]);
    const logs = await removalLogs(removed.user.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('sent');
  });

  test('a profile that never registered: had_registration false and nothing is sent', async () => {
    const h = await clientFor(host);
    const { error } = await h.rpc('remove_event_attendee', { p_event: eventId, p_user: neverRegistered.user.id });
    expect(error).toBeNull();
    expect((await removalRow(neverRegistered.user.id)).had_registration).toBe(false);
    const res = await callRemoved(host, { eventId, userId: neverRegistered.user.id });
    expect(res.status).toBe(200);
    expect(await removalLogs(neverRegistered.user.id)).toHaveLength(0);
  });
});
