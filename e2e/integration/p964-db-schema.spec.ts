/**
 * @file p964-db-schema.spec.ts
 * @description P270: Migration integration test — P964 get_letter_position_stories
 * delivery-scope + sender exclusion.
 *
 * Verifies:
 * 1. The function exists and is callable with the updated signature.
 * 2. Calling with a non-participant delivery returns an empty result set
 *    (participant gate still active).
 * 3. The function accepts the correct argument type (UUID).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

test.describe('Migration p964: get_letter_position_stories delivery-scope', () => {
  test.setTimeout(30000);

  let caller: TestUser;

  test.beforeAll(async () => {
    caller = await createTestUser({ withProfile: true });
  });

  test.afterAll(async () => {
    await deleteTestUser(caller.user.id);
  });

  test('function is callable and returns empty for non-participant delivery', async () => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email: caller.email, password: caller.password });

    const fakeDeliveryId = '00000000-0000-0000-0000-000000000001';
    const { data, error } = await client.rpc('get_letter_position_stories', {
      p_delivery_id: fakeDeliveryId,
    });

    expect(error, 'RPC must not error — function exists with correct signature').toBeNull();
    expect(Array.isArray(data), 'RPC must return an array').toBe(true);
    expect((data as unknown[]).length, 'Non-participant must get empty result').toBe(0);
  });
});
