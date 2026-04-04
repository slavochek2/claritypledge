/**
 * @file security-drop-set-config.spec.ts
 * @description Integration test for migration 20260403130000_security_drop_set_config.sql
 *
 * Verifies that public.set_config() was dropped.
 * This SECURITY DEFINER function accepted arbitrary GUC settings (disable triggers,
 * manipulate RLS, potential privilege escalation). It was created for E2E test
 * infrastructure but must not exist in production or test DBs.
 *
 * Test: calling public.set_config() via RPC must return a "function does not exist" error.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

test.describe('Security: public.set_config() function removed', () => {
  test('public.set_config() RPC call returns function-not-found error', async () => {
    // Call the function directly. If it was dropped, Supabase returns a PostgREST error
    // with code PGRST202 (function signature not found) or a Postgres error code 42883
    // (undefined_function).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any).rpc('set_config', {
      setting_name: 'app.test',
      new_value: 'value',
      is_local: true,
    });

    expect(error).not.toBeNull();

    // PostgREST returns PGRST202 when the RPC function does not exist,
    // or Postgres error 42883 (undefined_function) surfaced as a message.
    const isExpectedError =
      error!.code === 'PGRST202' ||
      error!.message?.includes('Could not find the function') ||
      error!.message?.includes('does not exist') ||
      error!.message?.includes('42883');

    expect(
      isExpectedError,
      `Expected set_config to be absent. Got: code=${error!.code} message=${error!.message}`
    ).toBe(true);
  });
});
