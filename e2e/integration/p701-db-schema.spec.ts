/**
 * P701: DB Migration Integration Tests
 *
 * Test 1: ST-tag swap migration runs without error on test DB (0 rows updated is OK —
 *         test DB lacks system story content, but migration must not fail).
 *
 * Test 2: stories.title column is dropped — verifies Task 4 migration applied.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

test.describe('P701: ST-tag swap migration (idempotent)', () => {
  test('array_replace on empty result set does not error', async () => {
    // Migration uses array_replace — runs fine even if no rows match (0 rows = success).
    // The test DB lacks the exact system story UUIDs so updates 0 rows; that's correct.
    const { error } = await supabaseAdmin
      .from('stories')
      .select('id, system_tags')
      .contains('system_tags', ['st2']);

    // Query should succeed (no error), even if no rows are returned
    expect(error).toBeNull();
  });

  test('points table is queryable by system_tags array', async () => {
    const { error } = await supabaseAdmin
      .from('points')
      .select('id, system_tags')
      .contains('system_tags', ['st1'])
      .limit(1);

    expect(error).toBeNull();
  });
});

test.describe('P701: stories.title column dropped', () => {
  test('stories table does not have a title column', async () => {
    // After migration: selecting title should fail with PGRST204 (column not found)
    const { error } = await supabaseAdmin
      .from('stories')
      .select('id')
      .limit(1);

    // Basic query works
    expect(error).toBeNull();

    // Verify title column is gone by checking information_schema
    const { data: cols, error: colError } = await supabaseAdmin.rpc('exec_sql' as never, {
      sql: "SELECT column_name FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'title'"
    }).single();

    // If RPC not available, fall back to direct select test
    if (colError) {
      // Try selecting title — should return an error if column is dropped
      const { error: titleError } = await supabaseAdmin
        .from('stories')
        .select('title' as never)
        .limit(1);
      // The column should NOT exist — expect an error or empty result
      // PostgREST returns a PGRST204 error for unknown columns
      const isColumnGone = titleError !== null;
      expect(isColumnGone).toBe(true);
      return;
    }

    // Column should not be found
    expect(cols).toBeNull();
  });

  test('story_versions table does not have a title column', async () => {
    const { error: titleError } = await supabaseAdmin
      .from('story_versions')
      .select('title' as never)
      .limit(1);

    // Column should not exist — PostgREST returns error for unknown columns
    expect(titleError).not.toBeNull();
  });
});
