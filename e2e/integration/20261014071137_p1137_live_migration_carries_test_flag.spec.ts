/**
 * @file 20261014071137_p1137_live_migration_carries_test_flag.spec.ts
 * @description P1137: the /live -> authenticated profile migration must keep is_test_account.
 *
 * The migration used to be a client-side delete of the legacy row followed by
 * upsert_my_profile, which never writes is_test_account — so the new row always came out
 * false. migrate_live_profile now does the whole migration server-side and carries the flag
 * from the legacy row.
 *
 * Fixture shape: a legacy /live profile is a profile owned by an ANONYMOUS auth user (pre-P396
 * guests), holding the address the newcomer later signs in with. The newcomer has a confirmed
 * auth user and no profile yet — exactly what AuthCallbackPage's /live branch sees.
 *
 * Covered:
 *   - true -> true and false -> false, read back from the table (not the RPC's return value)
 *   - a legacy row stored with different letter case is still migrated (same rule as the
 *     client's lookup), and two case-variant candidates are refused as ambiguous
 *   - only an anonymous-owned row can be migrated: a regular account's row is refused and left
 *     intact, both through the RPC and through a direct client delete
 *   - clients cannot delete profiles at all, so a flagged account cannot drop and re-create its
 *     row to reset the flag
 *   - the flag cannot be obtained by a caller who does not own a flagged legacy row: an
 *     existing-profile caller is refused, a fresh caller gets false even when p_data asks for
 *     true, and somebody else's flagged row is left untouched
 *   - anon cannot execute it
 *   - atomicity: a failed create rolls back the legacy delete
 * Control: ordinary sign-in through upsert_my_profile is unchanged.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';
import { SERVER_CURRENT_TERMS_VERSION } from '../../supabase/functions/_shared/terms-version.ts';

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
  expect(error, `sign-in failed: ${error?.message}`).toBeNull();
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A confirmed auth user with NO profile row — the state AuthCallbackPage runs in. */
async function newcomer(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  expect(error, `createUser failed: ${error?.message}`).toBeNull();
  cleanup.push(data.user!.id);
  return { id: data.user!.id, email, client: await signedIn(email) };
}

/** An anonymous auth user (the pre-P396 /live guest identity). */
async function anonymousUser(): Promise<string> {
  const a = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await a.auth.signInAnonymously();
  expect(error, `anonymous sign-in failed: ${error?.message}`).toBeNull();
  expect(data.user?.is_anonymous).toBe(true);
  cleanup.push(data.user!.id);
  return data.user!.id;
}

/**
 * A legacy /live profile: owned by an anonymous auth user, holding `address`, with the given
 * flag. Written with the service role — such rows are no longer client-creatable.
 */
