/**
 * @file p1429-close-retry.test.ts
 * @description P1429 A5, against the live TEST project: what the server actually answers to a
 * retried close answer, which is what the client's recovery rests on. A retry after a landed
 * write is refused with 22023 "this ask is not offered" (not 23505), and the re-read no longer
 * lists the ask — so the client's "answered meanwhile" check moves the page on.
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
  let eventId: string;

  beforeAll(async () => {
    host = await createTestUser({ name: 'P1429 Close Host' });
    guest = await createTestUser({ name: 'P1429 Close Guest' });
    // The LinkedIn ask is offered only for a verified, pledged host with a link.
    await supabaseAdmin.from('profiles').update({ linkedin_url: 'https://www.linkedin.com/in/p1429-test-host', is_verified: true, has_pledged: true }).eq('id', host.user.id);
    const { data: ev, error } = await supabaseAdmin
      .from('events')
      .insert({
        slug: `p1429-close-${Date.now()}`,
        title: 'Clarity Night #99: P1429 close. Test',
        description: 'P1429 integration test event',
        datetime: new Date(Date.now() - 3600 * 1000).toISOString(),
        location: 'Test venue',
        host_id: host.user.id,
      })
      .select('id')
      .single();
    if (error) throw error;
    eventId = ev!.id;
    await supabaseAdmin.from('event_rsvps').insert({ event_id: eventId, profile_id: guest.user.id });
  });

  afterAll(async () => {
    await supabaseAdmin.from('personal_ask_answers').delete().eq('user_id', guest.user.id);
    if (eventId) await supabaseAdmin.from('events').delete().eq('id', eventId);
    for (const u of [host, guest]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  it('the retry is refused as not offered, and the re-read no longer lists the ask', async () => {
    const c = await signedIn(guest);
    const before = await c.rpc('get_event_close', { p_event_id: eventId });
    expect(before.error).toBeNull();
    expect((before.data as { asks: string[] }[])[0]!.asks).toContain('connect');

    expect((await c.rpc('answer_personal_ask', { p_event_id: eventId, p_ask: 'connect', p_answer: 'no' })).error).toBeNull();
    const retry = await c.rpc('answer_personal_ask', { p_event_id: eventId, p_ask: 'connect', p_answer: 'no' });
    expect(retry.error?.code).toBe('22023');
    expect(retry.error?.message).toMatch(/not offered/);

    const after = await c.rpc('get_event_close', { p_event_id: eventId });
    expect((after.data as { asks: string[] }[])[0]!.asks).not.toContain('connect');
  });
});
