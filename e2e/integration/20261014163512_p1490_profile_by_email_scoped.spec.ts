/**
 * @file 20261014163512_p1490_profile_by_email_scoped.spec.ts
 * @description P1490 (part 2) — get_my_profile_by_email returns only a row the caller may
 * legitimately see: the caller's own profile, or a legacy /live profile (owned by an ANONYMOUS
 * auth user) whose stored address matches the caller's confirmed address. A profile held by any
 * other regular account is never returned, whatever its stored address.
 *
 * Runs against the TEST project as real signed-in users over the anon key. Fixture rows whose
 * stored address differs from their owner's auth address are written with the service role —
 * the only way such rows arise today (legacy data, admin tooling, a stale address).
 *
 * Controls (epistemic gate 7c): the sign-in callback's /live branch end to end — lookup returns
 * the legacy row, then migrate_live_profile migrates it; the caller's own row is returned; a
 * different address is still refused; anon still cannot execute it.
 *
 * Run: FORCE_COLOR=0 npx playwright test --project=integration e2e/integration/20261014163512_p1490_profile_by_email_scoped.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

test.describe.configure({ mode: 'serial' });

// Module-local service client: never signed in, so it always carries the service key.
const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cleanup: string[] = [];

async function signedIn(email: string): Promise<SupabaseClient> {
  const auth = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A confirmed auth user with NO profile row — the state the sign-in callback runs in. */
async function newcomer(email = generateTestEmail()) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  cleanup.push(data.user.id);
  return { id: data.user.id, email, client: await signedIn(email) };
}

/** A regular (non-anonymous) account whose stored profile address is `address`. */
async function regularAccountHolding(address: string) {
  const u = await createTestUser({ email: generateTestEmail(), reason: 'P1490 private reason' });
  cleanup.push(u.user.id);
  const { error } = await admin.from('profiles').update({ email: address }).eq('id', u.user.id);
  if (error) throw new Error(`fixture update failed: ${error.message}`);
  return u;
}

/** A legacy /live profile: owned by an anonymous auth user, holding `address`. */
async function legacyRow(address: string) {
  const a = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await a.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`anonymous sign-in failed: ${error?.message}`);
  expect(data.user.is_anonymous).toBe(true);
  cleanup.push(data.user.id);
  const slug = `p1490-legacy-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const { error: insErr } = await admin.from('profiles').insert({
    id: data.user.id,
    email: address,
    name: 'P1490 Legacy Guest',
    slug,
    reason: 'P1490 legacy reason',
    accepted_terms_version: 'v1.4',
  });
  if (insErr) throw new Error(`legacy insert failed: ${insErr.message}`);
  return { id: data.user.id, slug, name: 'P1490 Legacy Guest' };
}

async function exists(id: string) {
  const { data } = await admin.from('profiles').select('id').eq('id', id).maybeSingle();
  return !!data;
}

test.afterAll(async () => {
  for (const id of cleanup) await deleteTestUser(id).catch(() => undefined);
});

test.describe('P1490: get_my_profile_by_email never returns another regular account', () => {
  test('a regular account holding the caller\'s address (other letter case) is not returned', async () => {
    const address = generateTestEmail();
    const holder = await regularAccountHolding(address.toUpperCase());
    const me = await newcomer(address);

    const { data, error } = await me.client.rpc('get_my_profile_by_email', { p_email: me.email });
    expect(error, error?.message).toBeNull();
    expect(data?.id, 'another account\'s row must not be returned').not.toBe(holder.user.id);
    expect(data).toBeNull();
  });

  test('a regular account holding the caller\'s exact address is not returned', async () => {
    const address = generateTestEmail();
    const holder = await regularAccountHolding(address);
    const me = await newcomer(address);

    const { data, error } = await me.client.rpc('get_my_profile_by_email', { p_email: me.email });
    expect(error, error?.message).toBeNull();
    expect(data?.id, 'another account\'s row must not be returned').not.toBe(holder.user.id);
    expect(data).toBeNull();
  });

  test('with both the caller\'s own row and another account\'s case variant, only the own row comes back', async () => {
    const address = generateTestEmail();
    const me = await newcomer(address);
    const own = await me.client.rpc('upsert_my_profile', {
      p_data: { name: 'P1490 Own', slug: `p1490-own-${Date.now()}`, pledge_version: 2, accepted_terms_version: 'v1.4' },
    });
    expect(own.error, own.error?.message).toBeNull();
    const holder = await regularAccountHolding(address.toUpperCase());

    // Repeat: the pre-fix LIMIT 1 without ordering may pick either row on any given call.
    for (let i = 0; i < 5; i++) {
      const { data, error } = await me.client.rpc('get_my_profile_by_email', { p_email: me.email });
      expect(error, error?.message).toBeNull();
      expect(data?.id, `call ${i}: must be the caller's own row`).toBe(me.id);
      expect(data?.id).not.toBe(holder.user.id);
    }
  });

  // ── CONTROLS (legitimate callers) ───────────────────────────────────────────────────────

  test('control: the /live branch end to end — lookup finds the legacy row, migration completes', async () => {
    const address = generateTestEmail();
    const legacy = await legacyRow(address.toUpperCase());
    const me = await newcomer(address);

    // AuthCallbackPage: lookup by the session's own address, then migrate with the old data.
    const { data: found, error } = await me.client.rpc('get_my_profile_by_email', { p_email: me.email });
    expect(error, error?.message).toBeNull();
    expect(found?.id).toBe(legacy.id);
    expect(found?.slug).toBe(legacy.slug);
    expect(found?.reason).toBe('P1490 legacy reason');

    const { data: migrated, error: migErr } = await me.client.rpc('migrate_live_profile', {
      p_data: { name: found.name, slug: found.slug, pledge_version: 2, accepted_terms_version: 'v1.4' },
    });
    expect(migErr, migErr?.message).toBeNull();
    expect(migrated).toEqual({ id: me.id, migrated: true });
    expect(await exists(legacy.id), 'legacy row is removed by the migration').toBe(false);
  });

  test('control: the caller\'s own row is returned', async () => {
    const u = await createTestUser({ email: generateTestEmail() });
    cleanup.push(u.user.id);
    const c = await signedIn(u.email);
    const { data, error } = await c.rpc('get_my_profile_by_email', { p_email: u.email.toUpperCase() });
    expect(error, error?.message).toBeNull();
    expect(data?.id).toBe(u.user.id);
    expect(data?.email).toBe(u.email);
  });

  test('control: an address that is not the caller\'s is still refused', async () => {
    const other = await createTestUser({ email: generateTestEmail() });
    cleanup.push(other.user.id);
    const me = await newcomer();
    const { data, error } = await me.client.rpc('get_my_profile_by_email', { p_email: other.email });
    expect(error, error?.message).toBeNull();
    expect(data).toBeNull();
  });

  test('control: anon cannot execute it', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anon.rpc('get_my_profile_by_email', { p_email: generateTestEmail() });
    // 42501 (permission denied), not PGRST202 (function missing).
    expect(error?.code, `anon must be denied: ${error?.message}`).toBe('42501');
  });
});