async function legacyRow(address: string, flag: boolean) {
  const id = await anonymousUser();
  const slug = `p1137-legacy-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const { error } = await admin.from('profiles').insert({
    id,
    email: address,
    name: 'P1137 Legacy Guest',
    slug,
    is_test_account: flag,
    is_verified: false,
    has_pledged: false,
    accepted_terms_version: SERVER_CURRENT_TERMS_VERSION,
  });
  expect(error, error?.message).toBeNull();
  return { id, slug, name: 'P1137 Legacy Guest' };
}

/** A regular (non-anonymous) account whose stored profile email is `address`. */
async function regularAccountHolding(address: string) {
  const u = await createTestUser({ email: generateTestEmail() });
  cleanup.push(u.user.id);
  const { error } = await admin.from('profiles').update({ email: address }).eq('id', u.user.id);
  expect(error).toBeNull();
  return { id: u.user.id, slug: u.slug, name: u.name };
}

async function row(id: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, slug, is_test_account')
    .eq('id', id)
    .maybeSingle();
  expect(error).toBeNull();
  return data as { id: string; slug: string; is_test_account: boolean } | null;
}

function payload(name: string, slug: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    slug,
    role: 'Test Engineer',
    avatar_color: '#4A90E2',
    pledge_version: 2,
    accepted_terms_version: SERVER_CURRENT_TERMS_VERSION,
    ...extra,
  };
}

test.afterAll(async () => {
  for (const id of cleanup) await deleteTestUser(id);
});

test.describe('P1137: /live migration carries is_test_account', () => {
  test('true -> true: a flagged legacy row migrates to a flagged row', async () => {
    const address = generateTestEmail();
    const legacy = await legacyRow(address, true);
    const me = await newcomer(address);

    const { data, error } = await me.client.rpc('migrate_live_profile', {
      p_data: payload(legacy.name, legacy.slug),
    });
    expect(error, error?.message).toBeNull();
    expect(data).toEqual({ id: me.id, migrated: true });

    const created = await row(me.id);
    expect(created?.is_test_account).toBe(true);
    expect(created?.slug).toBe(legacy.slug);
    expect(await row(legacy.id), 'legacy row is removed').toBeNull();
  });

  test('false -> false: an unflagged legacy row migrates to an unflagged row', async () => {
    const address = generateTestEmail();
    const legacy = await legacyRow(address, false);
    const me = await newcomer(address);

    const { error } = await me.client.rpc('migrate_live_profile', {
      p_data: payload(legacy.name, legacy.slug),
    });
    expect(error, error?.message).toBeNull();
    expect((await row(me.id))?.is_test_account).toBe(false);
    expect(await row(legacy.id)).toBeNull();
  });

  test('a legacy row stored with different letter case is migrated', async () => {
    const address = generateTestEmail();
    const legacy = await legacyRow(address.toUpperCase(), true);
    const me = await newcomer(address);

    const { data, error } = await me.client.rpc('migrate_live_profile', {
      p_data: payload(legacy.name, legacy.slug),
    });
    expect(error, error?.message).toBeNull();
    expect(data).toEqual({ id: me.id, migrated: true });
    expect((await row(me.id))?.is_test_account).toBe(true);
    expect(await row(legacy.id)).toBeNull();
  });

  test('two case-variant legacy rows are refused as ambiguous and both survive', async () => {
    const address = generateTestEmail();
    const a = await legacyRow(address.toUpperCase(), true);
    const [local, domain] = address.split('@');
    const b = await legacyRow(`${local.charAt(0).toUpperCase()}${local.slice(1)}@${domain}`, false);
    const me = await newcomer(address);

    const { error } = await me.client.rpc('migrate_live_profile', {
      p_data: payload('P1137 Ambiguous', `p1137-ambiguous-${Date.now()}`),
    });
    expect(error?.message, 'ambiguity must be refused').toContain('ambiguous');
    expect(await row(me.id)).toBeNull();
    expect(await row(a.id)).not.toBeNull();
    expect(await row(b.id)).not.toBeNull();
  });

  test('a regular account holding the address is refused and left intact', async () => {
    const address = generateTestEmail();
    const holder = await regularAccountHolding(address);
    const me = await newcomer(address);

    const { error } = await me.client.rpc('migrate_live_profile', {
      p_data: payload(holder.name, holder.slug),
    });
    expect(error?.message, 'only an anonymous-owned row may be migrated').toContain('not a legacy');
    expect(await row(me.id)).toBeNull();
    expect((await row(holder.id))?.slug).toBe(holder.slug);
  });

  test('a regular account holding the address cannot be deleted by the address owner directly', async () => {
    const address = generateTestEmail();
    const holder = await regularAccountHolding(address);
    const me = await newcomer(address);

    await me.client.from('profiles').delete().eq('id', holder.id);
    expect(await row(holder.id), 'another account\'s profile survives a client delete').not.toBeNull();
  });

  test('a flagged account cannot delete its own profile, so it cannot re-create it unflagged', async () => {
    const u = await createTestUser({ email: generateTestEmail() });
    cleanup.push(u.user.id);
    await admin.from('profiles').update({ is_test_account: true }).eq('id', u.user.id);
    const client = await signedIn(u.email);

    const del = await client.from('profiles').delete().eq('id', u.user.id);
    expect(del.error?.code, `client DELETE must be refused: ${del.error?.message}`).toBe('42501');

    await client.from('profiles').insert({ id: u.user.id, email: u.email, name: u.name, slug: u.slug });
    expect((await row(u.user.id))?.is_test_account, 'classification survives').toBe(true);
  });

  test('a caller who already has a profile is refused and their flag does not change', async () => {
    const u = await createTestUser({ email: generateTestEmail() });
    cleanup.push(u.user.id);
    const client = await signedIn(u.email);

    const { error } = await client.rpc('migrate_live_profile', {
      p_data: payload(u.name, u.slug, { is_test_account: true }),
    });
    expect(error?.message, 'existing-profile caller must be refused').toContain('already has a profile');
    expect((await row(u.user.id))?.is_test_account).toBe(false);
  });

  test('a fresh caller cannot obtain the flag from p_data or from someone else\'s flagged row', async () => {
    const othersAddress = generateTestEmail();
    const othersRow = await legacyRow(othersAddress, true);
    const me = await newcomer(generateTestEmail());

    const { data, error } = await me.client.rpc('migrate_live_profile', {
      p_data: payload('P1137 Fresh Caller', `p1137-fresh-${Date.now()}`, { is_test_account: true }),
    });
    expect(error, error?.message).toBeNull();
    expect(data).toEqual({ id: me.id, migrated: false });
    expect((await row(me.id))?.is_test_account).toBe(false);

    const untouched = await row(othersRow.id);
    expect(untouched, 'another address\'s row is never deleted').not.toBeNull();
    expect(untouched?.is_test_account).toBe(true);
  });

  test('anon cannot execute migrate_live_profile', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anon.rpc('migrate_live_profile', { p_data: payload('x', 'x') });
    // 42501 (permission denied), not PGRST202 (function missing) — a missing function would
    // also return an error and make this assertion pass for the wrong reason.
    expect(error?.code, `anon must be denied: ${error?.message}`).toBe('42501');
  });

  test('a failed create rolls back: the legacy row and its flag survive', async () => {
    const address = generateTestEmail();
    const legacy = await legacyRow(address, true);
    const taken = await createTestUser({ email: generateTestEmail() });
    cleanup.push(taken.user.id);
    const me = await newcomer(address);

    // A slug another profile already holds makes the create fail on the unique constraint.
    const { error } = await me.client.rpc('migrate_live_profile', {
      p_data: payload(legacy.name, taken.slug),
    });
    expect(error?.code).toBe('23505');
    expect(await row(me.id)).toBeNull();
    expect((await row(legacy.id))?.is_test_account).toBe(true);

    // The client's retry with a free slug then completes the migration.
    const retry = await me.client.rpc('migrate_live_profile', {
      p_data: payload(legacy.name, legacy.slug),
    });
    expect(retry.error, retry.error?.message).toBeNull();
    expect((await row(me.id))?.is_test_account).toBe(true);
  });

  test('control: ordinary sign-in through upsert_my_profile is unchanged', async () => {
    const me = await newcomer(generateTestEmail());
    const { error } = await me.client.rpc('upsert_my_profile', {
      p_data: payload('P1137 Control', `p1137-control-${Date.now()}`),
    });
    expect(error, error?.message).toBeNull();
    expect((await row(me.id))?.is_test_account).toBe(false);
  });
});
