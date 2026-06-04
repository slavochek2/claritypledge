/**
 * @file 20260605002428_p886_reapply_p877_column_gate.spec.ts
 * @description Migration integration test for P886 (P270 rule).
 *
 * P886 re-applies section 3 of the P877 migration (REVOKE table-level SELECT on
 * profiles + column-level GRANT on non-sensitive columns) as a NEW migration file —
 * the original version (20260602160000) is already recorded in prod's
 * schema_migrations, so it can never re-run, and the 2026-06-04 emergency mitigation
 * re-granted table-level SELECT (untracked drift) after the P877 grants 403'd every
 * login on a pre-P877 bundle.
 *
 * This test proves the migration's full guarantee on whatever DB it has been applied
 * to (test here; the prod twin is e2e/p886-reproduce.spec.ts):
 *   1. anon cannot SELECT email / linkedin_url / reason from profiles (42501)
 *   2. authenticated cannot SELECT another user's email
 *   3. anon CAN still SELECT the whitelisted display columns (over-revoke guard —
 *      an over-broad revoke is exactly the incident class: every login 403s)
 *   4. the P877 SECURITY DEFINER accessors still work (the deployed client's read path)
 *
 * On the test DB the gate is already active (P877 applied 2026-06-02), so this also
 * proves the re-apply migration is IDEMPOTENT — REVOKE + column GRANT must converge
 * to the same grant state whether the gate was on (test) or off (prod post-mitigation).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';

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

test.describe('P886: profiles column gate re-applied (section 3 of P877)', () => {
  // The "other user" whose PII must not be readable.
  let targetId: string;
  // The signed-in caller for the authenticated-role assertions.
  let callerId: string;
  let callerEmail: string;

  test.beforeAll(async () => {
    const target = await createTestUser({ name: 'P886-Target' });
    targetId = target.user.id;
    const caller = await createTestUser({ name: 'P886-Caller' });
    callerId = caller.user.id;
    callerEmail = caller.email;
  });

  test.afterAll(async () => {
    if (targetId) await deleteTestUser(targetId);
    if (callerId) await deleteTestUser(callerId);
  });

  // 1. anon role: each PII column individually denied.
  for (const col of PII_COLUMNS) {
    test(`anon key cannot SELECT ${col} from profiles`, async () => {
      const anon = makeAnonClient();

      const { data, error } = await anon.from('profiles').select(col).limit(1);

      expect(error, `anon read profiles.${col} — column gate is OFF`).not.toBeNull();
      expect(error?.code).toMatch(/42501|PGRST301/);
      expect(data).toBeNull();
    });
  }

  // 2. authenticated role: each PII column individually denied on another user's row
  //    (the REVOKE must hit authenticated too — anon-only was rejected in P877).
  test("authenticated user cannot SELECT another user's PII columns", async () => {
    const anon = makeAnonClient();
    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
      email: callerEmail,
      password: TEST_PASSWORD,
    });
    expect(signInErr, `caller sign-in failed: ${signInErr?.message}`).toBeNull();

    const caller = makeUserClient(signIn!.session!.access_token);

    for (const col of PII_COLUMNS) {
      const { data, error } = await caller
        .from('profiles')
        .select(col)
        .eq('id', targetId)
        .limit(1);

      expect(error, `authenticated role read another user's ${col} — gate is OFF`).not.toBeNull();
      expect(error?.code).toMatch(/42501|PGRST301/);
      expect(data).toBeNull();
    }
  });

  // 3. Over-revoke guard: display columns stay anon-readable. An over-broad revoke
  //    here is the incident mode (every login/profile read 403s).
  test('anon key CAN still SELECT whitelisted display columns', async () => {
    const anon = makeAnonClient();

    const { data, error } = await anon
      .from('profiles')
      .select('id, name, slug, avatar_color, is_verified, has_pledged')
      .eq('id', targetId);

    expect(error, `display columns must stay anon-readable: ${error?.message}`).toBeNull();
    expect(data?.length).toBe(1);
  });

  // 4. Accessor guard: the SECURITY DEFINER read path the deployed client uses
  //    must survive the re-apply (sections 1–2 of P877 are NOT in this migration —
  //    this asserts the re-apply didn't clobber them).
  test('P877 accessors still work after the re-apply (get_profile_by_id)', async () => {
    const anon = makeAnonClient();

    const { data, error } = await anon.rpc('get_profile_by_id', { p_id: targetId });

    expect(error, `get_profile_by_id failed: ${error?.message}`).toBeNull();
    expect(data?.id).toBe(targetId);
    // anon caller is not the owner and the fixture is not verified+pledged → PII fields null
    expect(data?.email).toBeNull();
  });
});
