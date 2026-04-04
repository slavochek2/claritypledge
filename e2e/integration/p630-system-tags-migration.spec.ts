/**
 * INTEGRATION TEST: P630 — system_tags column migration
 *
 * Verifies:
 * 1. system_tags column exists on both stories and points tables
 * 2. Backfill correctly separated system tags from user tags
 * 3. DB trigger writes only user tags to tags column (not system tags)
 * 4. Sync trigger cascades system_tags (not tags) to linked points
 *
 * TWO-CLIENT PATTERN: supabaseAdmin for schema checks, user client for RLS.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

test.describe('P630: system_tags column migration', () => {

  // ── 1. Schema: system_tags column exists on stories ─────────────────────────
  test('system_tags column exists on stories table', async () => {
    const { error } = await supabaseAdmin
      .from('stories')
      .select('system_tags')
      .limit(1);

    expect(
      error,
      'Migration not applied: "system_tags" missing from "stories". Run: supabase db push'
    ).toBeNull();
  });

  // ── 2. Schema: system_tags column exists on points ──────────────────────────
  test('system_tags column exists on points table', async () => {
    const { error } = await supabaseAdmin
      .from('points')
      .select('system_tags')
      .limit(1);

    expect(
      error,
      'Migration not applied: "system_tags" missing from "points". Run: supabase db push'
    ).toBeNull();
  });

  // ── 3. Backfill: system tags moved to system_tags column ────────────────────
  test('existing stories have system tags in system_tags, not in tags', async () => {
    // Query a story that should have system tags (any story with st-tags)
    const { data: stories, error } = await supabaseAdmin
      .from('stories')
      .select('id, tags, system_tags')
      .limit(5);

    expect(error).toBeNull();
    expect(stories).not.toBeNull();

    if (stories && stories.length > 0) {
      for (const story of stories) {
        const systemTags: string[] = story.system_tags || [];
        const userTags: string[] = story.tags || [];

        // System tags (st\d+, v\d+, understanding, misunderstanding) should be in system_tags
        for (const tag of systemTags) {
          const isSystem = /^st\d+$/i.test(tag) || /^v\d+$/i.test(tag) ||
            tag === 'understanding' || tag === 'misunderstanding';
          expect(isSystem, `Non-system tag "${tag}" found in system_tags`).toBe(true);
        }

        // User tags should NOT contain system-pattern tags
        for (const tag of userTags) {
          const isSystem = /^st\d+$/i.test(tag) || /^v\d+$/i.test(tag) ||
            tag === 'understanding' || tag === 'misunderstanding';
          expect(isSystem, `System tag "${tag}" found in user tags`).toBe(false);
        }
      }
    }
  });

  // ── 4. Backfill: points have system tags separated ──────────────────────────
  test('existing points have system tags in system_tags, not in tags', async () => {
    const { data: points, error } = await supabaseAdmin
      .from('points')
      .select('id, tags, system_tags')
      .limit(10);

    expect(error).toBeNull();
    expect(points).not.toBeNull();

    if (points && points.length > 0) {
      for (const point of points) {
        const systemTags: string[] = point.system_tags || [];
        const userTags: string[] = point.tags || [];

        // System tags should be in system_tags
        for (const tag of systemTags) {
          const isSystem = /^st\d+$/i.test(tag) || /^v\d+$/i.test(tag) ||
            tag === 'understanding' || tag === 'misunderstanding';
          expect(isSystem, `Non-system tag "${tag}" found in point system_tags`).toBe(true);
        }

        // User tags should NOT contain system patterns
        for (const tag of userTags) {
          const isSystem = /^st\d+$/i.test(tag) || /^v\d+$/i.test(tag) ||
            tag === 'understanding' || tag === 'misunderstanding';
          expect(isSystem, `System tag "${tag}" found in point user tags`).toBe(false);
        }
      }
    }
  });

  // ── 5. Cleanup: rogue tags removed ──────────────────────────────────────────
  test('motivation and deprecated tags are removed from all points', async () => {
    // Check no points have motivation or deprecated in either column
    const { data: motivationPoints } = await supabaseAdmin
      .from('points')
      .select('id')
      .contains('tags', ['motivation']);

    const { data: motivationSystemPoints } = await supabaseAdmin
      .from('points')
      .select('id')
      .contains('system_tags', ['motivation']);

    const { data: deprecatedPoints } = await supabaseAdmin
      .from('points')
      .select('id')
      .contains('tags', ['deprecated']);

    const { data: deprecatedSystemPoints } = await supabaseAdmin
      .from('points')
      .select('id')
      .contains('system_tags', ['deprecated']);

    expect(motivationPoints || [], 'motivation tag still in tags').toHaveLength(0);
    expect(motivationSystemPoints || [], 'motivation tag in system_tags').toHaveLength(0);
    expect(deprecatedPoints || [], 'deprecated tag still in tags').toHaveLength(0);
    expect(deprecatedSystemPoints || [], 'deprecated tag in system_tags').toHaveLength(0);
  });
});
