/**
 * @file 20260818150000_p1093_reassert_revoke.spec.ts
 * @description P1093: the revoke must survive a later migration that restores the grant.
 *
 * Migration: 20260818150000_p1093_reassert_revoke_over_drift_restore.sql
 *
 * This is NOT a duplicate of the P1093 canary. That file asserts what the writer *does*
 * to data when reached. This one asserts a property of the migration ORDER: that after
 * every migration in the repo has been applied, `authenticated` cannot execute the
 * writer — regardless of the fact that a later-timestamped migration
 * (20260818140000, P1065 drift remediation) grants exactly that privilege back.
 *
 * The distinction matters because the failure it guards is invisible to behavioural
 * tests run at the wrong moment. The grant was restored on test while the canary's
 * recorded result still said "9 passed"; the suite was not wrong, it was stale. A fresh
 * environment, a replay, or the production deploy applies migrations in timestamp order,
 * and without 20260818150000 the last word on this privilege is the restore.
 *
 * If this fails: some migration ordered after 20260818150000 has granted EXECUTE on this
 * function again. Do not fix it by editing this test. Find the migration, and read
 * P1102 first — the drift check that produced the first one will produce more.
 *
 * NOT COVERED (gate 7b): this asserts the grant as observed through a client role. It
 * does not exercise `service_role`, which deliberately retains EXECUTE.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

async function makeUserClient(email: string): Promise<SupabaseClient> {
  const temp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await temp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe('P1093 — the revoke is the last word on this privilege', () => {
  test.setTimeout(60000);

  let userId: string;
  let userEmail: string;

  test.beforeAll(async () => {
    const u = await createTestUser({ name: 'P1093 Ordering Probe' });
    userId = u.user.id;
    userEmail = u.user.email!;
  });

  test.afterAll(async () => {
    if (userId) await deleteTestUser(userId);
  });

  test('after all migrations, a signed-in caller still cannot execute the writer', async () => {
    const cli = await makeUserClient(userEmail);

    const { error } = await cli.rpc('persist_anonymous_completion', {
      p_nonce: NIL_UUID,
      p_letter_id: NIL_UUID,
      p_ratings: [],
      p_positions: [],
    });

    // 42501 = insufficient_privilege — the grant is absent.
    // Any other outcome means a later migration granted EXECUTE back. In particular a
    // P0001 here would mean the BODY ran (its own 'No delivery found' / 'Authentication
    // required' raise), which is the signature of a restored grant, not of a refusal.
    expect(
      error?.code,
      `the revoke must outrank every later migration touching this grant (got ${error?.code ?? 'no error — the call SUCCEEDED'})`,
    ).toBe('42501');
  });
});
