/**
 * @file p1303-room-lookup-grant.spec.ts
 * @description P1303: the room-code lookup is for signed-in callers only.
 *
 * Asserted by MESSAGE, not by "an error occurred": the intended refusal happens at the grant,
 * which PostgREST reports as "permission denied for function". Both halves carry a control so
 * neither probe is blind.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

test.describe('P1303: room-code lookup grant', () => {
  let userId: string;
  let email: string;

  test.beforeAll(async () => {
    email = generateTestEmail();
    userId = (await createTestUser({ name: 'P1303 User', email })).user.id;
  });

  test.afterAll(async () => {
    if (userId) await deleteTestUser(userId);
  });

  test('anon is refused at the grant', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc('get_transcribe_room_by_code', { p_code: 'ZZZZZZ' });
    expect(error?.message ?? '', 'anon must not be able to execute the room-code lookup')
      .toMatch(/permission denied for function/i);

    // CONTROL: the same anon client reaches a function anon is deliberately granted, so the
    // refusal above is about this function's grant and not an unreachable API.
    const control = await anon.rpc('get_session_by_code', { p_code: 'ZZZZZZ' });
    expect(control.error, 'control: anon must still reach an allowlisted function').toBeNull();
  });

  test('a signed-in user still executes it', async () => {
    const user = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const signIn = await user.auth.signInWithPassword({ email, password: TEST_PASSWORD });
    if (signIn.error) throw new Error(`p1303 fixture: sign-in failed: ${signIn.error.message}`);

    const { data, error } = await user.rpc('get_transcribe_room_by_code', { p_code: 'ZZZZZZ' });
    expect(error, `authenticated must keep EXECUTE: ${error?.message}`).toBeNull();
    expect((data ?? []) as unknown[], 'an unknown code resolves to nothing').toHaveLength(0);
  });
});
