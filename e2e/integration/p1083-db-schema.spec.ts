/**
 * @file p1083-db-schema.spec.ts
 * @description P270 integration coverage for the ready_submissions migration
 * (20260816120000_p1083_ready_submissions.sql). No test user needed — this table
 * has no auth/owner column by design (P1083's own data model), so this is a
 * one-client-plus-admin pattern rather than the usual two-client-with-test-user
 * template: an anon-key client proves what a real visitor can do, and the admin
 * client proves the schema/constraint shape independent of RLS.
 *
 * Scoped-by-id cleanup only (deleteReadySubmissions), never a table-wide delete
 * — this file's Playwright project (`integration`) runs concurrently with `chromium`
 * by default, and an unconditional table wipe here previously raced
 * e2e/p1083-ready-distribution.spec.ts's assertions when both ran together
 * (adversarial review, 2026-08-17: reproduced directly — all 5 tests in that file
 * failed when run alongside this one, passed when run alone). Containment checks
 * (`some(row => row.id === mySeededId)`) replace exact-array assertions for the
 * same reason: this table can hold rows from other concurrently-running tests.
 *
 * Each test tracks and cleans up its OWN ids via a local array + try/finally, not
 * a shared module-level array — a shared array + generic afterEach would itself
 * race once tests in this file run in parallel (no serial mode here either): one
 * test's afterEach could splice out and delete another still-running test's
 * not-yet-used id.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { deleteReadySubmissions, seedReadySubmission } from '../helpers/test-ready';

const anonClient = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

test.describe('Migration: P1083 — ready_submissions', () => {
  test('table and columns exist (admin, bypasses RLS)', async () => {
    const { error } = await supabaseAdmin
      .from('ready_submissions')
      .select('id, value, created_at')
      .limit(1);
    expect(error, `Migration not applied: ${error?.message}`).toBeNull();
  });

  test('the value CHECK constraint rejects a value above 10', async () => {
    const { error } = await supabaseAdmin.from('ready_submissions').insert({ value: 11 });
    expect(error?.code).toBe('23514'); // check_violation
  });

  test('the value CHECK constraint rejects a value below 0', async () => {
    const { error } = await supabaseAdmin.from('ready_submissions').insert({ value: -1 });
    expect(error?.code).toBe('23514'); // check_violation
  });

  test('anon cannot forge created_at — column-level INSERT is restricted to value only', async () => {
    const { error } = await anonClient
      .from('ready_submissions')
      .insert({ value: 5, created_at: '2099-01-01T00:00:00Z' });
    expect(error?.code).toBe('42501'); // insufficient_privilege
  });

  test('anon can insert with no auth (matches the no-login-entry-point requirement)', async () => {
    const ids: string[] = [];
    try {
      const { data, error } = await anonClient
        .from('ready_submissions')
        .insert({ value: 6 })
        .select('id')
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      if (data?.id) ids.push(data.id);
    } finally {
      await deleteReadySubmissions(ids);
    }
  });

  test('anon can read a fresh submission', async () => {
    const ids: string[] = [];
    try {
      const id = await seedReadySubmission(7);
      ids.push(id);
      const { data, error } = await anonClient.from('ready_submissions').select('id, value');
      expect(error).toBeNull();
      expect(data?.some((row) => row.id === id && row.value === 7)).toBe(true);
    } finally {
      await deleteReadySubmissions(ids);
    }
  });

  test('the retention-window RLS policy hides a submission older than 10 minutes from anon', async () => {
    const ids: string[] = [];
    try {
      const id = await seedReadySubmission(3, 11); // 11 minutes ago, via admin (bypasses RLS to seed)
      ids.push(id);
      const { data, error } = await anonClient.from('ready_submissions').select('id, value');
      expect(error).toBeNull();
      expect(data?.some((row) => row.id === id)).toBe(false);
      // Confirm the row genuinely exists (admin can still see it) — proves this is
      // the RLS filter doing the work, not an absent row.
      const { data: adminRow } = await supabaseAdmin
        .from('ready_submissions')
        .select('value')
        .eq('id', id)
        .single();
      expect(adminRow?.value).toBe(3);
    } finally {
      await deleteReadySubmissions(ids);
    }
  });
});
