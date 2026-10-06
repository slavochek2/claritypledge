/**
 * @file p1429-close-retry.test.ts
 * @description P1429 A5, against the live TEST project: what the server answers to a retried
 * close answer, which is what the client's one retry rests on. Before migration 20261006191000 the
 * retry was refused with 22023 "this ask is not offered" (not 23505 as first assumed). Now the
 * same answer again succeeds and is stored once; a different answer still fails.
 *
 *   npm run test:integration -- p1429
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

async function signedIn(user: TestUser): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (error) throw error;
  return c;
}

describe('P1429 A5: a retried close answer', () => {
  let host: TestUser;
  let guest: TestUser;
  let joiner: TestUser;
  let decliner: TestUser;
  let eventId: string;

  beforeAll(async () => {
    host = await createTestUser({ name: 'P1429 Close Host' });
    guest = await createTestUser({ name: 'P1429 Close Guest' });
    joiner = await createTestUser({ name: 'P1429 Close Joiner' });
    decliner = await createTestUser({ name: 'P1429 Close Decliner' });
    // The LinkedIn ask is offered only for a verified, pledged host with a link.
    await supabaseAdmin.from('profiles').update({ linkedin_url: 'https://www.linkedin.com/in/p1429-test-host', is_verified: true, has_pledged: true }).eq('id', host.user.id);
    const { data: ev, error } = await supabaseAdmin
      .from('events')
      .insert({
        slug: `p1429-close-${Date.now()}`,
        title: 'Clarity Night #99: P1429 close. Test',
        description: 'P1429 integration test event',
        datetime: new Date(Date.now() - 3600 * 1000).toISOString(),
        location: 'Test venue, Chiang Mai', // the community ask invites to the Chiang Mai group
        host_id: host.user.id,
      })
      .select('id')
      .single();
    if (error) throw error;
    eventId = ev!.id;
    await supabaseAdmin.from('event_rsvps').insert([guest, joiner, decliner].map((u) => ({ event_id: eventId, profile_id: u.user.id })));
  });

  afterAll(async () => {
    for (const u of [guest, joiner, decliner]) {
      await supabaseAdmin.from('personal_ask_answers').delete().eq('user_id', u.user.id);
      await supabaseAdmin.from('membership').delete().eq('user_id', u.user.id);
    }
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId);
    for (const u of [host, guest, joiner, decliner]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  it('the same answer again succeeds and is stored once; a different answer still fails', async () => {
    const c = await signedIn(guest);
    const before = await c.rpc('get_event_close', { p_event_id: eventId });
    expect(before.error).toBeNull();
    expect((before.data as { asks: string[] }[])[0]!.asks).toContain('connect');

    expect((await c.rpc('answer_personal_ask', { p_event_id: eventId, p_ask: 'connect', p_answer: 'no' })).error).toBeNull();
    const retry = await c.rpc('answer_personal_ask', { p_event_id: eventId, p_ask: 'connect', p_answer: 'no' });
    expect(retry.error).toBeNull();
    expect(retry.data).toBe(true);
    const { data: rows } = await supabaseAdmin.from('personal_ask_answers').select('ask, answer').eq('user_id', guest.user.id).eq('event_id', eventId);
    expect(rows).toEqual([{ ask: 'connect', answer: 'no' }]);

    const other = await c.rpc('answer_personal_ask', { p_event_id: eventId, p_ask: 'connect', p_answer: 'yes' });
    expect(other.error?.code).toBe('22023');
  });

  it('a hand-made community yes is still refused, even after a Not now', async () => {
    const c = await signedIn(guest);
    const r = await c.rpc('answer_personal_ask', { p_event_id: eventId, p_ask: 'community', p_answer: 'yes' });
    expect(r.error).not.toBeNull();
  });

  it('a Join retried after it landed succeeds with the group; a Join after a Not now still fails', async () => {
    const j = await signedIn(joiner);
    const first = await j.rpc('join_community_from_close', { p_event_id: eventId });
    expect(first.error).toBeNull();
    const again = await j.rpc('join_community_from_close', { p_event_id: eventId });
    expect(again.error).toBeNull();
    expect(again.data).toBe(first.data);

    const d = await signedIn(decliner);
    expect((await d.rpc('answer_personal_ask', { p_event_id: eventId, p_ask: 'community', p_answer: 'no' })).error).toBeNull();
    const join = await d.rpc('join_community_from_close', { p_event_id: eventId });
    expect(join.error).not.toBeNull();
    const { count } = await supabaseAdmin.from('membership').select('*', { count: 'exact', head: true }).eq('user_id', decliner.user.id);
    expect(count).toBe(0);
  });
});
