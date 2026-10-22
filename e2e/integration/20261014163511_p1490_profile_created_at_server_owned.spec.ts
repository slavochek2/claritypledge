/**
 * @file 20261014163511_p1490_profile_created_at_server_owned.spec.ts
 * @description P1490 (part 1) — profiles.created_at is shown publicly as the pledge date, so it
 * is server-owned: a client-role write never chooses it.
 *   - UPDATE (anon/authenticated): keeps the stored value; the rest of the write saves.
 *   - INSERT (anon/authenticated): takes the server's time, whatever the request carries.
 *   - Owner-context writers (upsert_my_profile, migrate_live_profile) and service_role (admin
 *     tooling, test seeding) are unaffected.
 *
 * Runs against the TEST project as real signed-in users over the anon key. State is arranged
 * with the service role and every assertion reads the stored value back with the service role.
 *
 * Controls (epistemic gate 7c — the guard must not break what already works):
 *   - an ordinary own-profile edit (updateProfile shape) saves and keeps the stored date;
 *   - the terms re-acceptance write (acceptTerms shape) saves;
 *   - sign-in through upsert_my_profile: a new row gets the server time, a returning user's
 *     date is kept;
 *   - the /live migration through migrate_live_profile keeps the legacy row's original date
 *     (carried server-side, never from p_data), and with no legacy row uses the server time;
 *   - the service role can still set the column.
 *
 * Run: FORCE_COLOR=0 npx playwright test --project=integration e2e/integration/20261014163511_p1490_profile_created_at_server_owned.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { SERVER_CURRENT_TERMS_VERSION } from '../../supabase/functions/_shared/terms-version.ts';

test.describe.configure({ mode: 'serial' });

// Module-local service client: never signed in, so it always carries the service key.
const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A stored value no default could produce, and a client-supplied value distinct from it.
const STORED = '2025-03-01T08:00:00+00:00';
const CLIENT_SUPPLIED = '2001-01-01T00:00:00+00:00';
// A legacy /live row's original date, distinct from both of the above.
const LEGACY_DATE = '2024-02-29T10:30:00+00:00';
// Server-vs-runner clock tolerance for "took the server's time".
const NOW_TOLERANCE_MS = 10 * 60 * 1000;

const cleanup: string[] = [];

async function signedIn(email: string): Promise<SupabaseClient> {
  // Throwaway auth client — signing in on a shared client would replace its session.
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

async function seedCreatedAt(id: string, value = STORED) {
  const { error } = await admin.from('profiles').update({ created_at: value }).eq('id', id);
  if (error) throw new Error(`seed created_at failed: ${error.message}`);
}

async function storedRow(id: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('created_at, name, role, bio, accepted_terms_version')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`read failed: ${error.message}`);
  return data as { created_at: string; name: string; role: string; bio: string | null; accepted_terms_version: string } | null;
}

const ms = (iso: string) => new Date(iso).getTime();

function expectServerNow(iso: string | undefined) {
  expect(iso, 'row must exist').toBeTruthy();
  expect(Math.abs(ms(iso!) - Date.now()), `created_at ${iso} is not the server's current time`).toBeLessThan(NOW_TOLERANCE_MS);
}

let member: TestUser;

test.beforeAll(async () => {
  member = await createTestUser({ email: generateTestEmail(), name: 'P1490 Member' });
  cleanup.push(member.user.id);
});

test.afterAll(async () => {
  for (const id of cleanup) await deleteTestUser(id).catch(() => undefined);
});

test.describe('P1490: profiles.created_at is server-owned on client writes', () => {
  test('own-profile UPDATE keeps the stored date; the rest of the edit saves', async () => {
    await seedCreatedAt(member.user.id);
    const c = await signedIn(member.email);
    const { error } = await c
      .from('profiles')
      .update({ created_at: CLIENT_SUPPLIED, role: 'P1490 edited role' })
      .eq('id', member.user.id);
    expect(error, `own-profile update errored: ${error?.message}`).toBeNull();

    const row = await storedRow(member.user.id);
    expect(ms(row!.created_at)).toBe(ms(STORED));
    expect(row!.role).toBe('P1490 edited role');
  });

  test('own-profile upsert keeps the stored date', async () => {
    await seedCreatedAt(member.user.id);
    const c = await signedIn(member.email);
    // Only client-readable columns: a full-row upsert is refused outright (owner-only columns in
    // the conflict SET), which would prove nothing about this column.
    const { data: base } = await admin.from('profiles').select('id, slug, name').eq('id', member.user.id).single();
    const { error } = await c.from('profiles').upsert({ ...base, created_at: CLIENT_SUPPLIED });
    expect(error, `own-profile upsert errored: ${error?.message}`).toBeNull();
    expect(ms((await storedRow(member.user.id))!.created_at)).toBe(ms(STORED));
  });

  test('a first-time client INSERT takes the server time, not the supplied date', async () => {
    const me = await newcomer();
    const { error } = await me.client.from('profiles').insert({
      id: me.id,
      name: 'P1490 Direct Insert',
      slug: `p1490-direct-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      created_at: CLIENT_SUPPLIED,
    });
    expect(error, `own-profile insert errored: ${error?.message}`).toBeNull();
    expectServerNow((await storedRow(me.id))?.created_at);
  });

  // ── CONTROLS (legitimate writers) ───────────────────────────────────────────────────────

  test('control: an ordinary own-profile edit (updateProfile shape) saves and keeps the date', async () => {
    await seedCreatedAt(member.user.id);
    const c = await signedIn(member.email);
    const { error } = await c
      .from('profiles')
      .update({ name: 'P1490 Member Renamed', bio: 'P1490 bio', pledge_version: 2 })
      .eq('id', member.user.id);
    expect(error, `ordinary edit regressed: ${error?.message}`).toBeNull();
    const row = await storedRow(member.user.id);
    expect({ name: row!.name, bio: row!.bio }).toEqual({ name: 'P1490 Member Renamed', bio: 'P1490 bio' });
    expect(ms(row!.created_at)).toBe(ms(STORED));
  });

  test('control: the terms re-acceptance write (acceptTerms shape) saves', async () => {
    const c = await signedIn(member.email);
    await admin.from('profiles').update({ accepted_terms_version: 'v1.0' }).eq('id', member.user.id);
    const { error } = await c.from('profiles').update({ accepted_terms_version: SERVER_CURRENT_TERMS_VERSION }).eq('id', member.user.id);
    expect(error, `terms write regressed: ${error?.message}`).toBeNull();
    expect((await storedRow(member.user.id))!.accepted_terms_version).toBe(SERVER_CURRENT_TERMS_VERSION);
  });

  test('control: sign-in via upsert_my_profile — new row gets server time, returning user keeps the date', async () => {
    const me = await newcomer();
    const payload = {
      name: 'P1490 Callback',
      slug: `p1490-callback-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      role: 'Test Engineer',
      avatar_color: '#4A90E2',
      pledge_version: 2,
      accepted_terms_version: SERVER_CURRENT_TERMS_VERSION,
      created_at: CLIENT_SUPPLIED, // ignored: the RPC never reads it
    };
    const first = await me.client.rpc('upsert_my_profile', { p_data: payload });
    expect(first.error, first.error?.message).toBeNull();
    expectServerNow((await storedRow(me.id))?.created_at);

    await seedCreatedAt(me.id);
    const again = await me.client.rpc('upsert_my_profile', { p_data: { ...payload, name: 'P1490 Callback Again' } });
    expect(again.error, again.error?.message).toBeNull();
    const row = await storedRow(me.id);
    expect(row!.name).toBe('P1490 Callback Again');
    expect(ms(row!.created_at)).toBe(ms(STORED));
  });

  test('the /live migration through migrate_live_profile keeps the legacy row\'s original date', async () => {
    const address = generateTestEmail();
    // Legacy /live profile: owned by an anonymous auth user (written with the service role —
    // such rows are no longer client-creatable), carrying a distinct historical date.
    const a = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: anonData, error: anonErr } = await a.auth.signInAnonymously();
    expect(anonErr, anonErr?.message).toBeNull();
    const legacyId = anonData.user!.id;
    cleanup.push(legacyId);
    const legacySlug = `p1490-legacy-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const { error: legacyErr } = await admin.from('profiles').insert({
      id: legacyId, email: address, name: 'P1490 Legacy', slug: legacySlug, accepted_terms_version: SERVER_CURRENT_TERMS_VERSION,
      created_at: LEGACY_DATE,
    });
    expect(legacyErr, legacyErr?.message).toBeNull();
    expect(ms((await storedRow(legacyId))!.created_at)).toBe(ms(LEGACY_DATE)); // fixture took the date

    const me = await newcomer(address);
    const { data, error } = await me.client.rpc('migrate_live_profile', {
      // A date in p_data is never read: the carried value comes from the legacy row itself.
      p_data: { name: 'P1490 Legacy', slug: legacySlug, pledge_version: 2, accepted_terms_version: SERVER_CURRENT_TERMS_VERSION, created_at: CLIENT_SUPPLIED },
    });
    expect(error, error?.message).toBeNull();
    expect(data).toEqual({ id: me.id, migrated: true });
    expect(ms((await storedRow(me.id))!.created_at), 'original date survives the migration').toBe(ms(LEGACY_DATE));
    expect(await storedRow(legacyId), 'legacy row is removed').toBeNull();
  });

  test('control: migrate_live_profile with no legacy row creates the caller\'s row at server time', async () => {
    const me = await newcomer();
    const { data, error } = await me.client.rpc('migrate_live_profile', {
      p_data: {
        name: 'P1490 No Legacy', slug: `p1490-nolegacy-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
        pledge_version: 2, accepted_terms_version: SERVER_CURRENT_TERMS_VERSION, created_at: CLIENT_SUPPLIED,
      },
    });
    expect(error, error?.message).toBeNull();
    expect(data).toEqual({ id: me.id, migrated: false });
    expectServerNow((await storedRow(me.id))?.created_at);
  });

  test('control: the service role (admin / seeding path) can still set the date', async () => {
    await seedCreatedAt(member.user.id, '2024-06-15T12:00:00+00:00');
    expect(ms((await storedRow(member.user.id))!.created_at)).toBe(ms('2024-06-15T12:00:00+00:00'));
  });
});
