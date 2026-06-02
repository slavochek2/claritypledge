/**
 * @file 20260602160000_p877_profiles_pii_column_grants.spec.ts
 * @description Migration integration test for P877 (P270 rule).
 *
 * The reproduce canary (p877-reproduce.spec.ts) proves the REVOKE denies direct
 * column reads. This test proves the SECURITY DEFINER accessors the migration adds
 * re-expose the data through opted-in, PII-safe paths — the new code paths that the
 * client refactor depends on. Per decisions.md (2026-05-31): anon-callable RPCs MUST
 * be exercised with an anon-key client, because service_role bypasses GRANT EXECUTE.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

const TEST_PASSWORD = 'test-password-12345';

function makeAnonClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function makeUserClient(accessToken: string) {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

test.describe('P877: profiles PII accessor RPCs', () => {
  // A verified+pledged user — linkedin_url/reason are public-by-design for this row.
  let pledgedId: string;
  let pledgedSlug: string;
  let pledgedEmail: string;
  // A non-pledged user — linkedin_url/reason must stay hidden from others.
  let guestId: string;
  let guestEmail: string;
  const LINKEDIN = 'https://linkedin.com/in/p877-pledged';
  const REASON = 'P877 reason — public for pledged, hidden otherwise.';

  test.beforeAll(async () => {
    const pledged = await createTestUser({ name: 'P877-Pledged' });
    pledgedId = pledged.user.id;
    pledgedEmail = pledged.email;
    pledgedSlug = `p877-pledged-${pledgedId.slice(0, 8)}`;
    const { error: e1 } = await supabaseAdmin.from('profiles').update({
      slug: pledgedSlug,
      is_verified: true,
      has_pledged: true,
      is_test_account: false,
      linkedin_url: LINKEDIN,
      reason: REASON,
    }).eq('id', pledgedId);
    expect(e1, `pledged setup: ${e1?.message}`).toBeNull();

    const guest = await createTestUser({ name: 'P877-Guest' });
    guestId = guest.user.id;
    guestEmail = guest.email;
    const { error: e2 } = await supabaseAdmin.from('profiles').update({
      has_pledged: false,
      is_verified: false,
      linkedin_url: 'https://linkedin.com/in/p877-guest',
      reason: 'P877 guest reason — must never leak.',
    }).eq('id', guestId);
    expect(e2, `guest setup: ${e2?.message}`).toBeNull();
  });

  test.afterAll(async () => {
    await Promise.all([deleteTestUser(pledgedId), deleteTestUser(guestId)]);
  });

  test('get_profile_by_id: anon gets display + public linkedin/reason for pledged, NO email', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_profile_by_id', { p_id: pledgedId });
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
    expect(data.name).toBe('P877-Pledged');
    expect(data.linkedin_url, 'pledged linkedin is public').toBe(LINKEDIN);
    expect(data.reason, 'pledged reason is public').toBe(REASON);
    expect(data.email, 'email must never leak via anon').toBeNull();
  });

  test('get_profile_by_id: non-pledged user linkedin/reason hidden from anon', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_profile_by_id', { p_id: guestId });
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(data.name).toBe('P877-Guest');
    expect(data.linkedin_url, 'non-pledged linkedin must be hidden').toBeNull();
    expect(data.reason, 'non-pledged reason must be hidden').toBeNull();
    expect(data.email).toBeNull();
  });

  test('get_profile_by_id: own row returns own email when authenticated', async () => {
    const tmp = makeAnonClient();
    const { data: signIn, error: signInErr } = await tmp.auth.signInWithPassword({
      email: guestEmail,
      password: TEST_PASSWORD,
    });
    expect(signInErr, `sign-in: ${signInErr?.message}`).toBeNull();
    const me = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await me.rpc('get_profile_by_id', { p_id: guestId });
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(data.email, 'own email must be returned to the owner').toBe(guestEmail);
    // Own linkedin/reason visible to self even though not pledged.
    expect(data.linkedin_url).toBe('https://linkedin.com/in/p877-guest');
  });

  test('get_profile_by_slug: resolves by slug with same gating', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_profile_by_slug', { p_slug: pledgedSlug });
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(data.id).toBe(pledgedId);
    expect(data.linkedin_url).toBe(LINKEDIN);
    expect(data.email).toBeNull();
  });

  test('get_featured_profiles: returns verified+pledged with linkedin/reason, no email', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_featured_profiles', { p_limit: null });
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const row = (data as Array<Record<string, unknown>>).find(r => r.id === pledgedId);
    expect(row, 'pledged user should appear in featured').toBeTruthy();
    expect(row!.linkedin_url).toBe(LINKEDIN);
    expect(row!.reason).toBe(REASON);
    expect('email' in row!, 'featured rows must not carry an email key').toBe(false);
    // Non-pledged guest must NOT appear.
    expect((data as Array<Record<string, unknown>>).some(r => r.id === guestId)).toBe(false);
  });

  test('get_my_profile_by_email: returns own row, rejects other email', async () => {
    const tmp = makeAnonClient();
    const { data: signIn } = await tmp.auth.signInWithPassword({
      email: guestEmail,
      password: TEST_PASSWORD,
    });
    const me = makeUserClient(signIn!.session!.access_token);

    const { data: own, error: ownErr } = await me.rpc('get_my_profile_by_email', { p_email: guestEmail });
    expect(ownErr, `rpc error: ${ownErr?.message}`).toBeNull();
    expect(own?.id).toBe(guestId);
    expect(own?.email).toBe(guestEmail);

    // Asking for someone else's email returns NULL — cannot be used to harvest PII.
    const { data: other } = await me.rpc('get_my_profile_by_email', { p_email: pledgedEmail });
    expect(other, 'must not return another user by email').toBeNull();
  });

  test('lookup_party_by_email: returns party fields, never email (authenticated)', async () => {
    const tmp = makeAnonClient();
    const { data: signIn } = await tmp.auth.signInWithPassword({
      email: guestEmail,
      password: TEST_PASSWORD,
    });
    const me = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await me.rpc('lookup_party_by_email', { p_email: pledgedEmail });
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(data.id).toBe(pledgedId);
    expect(data.name).toBe('P877-Pledged');
    expect('email' in data, 'party lookup must not carry email').toBe(false);
  });

  test('email_exists: true for known email, false for unknown (anon)', async () => {
    const anon = makeAnonClient();
    const { data: yes, error: e1 } = await anon.rpc('email_exists', { p_email: pledgedEmail });
    expect(e1, `rpc error: ${e1?.message}`).toBeNull();
    expect(yes).toBe(true);

    const { data: no } = await anon.rpc('email_exists', { p_email: 'p877-nobody@example.invalid' });
    expect(no).toBe(false);
  });

  test('lookup_party_by_email is NOT callable by anon (authenticated-only grant)', async () => {
    const anon = makeAnonClient();
    const { error } = await anon.rpc('lookup_party_by_email', { p_email: pledgedEmail });
    expect(error, 'anon must be denied execute on lookup_party_by_email').not.toBeNull();
    expect(error?.code).toMatch(/42501|PGRST202|PGRST301/);
  });

  test('get_my_profile_by_email is NOT callable by anon (authenticated-only grant)', async () => {
    const anon = makeAnonClient();
    const { error } = await anon.rpc('get_my_profile_by_email', { p_email: pledgedEmail });
    expect(error, 'anon must be denied execute on get_my_profile_by_email').not.toBeNull();
    expect(error?.code).toMatch(/42501|PGRST202|PGRST301/);
  });

  test('upsert_my_profile is NOT callable by anon (authenticated-only grant)', async () => {
    const anon = makeAnonClient();
    const { error } = await anon.rpc('upsert_my_profile', { p_data: { name: 'anon-should-not-write' } });
    expect(error, 'anon must be denied execute on upsert_my_profile').not.toBeNull();
    expect(error?.code).toMatch(/42501|PGRST202|PGRST301/);
  });
});
