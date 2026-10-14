/**
 * @file 20261014183307_p1487_pending_terms_bound_to_link.spec.ts
 * @description Migration integration test for P1487 (P270 rule). Supersedes the spec for
 * 20261014171731, whose zero-argument function this migration drops.
 *
 * `consume_pending_terms_acceptance(p_nonce)` records a terms acceptance made before sign-in,
 * from intent the server stored in app_metadata — only when the caller presents the nonce that
 * was issued with the emailed sign-in link, only within the link's hour, only for the current
 * terms version, once, for the caller only. Nothing else the client sends chooses what is
 * recorded.
 *
 * Run: npx playwright test --project=integration e2e/integration/20261014183307_p1487_pending_terms_bound_to_link.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';
import { CURRENT_TERMS_VERSION } from '../../src/lib/constants';

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const NONCE = 'a'.repeat(48);

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL_, ANON_KEY, opts);
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return client;
}

async function setPending(userId: string, pending: Record<string, unknown>) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { pending_terms: pending } });
  expect(error, error?.message).toBeNull();
}

const fresh = (over: Record<string, unknown> = {}) => ({ version: CURRENT_TERMS_VERSION, issued_at: new Date().toISOString(), nonce: NONCE, ...over });

async function rows(userId: string) {
  const { data } = await supabaseAdmin.from('terms_acceptances').select('terms_version, acceptance_mode').eq('user_id', userId);
  return data ?? [];
}

async function pendingOf(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return (data.user?.app_metadata as Record<string, unknown> | undefined)?.pending_terms;
}

test.describe('P1487: pending terms acceptance is bound to its sign-in link', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  const users: string[] = [];
  async function freshUser(name: string) {
    const u = await createTestUser({ name });
    users.push(u.user.id);
    await supabaseAdmin.from('terms_acceptances').delete().eq('user_id', u.user.id);
    return u;
  }

  test.afterAll(async () => {
    for (const id of users) {
      await supabaseAdmin.from('terms_acceptances').delete().eq('user_id', id);
      await deleteTestUser(id);
    }
  });

  test('the issued nonce records the current version once (explicit) and clears the intent', async () => {
    const u = await freshUser('P1487 Bound Once');
    await setPending(u.user.id, fresh());
    const client = await signedIn(u.email);

    const first = await client.rpc('consume_pending_terms_acceptance', { p_nonce: NONCE });
    expect(first.error, first.error?.message).toBeNull();
    expect(first.data).toBe(CURRENT_TERMS_VERSION);
    expect(await rows(u.user.id)).toEqual([{ terms_version: CURRENT_TERMS_VERSION, acceptance_mode: 'explicit' }]);
    expect(await pendingOf(u.user.id)).toBeUndefined();

    const second = await client.rpc('consume_pending_terms_acceptance', { p_nonce: NONCE });
    expect(second.data).toBeNull();
    expect((await rows(u.user.id)).length).toBe(1);
  });

  test('a sign-in by another route (no nonce, or a different one) records nothing and leaves the intent', async () => {
    const u = await freshUser('P1487 Bound Other Route');
    await setPending(u.user.id, fresh());
    const client = await signedIn(u.email);

    for (const p_nonce of [null, 'b'.repeat(48)]) {
      const { data, error } = await client.rpc('consume_pending_terms_acceptance', { p_nonce });
      expect(error, error?.message).toBeNull();
      expect(data).toBeNull();
    }
    expect(await rows(u.user.id)).toEqual([]);
    expect(await pendingOf(u.user.id)).toBeTruthy();
  });

  test('an intent older than the link (one hour) is discarded without recording', async () => {
    const u = await freshUser('P1487 Bound Stale');
    await setPending(u.user.id, fresh({ issued_at: new Date(Date.now() - 2 * 3600_000).toISOString() }));
    const client = await signedIn(u.email);
    const { data } = await client.rpc('consume_pending_terms_acceptance', { p_nonce: NONCE });
    expect(data).toBeNull();
    expect(await rows(u.user.id)).toEqual([]);
    expect(await pendingOf(u.user.id)).toBeUndefined();
  });

  test('a superseded terms version is never recorded', async () => {
    const u = await freshUser('P1487 Bound Old Version');
    await setPending(u.user.id, fresh({ version: 'v1.3' }));
    const client = await signedIn(u.email);
    const { data } = await client.rpc('consume_pending_terms_acceptance', { p_nonce: NONCE });
    expect(data).toBeNull();
    expect(await rows(u.user.id)).toEqual([]);
  });

  test('metadata a user writes about themselves is never treated as intent', async () => {
    const u = await freshUser('P1487 Bound Self');
    const client = await signedIn(u.email);
    const { error: upErr } = await client.auth.updateUser({ data: { pending_terms: fresh() } });
    expect(upErr, upErr?.message).toBeNull();
    const { data } = await client.rpc('consume_pending_terms_acceptance', { p_nonce: NONCE });
    expect(data).toBeNull();
    expect(await rows(u.user.id)).toEqual([]);
  });

  test('anon cannot call it', async () => {
    const anon = createClient(URL_, ANON_KEY, opts);
    const { error } = await anon.rpc('consume_pending_terms_acceptance', { p_nonce: NONCE });
    expect(error).not.toBeNull();
  });
});
