/**
 * Integration test: P677 — position history trigger SECURITY DEFINER + RLS policy fix
 *
 * Canary: setting a position via authenticated userClient must persist AND
 * create a history row. Before the fix, WITH CHECK (false) on point_position_history
 * caused the trigger to fail and roll back the entire transaction (403).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

test.describe('Migration: P677 — position history trigger RLS fix', () => {
  let testUserId: string;
  let testEmail: string;
  let testPointId: string;

  test.beforeAll(async () => {
    testEmail = generateTestEmail();
    const { user, email } = await createTestUser({ email: generateTestEmail() });
    testUserId = user.id;
    testEmail = email;

    const point = await createTestPoint(testUserId, { statement: `P677 integration test ${Date.now()}` });
    testPointId = point.id;
  });

  test.afterAll(async () => {
    if (testPointId) {
      await supabaseAdmin.from('point_position_history').delete().eq('point_id', testPointId);
      await supabaseAdmin.from('point_positions').delete().eq('point_id', testPointId);
      await deleteTestPoint(testPointId);
    }
    if (testUserId) {
      await deleteTestUser(testUserId);
    }
  });

  test('position insert triggers history write — canary for trigger SECURITY DEFINER + RLS policy fix', async () => {
    // Sign in as test user
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: testEmail,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const accessToken = signIn!.session!.access_token;
    await supabaseAdmin.auth.signOut();

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    // Insert position — triggers log_position_change() → INSERT into point_position_history.
    // Before fix: WITH CHECK (false) blocks history insert, transaction rolls back (403).
    // After fix: WITH CHECK (auth.uid() = user_id) allows it.
    const { error: upsertError } = await userClient
      .from('point_positions')
      .upsert(
        { point_id: testPointId, user_id: testUserId, position: 'agree', reasoning: 'P677 canary' },
        { onConflict: 'point_id,user_id' }
      );

    expect(upsertError, `Position insert blocked — trigger RLS still broken: ${upsertError?.message}`).toBeNull();

    // Verify position persisted
    const { data: position, error: posError } = await supabaseAdmin
      .from('point_positions')
      .select('position')
      .eq('point_id', testPointId)
      .eq('user_id', testUserId)
      .single();

    expect(posError).toBeNull();
    expect(position?.position).toBe('agree');

    // Verify trigger wrote history row
    const { data: history, error: histError } = await supabaseAdmin
      .from('point_position_history')
      .select('position, user_id')
      .eq('point_id', testPointId)
      .eq('user_id', testUserId)
      .order('id', { ascending: false })
      .limit(1)
      .single();

    expect(histError, `No history row — trigger did not fire or was rolled back: ${histError?.message}`).toBeNull();
    expect(history?.position).toBe('agree');
    expect(history?.user_id).toBe(testUserId);
  });
});
