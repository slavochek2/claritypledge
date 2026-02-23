/**
 * @file p414-profile-bio-migration.spec.ts
 * @description Integration tests for P414: Profile bio — DB migration verification
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * Verifies:
 * 1. `bio` column exists on `profiles` table (migration applied)
 * 2. `bio` defaults to NULL for new profiles
 * 3. CHECK constraint enforces 160-char max (bypass attempt rejected)
 * 4. Authenticated user can write their own bio (RLS allows)
 * 5. Authenticated user cannot write another user's bio (RLS blocks)
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped JWT client: RLS assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const TABLE = 'profiles';
const COLUMN = 'bio';

test.describe('P414 Migration — profiles.bio column', () => {
  test.setTimeout(30000);

  let userA: TestUser;
  let userB: TestUser;
  let userAToken: string;

  test.beforeAll(async () => {
    userA = await createTestUser({ name: 'P414 Bio Test A' });
    userB = await createTestUser({ name: 'P414 Bio Test B' });

    // Get userA JWT for RLS tests
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email: userA.email,
      password: 'test-password-12345',
    });
    if (error || !signIn?.session) throw new Error(`P414: Failed to sign in userA: ${error?.message}`);
    userAToken = signIn.session.access_token;
    await supabaseAdmin.auth.signOut(); // restore admin client to service_role
  });

  test.afterAll(async () => {
    if (userA?.user?.id) await deleteTestUser(userA.user.id);
    if (userB?.user?.id) await deleteTestUser(userB.user.id);
  });

  // ── 1. Schema check ──────────────────────────────────────────────────────
  test('bio column exists in profiles table', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select(COLUMN)
      .limit(1);

    expect(
      error,
      `Migration not applied: "bio" missing from "profiles". Run: ./scripts/migrate.sh`
    ).toBeNull();
  });

  // ── 2. Default value ─────────────────────────────────────────────────────
  test('bio defaults to NULL for new profiles', async () => {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('id, bio')
      .eq('id', userA.user.id)
      .single();

    expect(error).toBeNull();
    expect(data?.bio).toBeNull();
  });

  // ── 3. CHECK constraint — 160-char max ───────────────────────────────────
  test('bio CHECK constraint rejects strings over 160 chars', async () => {
    const tooLong = 'A'.repeat(161);

    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ bio: tooLong })
      .eq('id', userA.user.id);

    // Expect a constraint violation
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/check/i);
  });

  test('bio CHECK constraint accepts strings up to 160 chars', async () => {
    const exactly160 = 'B'.repeat(160);

    const { error } = await supabaseAdmin
      .from(TABLE)
      .update({ bio: exactly160 })
      .eq('id', userA.user.id);

    expect(error).toBeNull();

    // Cleanup
    await supabaseAdmin.from(TABLE).update({ bio: null }).eq('id', userA.user.id);
  });

  // ── 4. RLS: owner can write own bio ──────────────────────────────────────
  test('authenticated user can update their own bio', async () => {
    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
    );

    const { error } = await userClient
      .from(TABLE)
      .update({ bio: 'Helping leaders communicate with clarity.' })
      .eq('id', userA.user.id);

    expect(error, `RLS blocked own-bio update: ${error?.message}`).toBeNull();

    // Cleanup
    await supabaseAdmin.from(TABLE).update({ bio: null }).eq('id', userA.user.id);
  });

  // ── 5. RLS: user cannot write another user's bio ─────────────────────────
  test('authenticated user cannot update another user bio', async () => {
    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
    );

    // userA tries to update userB's bio
    const { error, data } = await userClient
      .from(TABLE)
      .update({ bio: 'Injected bio' })
      .eq('id', userB.user.id)
      .select('bio');

    // RLS silently filters: no error, but 0 rows updated
    expect(error, 'Unexpected error on cross-user update').toBeNull();
    expect(data?.length ?? 0, 'RLS should prevent updating another user bio').toBe(0);
  });
});
