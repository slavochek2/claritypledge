/**
 * @file 20261014171731_p1487_pending_terms_acceptance.spec.ts
 * @description Migration integration test for P1487 (P270 rule).
 *
 * `consume_pending_terms_acceptance()` records a terms acceptance made before sign-in, from intent
 * the server stored in the account's app_metadata — once, for the caller only. Nothing the client
 * sends chooses what is recorded: metadata a user can write about themselves is ignored, a stale
 * intent is discarded, and anon cannot call it.
 *
 * Run: npx playwright test --project=integration e2e/integration/20261014171731_p1487_pending_terms_acceptance.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const opts = { auth: { autoRefreshToken: false, persistSession: false } };

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL_, ANON_KEY, opts);
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return client;
}

async function setPending(userId: string, pending: unknown) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { pending_terms: pending } });
  expect(error, error?.message).toBeNull();
}

async function rows(userId: string) {
  const { data } = await supabaseAdmin.from('terms_acceptances').select('terms_version, acceptance_mode').eq('user_id', userId);
  return data ?? [];
}

async function pendingOf(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return (data.user?.app_metadata as Record<string, unknown> | undefined)?.pending_terms;
}

test.describe('P1487: pending terms acceptance is recorded once, from server-held intent only', () => {
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

  test('records the stored version once (explicit) and clears the intent', async () => {
    const u = await freshUser('P1487 Terms Once');
    await setPending(u.user.id, { version: 'v1.4', issued_at: new Date().toISOString() });
    const client = await signedIn(u.email);

    const first = await client.rpc('consume_pending_terms_acceptance');
    expect(first.error, first.error?.message).toBeNull();
    expect(first.data).toBe('v1.4');
    expect(await rows(u.user.id)).toEqual([{ terms_version: 'v1.4', acceptance_mode: 'explicit' }]);
    expect(await pendingOf(u.user.id)).toBeUndefined();

    const second = await client.rpc('consume_pending_terms_acceptance');
    expect(second.data).toBeNull();
    expect((await rows(u.user.id)).length).toBe(1);
  });

  test('control: nothing pending records nothing', async () => {
    const u = await freshUser('P1487 Terms None');
    const client = await signedIn(u.email);
    const { data, error } = await client.rpc('consume_pending_terms_acceptance');
    expect(error, error?.message).toBeNull();
    expect(data).toBeNull();
    expect(await rows(u.user.id)).toEqual([]);
  });

  test('metadata a user writes about themselves is never treated as intent', async () => {
    const u = await freshUser('P1487 Terms Self');
    const client = await signedIn(u.email);
    const { error: upErr } = await client.auth.updateUser({ data: { pending_terms: { version: 'v1.4', issued_at: new Date().toISOString() } } });
    expect(upErr, upErr?.message).toBeNull();
    const { data } = await client.rpc('consume_pending_terms_acceptance');
    expect(data).toBeNull();
    expect(await rows(u.user.id)).toEqual([]);
  });

  test('a stale intent is discarded without recording', async () => {
    const u = await freshUser('P1487 Terms Stale');
    await setPending(u.user.id, { version: 'v1.4', issued_at: new Date(Date.now() - 2 * 86400000).toISOString() });
    const client = await signedIn(u.email);
    const { data } = await client.rpc('consume_pending_terms_acceptance');
    expect(data).toBeNull();
    expect(await rows(u.user.id)).toEqual([]);
    expect(await pendingOf(u.user.id)).toBeUndefined();
  });

  test('anon cannot call it', async () => {
    const anon = createClient(URL_, ANON_KEY, opts);
    const { error } = await anon.rpc('consume_pending_terms_acceptance');
    expect(error).not.toBeNull();
  });
});
