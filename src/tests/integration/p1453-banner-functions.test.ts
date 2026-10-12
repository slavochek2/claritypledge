/**
 * @file p1453-banner-functions.test.ts
 * @description P1453: the two banner edge functions on the live TEST project.
 *
 * Always run (no image generation, no Gemini spend):
 *   - generate-agent-banner rejects a user JWT and the anon key (401), a human id (403), and an
 *     agent that already has a banner without `replace` (409 — no generation happens first);
 *   - generate-banner rejects a user JWT asking for an agent's id (403 — own profile only).
 *
 * Opt-in, because each case generates real images (P1453_LIVE_GEN=1 npm run test:integration):
 *   - a new user's own profile gets an artist banner with a bound credit; regenerate changes the
 *     artist; the credit reads back through the public path.
 *
 * Requires generate-banner and generate-agent-banner deployed to TEST.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LIVE_GEN = process.env.P1453_LIVE_GEN === '1';

async function signedIn(user: TestUser): Promise<{ client: SupabaseClient; token: string }> {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (error) throw error;
  return { client, token: data.session!.access_token };
}

async function call(fn: string, bearer: string, body: unknown, apikey = ANON) {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try { json = await res.json(); } catch { /* gateway error page */ }
  return { status: res.status, json };
}

async function anAgentId(withBanner: boolean): Promise<string | null> {
  const { data: agents } = await supabaseAdmin.from('agent_accounts').select('profile_id');
  const ids = (agents ?? []).map((a) => a.profile_id as string);
  if (ids.length === 0) return null;
  const { data } = await supabaseAdmin.from('profiles').select('id, banner_url').in('id', ids);
  return (data ?? []).find((p) => !!p.banner_url === withBanner)?.id ?? null;
}

describe('P1453: generate-agent-banner accepts only the service role, only for agents', () => {
  let user: TestUser;
  let userToken: string;
  let agentId: string | null;

  beforeAll(async () => {
    user = await createTestUser({ name: 'P1453 Fn' });
    userToken = (await signedIn(user)).token;
    agentId = await anAgentId(false) ?? await anAgentId(true);
  });

  afterAll(async () => {
    await deleteTestUser(user.user.id);
  });

  it('rejects a signed-in user JWT with 401', async () => {
    expect(agentId).not.toBeNull();
    const r = await call('generate-agent-banner', userToken, { profileId: agentId });
    expect(r.status).toBe(401);
  });

  it('rejects the anon key with 401', async () => {
    const r = await call('generate-agent-banner', ANON, { profileId: agentId });
    expect(r.status).toBe(401);
  });

  it('rejects a human profile id with 403, even with the service role', async () => {
    const r = await call('generate-agent-banner', SERVICE, { profileId: user.user.id, isAgent: true }, SERVICE);
    expect(r.status).toBe(403);
  });

  it('refuses an agent that already has a banner unless replace is set (409, nothing generated)', async () => {
    const withBanner = await anAgentId(true);
    if (!withBanner) return; // needs one agent banner on TEST (scripts/agent-banner.mjs --env test)
    const before = await supabaseAdmin.from('profiles').select('banner_url').eq('id', withBanner).single();
    const r = await call('generate-agent-banner', SERVICE, { profileId: withBanner }, SERVICE);
    expect(r.status).toBe(409);
    const after = await supabaseAdmin.from('profiles').select('banner_url').eq('id', withBanner).single();
    expect(after.data!.banner_url).toBe(before.data!.banner_url);
  });

  it('generate-banner admits at most 5 of 8 PARALLEL requests (reserve-then-count, no Gemini spend)', async () => {
    // A fresh user, so their rate-limit window is empty. Each request reserves BEFORE the
    // ownership check, so admitted requests stop at 403 (not their profile) and spend nothing.
    const racer = await createTestUser({ name: 'P1453 Racer' });
    try {
      const t = (await signedIn(racer)).token;
      const statuses = await Promise.all(Array.from({ length: 8 }, () =>
        call('generate-banner', t, { entityType: 'profile', entityId: agentId }).then((r) => r.status)));
      // AT MOST 5: a request's count can also see inserts that landed after its own, so under
      // contention fewer may pass — it errs toward refusing, never toward spending. The old
      // check-then-insert code admitted all 8 (measured on TEST before this fix).
      expect(statuses.filter((s) => s === 403).length).toBeLessThanOrEqual(5);
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(3);
      expect(statuses.every((s) => s === 403 || s === 429)).toBe(true);
    } finally {
      await supabaseAdmin.from('ai_rate_limits').delete().eq('user_id', racer.user.id);
      await deleteTestUser(racer.user.id);
    }
  });

  it('generate-banner: a user JWT asking for an agent profile gets 403 (own profile only)', async () => {
    const r = await call('generate-banner', userToken, { entityType: 'profile', entityId: agentId });
    expect(r.status).toBe(403);
  });
});

describe.skipIf(!LIVE_GEN)('P1453 (live generation): a new user gets an artist banner', () => {
  let user: TestUser;
  let token: string;

  beforeAll(async () => {
    user = await createTestUser({ name: 'P1453 Live' });
    token = (await signedIn(user)).token;
  });

  afterAll(async () => {
    await deleteTestUser(user.user.id);
  });

  it('generates, stores a bound credit, reads back publicly, and regenerate changes the artist', async () => {
    const first = await call('generate-banner', token, { entityType: 'profile', entityId: user.user.id });
    expect(first.status).toBe(200);
    const c1 = first.json.credit as { url: string; artist: string; sig: string; ink: string };
    expect(c1.url).toBe(first.json.url);
    expect(['cream', 'sepia']).toContain(c1.ink);

    // The client persists banner_url (as the page does after a successful generation).
    const { client } = await signedIn(user);
    await client.from('profiles').update({ banner_url: first.json.url, banner_generation_attempted: true }).eq('id', user.user.id);

    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await anon.rpc('get_profile_by_id', { p_id: user.user.id });
    const p = data as { banner_url: string; banner_credit: { url: string; sig: string } };
    expect(p.banner_credit.url).toBe(p.banner_url);

    const second = await call('generate-banner', token, { entityType: 'profile', entityId: user.user.id });
    expect(second.status).toBe(200);
    expect((second.json.credit as { artist: string }).artist).not.toBe(c1.artist);
  }, 300_000);
});
