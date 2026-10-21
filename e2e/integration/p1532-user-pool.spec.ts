/**
 * P1532 — the worker-scoped user pool (supabase/migrations/20261021130000_p1532_e2e_user_pool.sql,
 * e2e/helpers/test-user.ts releasedPool).
 *
 * What the pool must guarantee, each pinned below:
 *   1. Releasing costs one request and leaves nothing visible: the profile and every row hanging off
 *      it are gone at once; only the auth user waits.
 *   2. The next createTestUser() in the worker reuses that auth user in one request, with a fresh
 *      profile (new name and slug, the verified + pledged baseline) and fresh user_metadata.
 *   3. A user whose auth state no longer matches a fresh one is never reused (password changed here).
 *   4. A cached sign-in is reused only while its session exists (a test that signed out ends it).
 *
 * Serial: the pool belongs to one worker, so release and claim must run in the same one.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

test.describe.configure({ mode: 'serial' });

const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function recordRequests() {
  const calls: Array<{ path: string; status: number }> = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await real(input, init);
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ path: new URL(href).pathname, status: res.status });
    return res;
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

async function profileOf(id: string) {
  const { data } = await admin.from('profiles').select('id, name, slug, is_verified, has_pledged').eq('id', id).maybeSingle();
  return data;
}

test.describe('P1532 worker user pool', () => {
  test.beforeAll(() => {
    expect(process.env.P1532_E2E_RUN_ID, 'playwright.config.ts sets the run id the pool depends on').toBeTruthy();
    delete process.env.P1532_POOL;
  });

  let first: TestUser;

  test('release: one request, profile and dependent rows gone, auth user kept', async () => {
    first = await createTestUser({ name: 'P1532 Pool A' });
    const { error } = await admin.from('clarity_docs').insert({ owner_id: first.user.id });
    expect(error).toBeNull();

    const rec = recordRequests();
    try {
      await deleteTestUser(first.user.id);
    } finally {
      rec.restore();
    }
    expect(rec.calls.map((c) => c.path)).toEqual(['/rest/v1/rpc/e2e_release_test_user']);
    expect(rec.calls.filter((c) => c.status >= 400)).toEqual([]);
    expect(await profileOf(first.user.id), 'released user has no profile').toBeNull();
    const { count } = await admin.from('clarity_docs').select('id', { count: 'exact', head: true }).eq('owner_id', first.user.id);
    expect(count).toBe(0);
    const { data } = await admin.auth.admin.getUserById(first.user.id);
    expect(data?.user?.id).toBe(first.user.id);
  });

  test('claim: the next createTestUser() reuses it in one request, with a fresh profile and metadata', async () => {
    const rec = recordRequests();
    let second: TestUser;
    try {
      second = await createTestUser({ name: 'P1532 Pool B' });
    } finally {
      rec.restore();
    }
    expect(rec.calls.map((c) => c.path)).toEqual(['/rest/v1/rpc/e2e_claim_test_user']);
    expect(second.user.id).toBe(first.user.id);
    expect(second.email).toBe(first.email);
    expect(second.slug).not.toBe(first.slug);
    expect(await profileOf(second.user.id)).toMatchObject({ name: 'P1532 Pool B', slug: second.slug, is_verified: true, has_pledged: true });
    const { data } = await admin.auth.admin.getUserById(second.user.id);
    expect(data?.user?.user_metadata).toMatchObject({ name: 'P1532 Pool B', slug: second.slug });
    first = second;
  });

  test('a user whose password changed is not reused', async () => {
    await deleteTestUser(first.user.id); // released
    const { error } = await admin.auth.admin.updateUserById(first.user.id, { password: 'p1532-changed-password' });
    expect(error).toBeNull();
    const fresh = await createTestUser({ name: 'P1532 Pool C' });
    try {
      expect(fresh.user.id, 'a fresh user, not the changed one').not.toBe(first.user.id);
    } finally {
      await deleteTestUsers([fresh.user.id, first.user.id]);
    }
    const { data } = await admin.auth.admin.getUserById(first.user.id);
    expect(data?.user ?? null).toBeNull();
  });

  test('claim reports whether a cached session is still alive', async () => {
    const u = await createTestUser({ name: 'P1532 Pool D' });
    const signer = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn, error } = await signer.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    expect(error).toBeNull();
    const sessionId = JSON.parse(Buffer.from(signIn.session!.access_token.split('.')[1]!, 'base64url').toString()).session_id;
    const claim = async () => {
      await admin.rpc('e2e_release_test_user', { p_user_id: u.user.id });
      const { data } = await admin.rpc('e2e_claim_test_user', {
        p_user_id: u.user.id, p_profile: { name: 'P1532 Pool D', slug: `p1532-pool-d-${Date.now()}` },
        p_user_metadata: {}, p_password: TEST_PASSWORD, p_session_id: sessionId,
      });
      return data as { reusable: boolean; session_alive: boolean };
    };
    try {
      expect(await claim()).toMatchObject({ reusable: true, session_alive: true });
      await signer.auth.signOut({ scope: 'global' });
      expect(await claim()).toMatchObject({ reusable: true, session_alive: false });
    } finally {
      await deleteTestUsers([u.user.id]);
    }
  });
});
