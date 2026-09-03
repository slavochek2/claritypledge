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

  // `profiles` is a deliberately unscoped shared table and the chromium project inserts
  // pledgers concurrently (e2e-testing-guide.md — shared table, P1083). The original form of
  // this test took page 0 and page 30 in two calls and asserted the id sets were disjoint;
  // any insert at the head between the calls shifts every offset by one and makes page 2
  // legitimately repeat a row, so it failed whenever `npm run test:e2e` ran both projects
  // together (measured: red in the combined run, 3/3 green with --project=integration alone).
  //
  // Non-overlap is a property of the ORDER BY, not of a pair of calls. Proving the sort key
  // is a STRICT total order inside ONE snapshot proves LIMIT/OFFSET slices of it cannot
  // overlap, by construction — and does so without a second call to race.
  test('the page is a strict total order, so p_offset slices cannot overlap', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_pledgers_page', { p_limit: 60, p_offset: 0 });
    expect(error).toBeNull();
    const rows = (data as Page).profiles as Array<{ id: string; reason: string | null; created_at: string }>;
    expect(rows.length).toBeGreaterThan(1);

    // No duplicates inside one page.
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);

    // Strictly decreasing on (has-reason, created_at, id) — the migration's ORDER BY. No ties
    // anywhere means every row has exactly one position, so no two offsets can return it.
    //
    // created_at is compared as a STRING, never via Date.parse: Postgres timestamps carry
    // microseconds (…:34.662162+00:00) and Date.parse truncates to milliseconds, inventing ties
    // between rows the server ordered by their true sub-millisecond values. Measured — with
    // Date.parse this check rejected the server's own correct ordering at row 19 of 60. The
    // serialization is uniform (same column, same offset) and lexicographic order over it agrees
    // with chronological order, including the shorter-prefix cases ('…34+00' < '…34.5+00').
    const key = (r: { id: string; reason: string | null; created_at: string }) =>
      [(r.reason ?? '').trim() !== '' ? 1 : 0, r.created_at, r.id] as const;
    for (let i = 1; i < rows.length; i++) {
      const a = key(rows[i - 1]);
      const b = key(rows[i]);
      const strictlyAfter =
        a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
      expect(strictlyAfter, `row ${i} is not strictly after row ${i - 1}`).toBe(true);
    }
    // The leading component being non-increasing is the reason-first guarantee restated:
    // once a row without a reason appears, no later row may have one.
    const hasReason = rows.map((r) => (r.reason ?? '').trim() !== '');
    const firstEmpty = hasReason.indexOf(false);
    if (firstEmpty !== -1) expect(hasReason.slice(firstEmpty).some(Boolean)).toBe(false);
  });

  test('p_offset advances the window', async () => {
    const anon = makeAnonClient();
    const first = (await anon.rpc('get_pledgers_page', { p_limit: 30, p_offset: 0 })).data as Page;
    const second = (await anon.rpc('get_pledgers_page', { p_limit: 30, p_offset: 30 })).data as Page;
    expect(first.profiles.length).toBe(30);
    expect(second.profiles.length).toBe(30);
    // Race-free: a concurrent insert shifts the window but can never make offset 30 start on
    // the same row as offset 0 — that would need 30 identical rows ahead of it.
    expect(second.profiles[0].id).not.toBe(first.profiles[0].id);
  });
});
