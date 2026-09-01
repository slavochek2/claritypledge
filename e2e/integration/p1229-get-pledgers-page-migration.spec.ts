/**
 * @file p1229-get-pledgers-page-migration.spec.ts
 * @description Integration test for the P1229 migration `get_pledgers_page(p_limit, p_offset)`.
 *
 * Per P270: every migration ships with an integration test against the test DB.
 *
 * CONTRACT (mirrors 20260902000000_p1229_get_pledgers_page.sql):
 *   - callable by anon (same GRANT shape as P877's get_featured_profiles)
 *   - returns { total, profiles[] }; profiles carry the P877 public row shape and NEVER email
 *   - p_limit is clamped server-side to 1..100 — the unbounded fetch cannot be re-created
 *   - p_offset pages through the same ordering (reason-first, then newest); pages don't overlap
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

function makeAnonClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type Page = { total: number; profiles: Array<Record<string, unknown>> };

test.describe('Migration: P1229 get_pledgers_page', () => {
  test('anon can call it and gets a bounded page with the public row shape', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_pledgers_page', { p_limit: 5, p_offset: 0 });
    expect(error).toBeNull();
    const page = data as Page;
    expect(typeof page.total).toBe('number');
    expect(Array.isArray(page.profiles)).toBe(true);
    expect(page.profiles.length).toBeLessThanOrEqual(5);
    for (const row of page.profiles) {
      expect(row).not.toHaveProperty('email');
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('slug');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('created_at');
    }
  });

  test('p_limit is clamped to 100 (the unbounded fetch is unreachable)', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_pledgers_page', { p_limit: 5000, p_offset: 0 });
    expect(error).toBeNull();
    const page = data as Page;
    expect(page.profiles.length).toBeLessThanOrEqual(100);
    // The test DB holds well over 100 pledgers; if that ever changes the clamp is still
    // proven by the inequality above, this just makes the intent visible.
    if (page.total > 100) expect(page.profiles.length).toBe(100);
  });

  test('p_offset pages without overlap and keeps reason-first ordering', async () => {
    const anon = makeAnonClient();
    const first = (await anon.rpc('get_pledgers_page', { p_limit: 30, p_offset: 0 })).data as Page;
    const second = (await anon.rpc('get_pledgers_page', { p_limit: 30, p_offset: 30 })).data as Page;
    const ids1 = new Set(first.profiles.map((p) => p.id));
    for (const p of second.profiles) expect(ids1.has(p.id)).toBe(false);
    const all = [...first.profiles, ...second.profiles];
    const hasReason = all.map((p) => ((p.reason as string | null) ?? '').trim() !== '');
    // Once a row without a reason appears, no later row may have one.
    const firstEmpty = hasReason.indexOf(false);
    if (firstEmpty !== -1) expect(hasReason.slice(firstEmpty).some(Boolean)).toBe(false);
  });
});
