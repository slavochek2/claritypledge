/**
 * @file p877-reproduce.spec.ts
 * @description CANARY for P877 — full profiles directory PII readable via the public anon key.
 *
 * Bug: the `profiles` RLS SELECT policy is `using (true)` with no column scoping, and the
 * default Supabase grants give `anon` + `authenticated` SELECT on ALL columns. RLS is
 * row-level only — it does not gate columns. So the anon key (shipped in the browser bundle)
 * can bulk-read every user's `email`, `linkedin_url`, and `reason`.
 *
 * These tests FAIL now (the columns are readable) and PASS after the fix applies
 *   REVOKE SELECT (email, linkedin_url, reason) ON public.profiles FROM anon, authenticated;
 * PostgREST then returns 42501 (permission denied) when those columns are selected.
 *
 * Scope confirmed with founder (all 3 columns + authenticated revoke):
 *  - S1 anon → email           : denied
 *  - S2 anon → linkedin_url     : denied
 *  - S3 anon → reason           : denied
 *  - S4 authenticated → OTHER user's email : denied (revoke hits the authenticated role too)
 *  - S6 anon → display columns  : STILL readable (over-revoke regression guard)
 *
 * NOT covered here (fix-side, asserted by /fix — the accessor/RPC do not exist yet):
 *  - S5  authenticated own-email self-read via get_my_profile() SECURITY DEFINER accessor
 *  - public signature wall (linkedin_url + reason for verified+pledged users) via a
 *    get_featured_profiles() SECURITY DEFINER RPC — required so the blanket column REVOKE
 *    does not break clarity-tax-section / signature-wall / sign-pledge-page.
 *
 * TWO-CLIENT PATTERN (per security-backlog-rls.spec.ts):
 *  - supabaseAdmin: service role for setup/teardown (bypasses RLS + grants)
 *  - anon client:   the shipped-bundle key — the actual exposure surface
 *  - user client:   an authenticated "attacker" reading another user's row
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

const TEST_PASSWORD = 'test-password-12345';
const PII_COLUMNS = ['email', 'linkedin_url', 'reason'] as const;

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

test.describe('P877: profiles PII columns are NOT readable via the anon key', () => {
  let victimId: string;
  let attackerId: string;
  let attackerEmail: string;

  test.beforeAll(async () => {
    const victim = await createTestUser({ name: 'P877-Victim' });
    victimId = victim.user.id;

    // Populate the self-disclosed PII so the leak is concrete, not an empty column.
    const { error: updErr } = await supabaseAdmin
      .from('profiles')
      .update({
        linkedin_url: 'https://linkedin.com/in/p877-victim',
        reason: 'P877 self-disclosed reason — must never be anon-harvestable.',
      })
      .eq('id', victimId);
    expect(updErr, `victim profile PII setup failed: ${updErr?.message}`).toBeNull();

    const attacker = await createTestUser({ name: 'P877-Attacker' });
    attackerId = attacker.user.id;
    attackerEmail = attacker.email;
  });

  test.afterAll(async () => {
    await Promise.all([deleteTestUser(victimId), deleteTestUser(attackerId)]);
  });

  // S1, S2, S3 — the reported core: anon bulk-reads PII off the raw table.
  for (const col of PII_COLUMNS) {
    test(`anon key cannot SELECT ${col} from profiles`, async () => {
      const anon = makeAnonClient();

      const { data, error } = await anon
        .from('profiles')
        .select(col)
        .eq('id', victimId)
        .maybeSingle();

      // Post-fix: column REVOKE → PostgREST 42501. Pre-fix: error is null and the
      // value comes back — that is the symptom this canary must catch.
      expect(
        error,
        `anon key was able to read profiles.${col} — column is not gated`
      ).not.toBeNull();
      expect(error?.code).toMatch(/42501|PGRST301/);
      expect(
        (data as Record<string, unknown> | null)?.[col],
        `profiles.${col} value leaked to the anon client`
      ).toBeUndefined();
    });
  }

  // S4 — the authenticated role is revoked too: a logged-in user cannot read
  // ANOTHER user's email. (Own-email read is preserved separately via get_my_profile().)
  test('authenticated user cannot SELECT another user\'s email', async () => {
    const tempClient = makeAnonClient();
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: attackerEmail,
      password: TEST_PASSWORD,
    });
    expect(signInErr, `attacker sign-in failed: ${signInErr?.message}`).toBeNull();

    const attackerClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await attackerClient
      .from('profiles')
      .select('email')
      .eq('id', victimId) // someone else's row
      .maybeSingle();

    expect(
      error,
      'authenticated user was able to read another user\'s email'
    ).not.toBeNull();
    expect(error?.code).toMatch(/42501|PGRST301/);
    expect(
      (data as { email?: string } | null)?.email,
      'another user\'s email leaked to an authenticated client'
    ).toBeUndefined();
  });

  // S6 — over-revoke regression guard. Display columns MUST stay readable via anon
  // (avatars, names, the verified badge, the public wall scaffolding). This passes
  // both before and after the fix; it fails only if the fix revokes too much.
  test('anon key CAN still SELECT display columns (over-revoke guard)', async () => {
    const anon = makeAnonClient();

    const { data, error } = await anon
      .from('profiles')
      .select('name, slug, avatar_color, has_pledged, is_verified')
      .eq('id', victimId)
      .maybeSingle();

    expect(error, `display columns must remain anon-readable: ${error?.message}`).toBeNull();
    expect(data?.name, 'display name should be readable via anon').toBeTruthy();
  });
});
