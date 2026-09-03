/**
 * Integration test: seal_and_send_letter resolves from a three-named-argument call.
 *
 * Migration: 20260902002000_p1070_drop_seal_and_send_letter_overload.sql
 *
 * P952 added `p_responses_mode` by re-declaring the function. CREATE OR REPLACE keys on the
 * signature, so a second function was created rather than the first replaced. With the new
 * argument carrying a DEFAULT, both candidates matched a call naming only the three shared
 * arguments and PostgREST refused to choose (PGRST203) — so a client built before P952 could
 * not seal a letter at all.
 *
 * WHY THIS TEST USES A NONEXISTENT LETTER ID: the surviving body raises 'Letter not found'
 * before any write (p1141:...), so the probe cannot mutate. That matters because the failure
 * being guarded is a ROUTING failure — PostgREST rejects the call before the function runs —
 * and routing is observable without a fixture. Building a real letter here would add the
 * seal path's own failure modes to a test about overload resolution.
 *
 * FAILURE PATH, EXERCISED BEFORE THE FIX (epistemic gate 7): run against prod and test on
 * 2026-09-01, ahead of the migration, both environments returned:
 *   PGRST203 Could not choose the best candidate function between:
 *     public.seal_and_send_letter(p_letter_id => uuid, p_predictions => jsonb, p_deliveries => jsonb),
 *     public.seal_and_send_letter(..., p_responses_mode => text)
 * so this test is known to fail when the defect is present, not merely assumed to.
 *
 * Authenticated, not anon: P1063 revoked anon EXECUTE on both overloads, so an anon caller
 * would fail on the grant rather than on resolution and the assertion would prove nothing.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';

const TEST_PASSWORD = 'test-password-12345';

/** A letter id that cannot exist, so the RPC short-circuits on its not-found guard. */
const ABSENT_LETTER_ID = '00000000-0000-0000-0000-000000000000';

test.describe('Migration: p1070 — seal_and_send_letter carries exactly one signature', () => {
  let userId: string;
  let userClient: ReturnType<typeof createClient>;

  test.beforeAll(async () => {
    const email = generateTestEmail();
    const { user } = await createTestUser({ email });
    userId = user.id;

    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const tempClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await tempClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
    if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
    userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });
  });

  test.afterAll(async () => {
    if (userId) await deleteTestUser(userId);
  });

  test('a three-named-argument call resolves instead of returning PGRST203', async () => {
    const { error } = await userClient.rpc('seal_and_send_letter', {
      p_letter_id: ABSENT_LETTER_ID,
      p_predictions: [],
      p_deliveries: [],
    });

    // The call must reach the function. Any domain error is fine; an unresolvable overload is not.
    expect(error).not.toBeNull();
    expect(error!.code).not.toBe('PGRST203');
    expect(error!.message).not.toContain('Could not choose the best candidate function');
    // Reaching the not-found guard proves the surviving body actually ran.
    expect(error!.message).toContain('Letter not found');
  });

  test('the four-argument call still resolves to the same surviving function', async () => {
    const { error } = await userClient.rpc('seal_and_send_letter', {
      p_letter_id: ABSENT_LETTER_ID,
      p_predictions: [],
      p_deliveries: [],
      p_responses_mode: 'invite',
    });

    expect(error).not.toBeNull();
    expect(error!.code).not.toBe('PGRST203');
    expect(error!.message).toContain('Letter not found');
  });
});
