/**
 * @file p929-pledge-version-client-writable.spec.ts
 * @description Contract test for P929 — re-pledge adopts the current oath version.
 *
 * The P929 fix writes `pledge_version` from the client (use-pledge-form upgrade flow →
 * updateProfile → direct `profiles` UPDATE). That only works if an authenticated client
 * can write its OWN pledge_version. Unlike is_verified/has_pledged (pinned by the P880
 * guard trigger), pledge_version is NOT a trust column, and the P571 UPDATE policy's
 * WITH CHECK constrains only is_test_account — so the write should persist.
 *
 * This test EXECUTES that capability (rather than inferring it from policy text):
 *   - an authenticated client updating its own pledge_version succeeds and persists
 *   - the P880 guard does NOT neutralize pledge_version (contrast: it would pin has_pledged)
 *
 * State is arranged + read back via supabaseAdmin (service_role bypasses the guard).
 * Runs against the TEST DB via .env.test.local.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

function makeUserClient(accessToken: string): SupabaseClient {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

async function readVersion(id: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('pledge_version')
    .eq('id', id)
    .single();
  return (data as { pledge_version: number | null } | null)?.pledge_version ?? null;
}

test.describe('P929: authenticated client can write its own pledge_version', () => {
  test.describe.configure({ timeout: 60_000 });

  let user: TestUser;
  let userId: string;
  let userClient: SupabaseClient;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P929 Contract User' });
    userId = user.user.id;
    const signIn = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await signIn.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    if (error || !data.session) throw new Error(`[P929] sign-in failed: ${error?.message}`);
    userClient = makeUserClient(data.session.access_token);
  });

  test.afterAll(async () => {
    if (userId) await deleteTestUser(userId);
  });

  test('client UPDATE of own pledge_version persists (the seam the re-pledge fix relies on)', async () => {
    // Arrange: stamp an OLD version via service role (simulates a grandfathered signer).
    const { error: arrangeErr } = await supabaseAdmin.from('profiles').update({ pledge_version: 4 }).eq('id', userId);
    expect(arrangeErr, `arrange failed: ${arrangeErr?.message}`).toBeNull();
    expect(await readVersion(userId)).toBe(4);

    // Act: the authenticated client bumps its own pledge_version (what updateProfile does).
    const { error: updateErr } = await userClient.from('profiles').update({ pledge_version: 5 }).eq('id', userId);

    // Assert: not blocked by RLS or the guard trigger, and the new value persisted.
    expect(updateErr, `client pledge_version write rejected: ${updateErr?.message}`).toBeNull();
    expect(await readVersion(userId), 'pledge_version was bumped to current').toBe(5);
  });

  test('guard does NOT pin pledge_version (contrast with has_pledged)', async () => {
    // pledge_version is freely client-writable; has_pledged is pinned. Prove the former
    // by writing a distinct value and reading it back.
    const { error } = await userClient.from('profiles').update({ pledge_version: 4 }).eq('id', userId);
    expect(error, `pledge_version write should not be guarded: ${error?.message}`).toBeNull();
    expect(await readVersion(userId)).toBe(4);
  });

  // P929 Done-When #3: passive login must PRESERVE a grandfathered signer's version.
  // The login path is AuthCallbackPage → upsert_my_profile with
  //   pledge_version: existingProfile.pledgeVersion ?? CURRENT
  // For a returning v4 user that passes 4 — this test proves the login RPC keeps it 4
  // (does NOT force-bump to the current version). Re-stamping here would silently
  // upgrade every grandfathered pledger on plain login — the exact failure to guard.
  test('passive login (upsert_my_profile with stored version) preserves v4 — no force-bump', async () => {
    // Arrange a returning v4 pledger.
    await supabaseAdmin.from('profiles').update({ pledge_version: 4 }).eq('id', userId);
    // Read the row's own NOT NULL fields so the upsert's ON CONFLICT branch is valid.
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('name, slug, email')
      .eq('id', userId)
      .single();

    // Simulate the auth-callback login upsert for a returning user: it carries the
    // EXISTING stored version (4), not the current pointer.
    const { error } = await userClient.rpc('upsert_my_profile', {
      p_data: {
        name: existing!.name,
        slug: existing!.slug,
        email: existing!.email,
        pledge_version: 4,
      },
    });
    expect(error, `login upsert failed: ${error?.message}`).toBeNull();
    expect(await readVersion(userId), 'login preserved v4 — not bumped to current').toBe(4);
  });
});
