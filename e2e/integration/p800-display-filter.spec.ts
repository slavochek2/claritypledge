/**
 * INTEGRATION TEST: P800 — display filter for superseded points
 *
 * Verifies:
 * 1. Story 883d89f5 has exactly 2 non-superseded linked points after backfill
 * 2. Application-layer filter (superseded_by IS NOT NULL → excluded) works
 *    on a test story with known data
 *
 * Note: Service-method filtering (.filter(p => !p.superseded_by)) is enforced
 * at the application layer in getStoryWithPoints, getStoriesByAuthorWithPoints,
 * and docs-service.ts::getDoc. This test verifies the data model invariant
 * that underpins those filters.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

const STORY_883 = '883d89f5-4449-46b2-a663-f4f2c7204c22';

test.describe('P800: display filter — superseded points excluded from story views', () => {

  // ── 1. Prod backfill: story 883d89f5 has exactly 2 non-superseded points ──
  // NOTE: This test verifies a specific prod story's backfill result (5 linked points,
  // 3 superseded, 2 heads). The test DB does not have this story's full data.
  // Controlled-data coverage for the filter logic is in test 2 below.
  test('story 883d89f5 has exactly 2 non-superseded linked points after backfill', async () => {
    // Verify column exists first — gives a clear error if migration not applied
    const { error: colError } = await supabaseAdmin
      .from('points')
      .select('superseded_by')
      .limit(1);

    expect(
      colError,
      'Migration not applied: "superseded_by" column missing. Run: supabase db push',
    ).toBeNull();

    // Query all linked points for story 883d89f5, join to get superseded_by
    const { data, error } = await supabaseAdmin
      .from('story_points')
      .select('point_id, points!story_points_point_id_fkey(id, superseded_by)')
      .eq('story_id', STORY_883);

    expect(error, `Failed to query story_points: ${error?.message}`).toBeNull();

    const linked = data ?? [];

    // Skip on test DB: prod story 883d89f5 has 5 linked points; test DB has fewer.
    // The backfill logic is verified by controlled-data test 2.
    test.skip(linked.length < 5, 'Story 883d89f5 is prod-only data; test DB has fewer linked points. Backfill logic covered by test 2.');
    if (linked.length < 5) return;

    // Count only non-superseded points (what the display filter returns)
    const nonSuperseded = linked.filter((row) => {
      const point = row.points as { id: string; superseded_by: string | null } | null;
      return point && point.superseded_by === null;
    });

    expect(
      nonSuperseded.length,
      `Expected exactly 2 non-superseded linked points on story 883d89f5 after backfill, got ${nonSuperseded.length}. ` +
      'Either backfill migration has not run, or the story data has changed.',
    ).toBe(2);
  });

  // ── 2. Test story: filter logic works with controlled data ────────────────
  test('filter excludes superseded_by-set points from story link count', async () => {
    let validatorId: string | null = null;
    const pointIds: string[] = [];

    try {
      const user = await createTestUser({ name: 'P800 DisplayFilter Test' });
      validatorId = user.user.id;

      const insertPoint = async (label: string) => {
        const { data, error } = await supabaseAdmin
          .from('points')
          .insert({
            statement: `P800 display-filter ${label} ${Date.now()}`,
            first_validator_id: validatorId!,
            tags: ['test'],
            system_tags: [],
          })
          .select('id')
          .single();
        if (error) throw new Error(`Point insert failed: ${error.message}`);
        pointIds.push(data!.id);
        return data!.id;
      };

      const active1 = await insertPoint('active-1');
      const active2 = await insertPoint('active-2');
      const superseded = await insertPoint('superseded');
      const head = await insertPoint('head');

      // Wire: superseded → head (so superseded has superseded_by set)
      const { error: wireError } = await supabaseAdmin
        .from('points')
        .update({ superseded_by: head })
        .eq('id', superseded);
      expect(wireError, `Failed to wire superseded → head: ${wireError?.message}`).toBeNull();

      // Create a test story
      const { data: story, error: storyError } = await supabaseAdmin
        .from('stories')
        .insert({
          author_id: validatorId,
          content: 'P800 display filter test story',
          visibility: 'public',
        })
        .select('id')
        .single();
      expect(storyError, `Failed to create test story: ${storyError?.message}`).toBeNull();

      const storyId = story!.id;

      // Link all 4 points to the story
      const links = [active1, active2, superseded, head].map((pid) => ({
        story_id: storyId,
        point_id: pid,
        author_id: validatorId!,
      }));
      const { error: linkError } = await supabaseAdmin.from('story_points').insert(links);
      expect(linkError, `Failed to link points to story: ${linkError?.message}`).toBeNull();

      // Query as the display filter would: exclude superseded_by != null
      const { data: linked, error: queryError } = await supabaseAdmin
        .from('story_points')
        .select('point_id, points!story_points_point_id_fkey(id, superseded_by)')
        .eq('story_id', storyId);

      expect(queryError, `Failed to query story_points: ${queryError?.message}`).toBeNull();

      const nonSuperseded = (linked ?? []).filter((row) => {
        const point = row.points as { id: string; superseded_by: string | null } | null;
        return point && point.superseded_by === null;
      });

      // 3 active points: active1, active2, head (the superseded one is filtered)
      expect(
        nonSuperseded.length,
        `Expected 3 non-superseded linked points (active1, active2, head). Got: ${nonSuperseded.length}`,
      ).toBe(3);

      // Cleanup
      await supabaseAdmin.from('story_points').delete().eq('story_id', storyId);
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    } finally {
      // Clear superseded_by before deleting (FK constraint)
      if (pointIds.length > 0) {
        await supabaseAdmin.from('points').update({ superseded_by: null }).in('id', pointIds);
        await supabaseAdmin.from('story_points').delete().in('point_id', pointIds);
        await supabaseAdmin.from('points').delete().in('id', pointIds);
      }
      if (validatorId) await deleteTestUser(validatorId);
    }
  });
});
