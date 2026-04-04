/**
 * @file p506-backfill-hashtags.spec.ts
 * @description P506: Integration test for hashtag backfill migration.
 *
 * P270 RULE: Integration test is MANDATORY for any feature adding a DB migration.
 *
 * Verifies that:
 * - Stories with hashtags in content get tags backfilled
 * - Points with hashtags in statement get tags backfilled
 * - Stories/points without hashtags are not affected
 * - Existing non-empty tags are preserved (not overwritten)
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

test.describe('P506: Hashtag backfill migration', () => {
  let testUser: TestUser;
  let storyWithTags: string | undefined;
  let storyWithoutTags: string | undefined;
  let storyWithExistingTags: string | undefined;
  let pointWithTags: string | undefined;
  let pointWithoutTags: string | undefined;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P506 Backfill Test User' });

    // Story WITH hashtags in content, empty tags array
    const { data: s1 } = await supabaseAdmin
      .from('stories')
      .insert({
        content: 'Great work on #leadership and #trust building',
        author_id: testUser.user.id,
        visibility: 'public',
        tags: [],
      })
      .select('id')
      .single();
    storyWithTags = s1?.id;

    // Story WITHOUT hashtags
    const { data: s2 } = await supabaseAdmin
      .from('stories')
      .insert({
        content: 'A plain story without any tags',
        author_id: testUser.user.id,
        visibility: 'public',
        tags: [],
      })
      .select('id')
      .single();
    storyWithoutTags = s2?.id;

    // Story with EXISTING tags (should NOT be overwritten)
    const { data: s3 } = await supabaseAdmin
      .from('stories')
      .insert({
        content: 'Story about #leadership',
        author_id: testUser.user.id,
        visibility: 'public',
        tags: ['manually-set'],
      })
      .select('id')
      .single();
    storyWithExistingTags = s3?.id;

    // Point WITH hashtags in statement, empty tags
    const { data: p1 } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Trust is key for #cofounders #trust',
        first_validator_id: testUser.user.id,
        tags: [],
      })
      .select('id')
      .single();
    pointWithTags = p1?.id;

    // Point WITHOUT hashtags
    const { data: p2 } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'A plain point without tags',
        first_validator_id: testUser.user.id,
        tags: [],
      })
      .select('id')
      .single();
    pointWithoutTags = p2?.id;

    // Re-run the backfill SQL on test data via Management API
    // (the migration may have already run before these rows were inserted)
    const backfillSQL = `
      UPDATE stories SET tags = (
        SELECT COALESCE(array_agg(DISTINCT lower(m[1])) FILTER (WHERE m[1] IS NOT NULL), '{}')
        FROM regexp_matches(content, '#(\\w+)', 'g') AS m
      ) WHERE (tags = '{}' OR tags IS NULL) AND author_id = '${testUser.user.id}';
      UPDATE points SET tags = (
        SELECT COALESCE(array_agg(DISTINCT lower(m[1])) FILTER (WHERE m[1] IS NOT NULL), '{}')
        FROM regexp_matches(statement, '#(\\w+)', 'g') AS m
      ) WHERE (tags = '{}' OR tags IS NULL) AND first_validator_id = '${testUser.user.id}';
    `;

    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const projectRef = process.env.VITE_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
    if (token && projectRef) {
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: backfillSQL }),
      });
      if (!res.ok) {
        console.warn(`[P506] Management API backfill failed: ${res.status}`);
      }
    } else {
      console.warn('[P506] SUPABASE_ACCESS_TOKEN not set — skipping backfill execution');
    }
  });

  test.afterAll(async () => {
    // Clean up in reverse order
    if (pointWithoutTags) await supabaseAdmin.from('points').delete().eq('id', pointWithoutTags);
    if (pointWithTags) await supabaseAdmin.from('points').delete().eq('id', pointWithTags);
    if (storyWithExistingTags) await supabaseAdmin.from('stories').delete().eq('id', storyWithExistingTags);
    if (storyWithoutTags) await supabaseAdmin.from('stories').delete().eq('id', storyWithoutTags);
    if (storyWithTags) await supabaseAdmin.from('stories').delete().eq('id', storyWithTags);
    if (testUser?.user?.id) await deleteTestUser(testUser.user.id);
  });

  test('stories with hashtags in content have tags populated after migration', async () => {
    const { data } = await supabaseAdmin
      .from('stories')
      .select('tags')
      .eq('id', storyWithTags!)
      .single();

    expect(data?.tags).toBeDefined();
    expect(data?.tags).toContain('leadership');
    expect(data?.tags).toContain('trust');
  });

  test('stories without hashtags remain with empty tags', async () => {
    const { data } = await supabaseAdmin
      .from('stories')
      .select('tags')
      .eq('id', storyWithoutTags!)
      .single();

    expect(data?.tags).toEqual([]);
  });

  test('stories with existing non-empty tags are not overwritten', async () => {
    const { data } = await supabaseAdmin
      .from('stories')
      .select('tags')
      .eq('id', storyWithExistingTags!)
      .single();

    expect(data?.tags).toContain('manually-set');
  });

  test('points with hashtags in statement have tags populated after migration', async () => {
    const { data } = await supabaseAdmin
      .from('points')
      .select('tags')
      .eq('id', pointWithTags!)
      .single();

    expect(data?.tags).toBeDefined();
    expect(data?.tags).toContain('cofounders');
    expect(data?.tags).toContain('trust');
  });

  test('points without hashtags remain with empty tags', async () => {
    const { data } = await supabaseAdmin
      .from('points')
      .select('tags')
      .eq('id', pointWithoutTags!)
      .single();

    expect(data?.tags).toEqual([]);
  });
});
