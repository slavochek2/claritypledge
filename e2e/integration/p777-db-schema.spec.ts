/**
 * P270 integration test: P777 imageUrl backfill — 20260421112414
 *
 * Verifies the post-condition of the backfill migration:
 * no letter_story_snapshot should be missing imageUrl in point_config when
 * its source story has a non-empty image_url.
 *
 * The migration was a one-shot UPDATE — this test asserts the invariant holds.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

test.describe('Migration: P777 — imageUrl backfill into letter_story_snapshots', () => {
  test('point_config column is accessible after migration (no corruption)', async () => {
    const { error } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('point_config')
      .limit(1);

    expect(error, `letter_story_snapshots.point_config not accessible: ${error?.message}`).toBeNull();
  });

  test('no snapshots with eligible source story are missing imageUrl', async () => {
    // Fetch stories that have a real image_url
    const { data: storiesWithImage, error: stErr } = await supabaseAdmin
      .from('stories')
      .select('id')
      .not('image_url', 'is', null)
      .neq('image_url', '');

    expect(stErr).toBeNull();
    if (!storiesWithImage || storiesWithImage.length === 0) {
      // No stories with images in test DB — migration has nothing to backfill
      return;
    }

    const storyIds = storiesWithImage.map((s) => s.id);

    // For these stories, fetch all snapshots
    const { data: snapshots, error: snapErr } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('story_id, point_config')
      .in('story_id', storyIds);

    expect(snapErr).toBeNull();
    if (!snapshots || snapshots.length === 0) {
      // No snapshots for stories with images in test DB — nothing to assert
      return;
    }

    // All snapshots for stories with images must carry imageUrl in point_config
    const missing = snapshots.filter(
      (s) => !s.point_config || !Object.prototype.hasOwnProperty.call(s.point_config, 'imageUrl')
    );

    expect(
      missing.length,
      `${missing.length} snapshots still missing imageUrl after backfill migration. ` +
        `Run: ./scripts/migrate.sh (migration 20260421112414).`
    ).toBe(0);
  });
});
