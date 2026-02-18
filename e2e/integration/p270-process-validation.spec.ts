/**
 * @file p270-process-validation.spec.ts
 * @description P270: Dogfooding test — validates the integration test infrastructure.
 *
 * Also serves as the retroactive integration test for P160 (Private Session Mode):
 * verifies that `clarity_sessions.is_private` exists in the schema — the exact column
 * whose absence caused the production bug "Could not find the 'is_private' column of
 * 'clarity_sessions' in the schema cache".
 *
 * If this test fails: run `supabase db push` to apply 20260217_p160_is_private_session.sql
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

test.describe('P270 + P160 retroactive: clarity_sessions.is_private migration', () => {
  const testCodes: string[] = [];

  test.afterAll(async () => {
    // Clean up any test rows created
    if (testCodes.length > 0) {
      await supabaseAdmin.from('clarity_sessions').delete().in('code', testCodes);
    }
  });

  // ── 1. Schema check: column must exist ───────────────────────────────────
  test('is_private column exists on clarity_sessions (P160 migration applied)', async () => {
    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('is_private')
      .limit(1);

    // Either of these messages means the migration was not applied:
    // "Could not find the 'is_private' column of 'clarity_sessions' in the schema cache"
    // "column 'is_private' of relation 'clarity_sessions' does not exist"
    expect(
      error?.message ?? '',
      `P160 migration not applied. Run: supabase db push\nError: ${error?.message}`
    ).not.toMatch(/is_private.*schema cache|schema cache.*is_private|column.*does not exist/i);
  });

  // ── 2. Default value: new sessions should default to is_private = false ──
  test('is_private defaults to false on new sessions', async () => {
    const code = `TEST-P270-${Date.now()}`;
    testCodes.push(code);

    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code, status: 'waiting' })
      .select('is_private, id')
      .single();

    expect(error).toBeNull();
    expect(data?.is_private).toBe(false);
  });

  // ── 3. Non-default: is_private = true must be writable ───────────────────
  test('is_private can be set to true (private session)', async () => {
    const code = `TEST-P270-PRIV-${Date.now()}`;
    testCodes.push(code);

    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code, status: 'waiting', is_private: true })
      .select('is_private, id')
      .single();

    expect(error).toBeNull();
    expect(data?.is_private).toBe(true);
  });
});
