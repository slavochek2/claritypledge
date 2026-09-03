/**
 * P1095 migration — points.context is gone, and so is the out-of-band
 * create_point_with_position RPC that referenced it.
 *
 * Runs against the TEST project only:
 *   npx playwright test --project=integration \
 *     e2e/integration/20260902003000_p1095_drop_points_context.spec.ts
 *
 * The migration's own DO block asserts the same two facts at apply time. This
 * file asserts them from OUTSIDE the transaction that made them true, through
 * the same PostgREST surface the client uses — which is what a schema-cache
 * regression would actually break (P160 `is_private` shape).
 *
 * Red state: before 20260902003000, test 1 returns rows and test 2 gets a
 * business-logic error instead of PGRST202.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestPoint } from '../helpers/test-point';

function makeAnonClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

test.describe('P1095 migration: points.context dropped', () => {
  let validator: TestUser;
  let pointId: string;

  test.beforeAll(async () => {
    validator = await createTestUser({ name: 'P1095 Validator' });
    const point = await createTestPoint(validator.user.id, {
      statement: `P1095 migration check ${Date.now()}`,
      visibility: 'public',
    });
    pointId = point.id;
  });

  test.afterAll(async () => {
    if (pointId) await supabaseAdmin.from('points').delete().eq('id', pointId);
    if (validator?.user?.id) await deleteTestUser(validator.user.id);
  });

  test('selecting points.context is a schema error, not a null column', async () => {
    const { error } = await supabaseAdmin
      .from('points')
      .select('id, context')
      .eq('id', pointId);

    expect(error, 'the column must be gone, not merely empty').not.toBeNull();
    expect(error!.code).toBe('42703');
  });

  test('a point still reads and writes normally without it', async () => {
    const { data, error } = await supabaseAdmin
      .from('points')
      .select('id, statement, first_validator_id, tags, visibility')
      .eq('id', pointId)
      .single();

    expect(error, error?.message).toBeNull();
    expect(data!.id).toBe(pointId);
    expect(data!.first_validator_id).toBe(validator.user.id);

    // The client's own read path: anon selecting a public point.
    const { data: anonRows, error: anonError } = await makeAnonClient()
      .from('points')
      .select('id, statement')
      .eq('id', pointId);
    expect(anonError, anonError?.message).toBeNull();
    expect(anonRows).toHaveLength(1);
  });

  test('the out-of-band create_point_with_position RPC no longer exists', async () => {
    const { error } = await supabaseAdmin.rpc('create_point_with_position', {
      p_statement: 'unused',
    });

    // PGRST202 = absent from PostgREST's schema cache. Any other code would mean
    // some signature of the function is still callable.
    expect(error, 'the RPC must be gone').not.toBeNull();
    expect(error!.code).toBe('PGRST202');
  });
});
