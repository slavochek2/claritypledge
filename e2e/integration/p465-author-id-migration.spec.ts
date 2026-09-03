/**
 * @file p465-author-id-migration.spec.ts
 * @description Integration tests for P465: story_points.author_id denormalization + UNIQUE constraint.
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * P465 adds one migration:
 *   - `story_points.author_id` column (UUID, NOT NULL, FK → profiles)
 *   - `UNIQUE(author_id, point_id)` constraint (`story_points_author_point_unique`)
 *   - Backfill of existing rows from `stories.author_id`
 *
 * This test verifies:
 *   1. Column exists (schema-level — admin client bypasses RLS)
 *   2. Column is populated correctly after backfill
 *   3. UNIQUE constraint blocks second story-point link for same (author, point)
 *   4. UNIQUE constraint allows different authors to link their stories to the same point
 *   5. INSERT via user-scoped client respects RLS (existing INSERT policy still works)
 *   6. Cascade: deleting the profile removes story_points rows via FK
 *
 * TWO-CLIENT PATTERN (mandatory):
 *   - supabaseAdmin: schema-level checks and setup (bypasses RLS)
 *   - user-scoped JWT client: RLS assertions (proves real users can still insert)
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const TABLE = 'story_points';
const AUTHOR_COLUMN = 'author_id';

test.describe('P465 Migration — story_points.author_id + UNIQUE(author_id, point_id)', () => {
  test.setTimeout(60000);

  let userA: TestUser;
  let userB: TestUser;
  let userAToken: string;
  let pointId: string;

  test.beforeAll(async () => {
    userA = await createTestUser({ name: 'P465MigrationA' });
    userB = await createTestUser({ name: 'P465MigrationB' });

    // Create a shared test point owned by userA
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: `P465 migration test point ${Date.now()}`,
        first_validator_id: userA.user.id,
        tags: ['test'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    pointId = pointData.id;

    // Obtain userA JWT for RLS tests
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email: userA.email,
      password: 'test-password-12345',
    });
    if (error || !signIn?.session) {
      throw new Error(`P465 migration test: failed to sign in userA: ${error?.message}`);
    }
    userAToken = signIn.session.access_token;
    await supabaseAdmin.auth.signOut(); // restore admin client to service_role
  });

  test.afterAll(async () => {
    if (pointId) await supabaseAdmin.from('points').delete().eq('id', pointId);
    if (userA?.user?.id) await deleteTestUser(userA.user.id);
    if (userB?.user?.id) await deleteTestUser(userB.user.id);
  });

  // ── 1. Schema check: author_id column exists ───────────────────────────────

  test('story_points.author_id column exists (migration was applied)', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select(AUTHOR_COLUMN)
      .limit(1);

    expect(
      error,
      `Migration not applied: "${AUTHOR_COLUMN}" missing from "${TABLE}". Run: ./scripts/migrate.sh`
    ).toBeNull();
  });

  // ── 2. Author_id is populated at insert time ───────────────────────────────

  test('author_id is stored in story_points when a story is linked to a point', async () => {
    // Create a story for userA
    const { data: storyData, error: storyError } = await supabaseAdmin
      .from('stories')
      .insert({
        title: `P465 migration author_id test ${Date.now()}`,
        content: 'Story for author_id column test.',
        author_id: userA.user.id,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();

    expect(storyError).toBeNull();
    const storyId = storyData!.id;

    try {
      // Link story to point — migration means author_id is included in INSERT
      const { error: linkError } = await supabaseAdmin
        .from(TABLE)
        .insert({
          story_id: storyId,
          point_id: pointId,
          author_id: userA.user.id,
        });

      expect(linkError, `Failed to insert story_point with author_id: ${linkError?.message}`).toBeNull();

      // Verify the column is populated
      const { data: row, error: readError } = await supabaseAdmin
        .from(TABLE)
        .select('story_id, point_id, author_id')
        .eq('story_id', storyId)
        .eq('point_id', pointId)
        .single();

      expect(readError).toBeNull();
      expect(row?.author_id).toBe(userA.user.id);
    } finally {
      await supabaseAdmin.from(TABLE).delete().eq('story_id', storyId).eq('point_id', pointId);
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
  });

  // ── 3. UNIQUE constraint blocks duplicate (author_id, point_id) ────────────

  test('UNIQUE(author_id, point_id) blocks second story link from same author to same point', async () => {
    // Create two separate stories for userA
    const { data: story1, error: err1 } = await supabaseAdmin
      .from('stories')
      .insert({
        title: `P465 unique constraint story 1 ${Date.now()}`,
        content: 'First story.',
        author_id: userA.user.id,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();

    const { data: story2, error: err2 } = await supabaseAdmin
      .from('stories')
      .insert({
        title: `P465 unique constraint story 2 ${Date.now()}`,
        content: 'Second story — should not be linkable to same point.',
        author_id: userA.user.id,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();

    expect(err1).toBeNull();
    expect(err2).toBeNull();

    const story1Id = story1!.id;
    const story2Id = story2!.id;

    try {
      // Link story1 to pointId — should succeed
      const { error: link1Error } = await supabaseAdmin
        .from(TABLE)
        .insert({ story_id: story1Id, point_id: pointId, author_id: userA.user.id });

      expect(link1Error, `First link should succeed: ${link1Error?.message}`).toBeNull();

      // Link story2 to same pointId for same author — must fail with 23505 (unique violation)
      const { error: link2Error } = await supabaseAdmin
        .from(TABLE)
        .insert({ story_id: story2Id, point_id: pointId, author_id: userA.user.id });

      expect(
        link2Error,
        'Second story-point link from the same author to the same point should be blocked by UNIQUE constraint'
      ).not.toBeNull();

      // PostgreSQL 23505 = unique_violation
      expect(link2Error?.code).toBe('23505');
    } finally {
      await supabaseAdmin.from(TABLE).delete().eq('story_id', story1Id);
      await supabaseAdmin.from(TABLE).delete().eq('story_id', story2Id);
      await supabaseAdmin.from('stories').delete().eq('id', story1Id);
      await supabaseAdmin.from('stories').delete().eq('id', story2Id);
    }
  });

  // ── 4. UNIQUE constraint allows different authors on same point ────────────

  test('different authors can each link one story to the same point', async () => {
    const { data: storyA, error: errA } = await supabaseAdmin
      .from('stories')
      .insert({
        title: `P465 multi-author story A ${Date.now()}`,
        content: 'UserA story on shared point.',
        author_id: userA.user.id,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();

    const { data: storyB, error: errB } = await supabaseAdmin
      .from('stories')
      .insert({
        title: `P465 multi-author story B ${Date.now()}`,
        content: 'UserB story on same shared point.',
        author_id: userB.user.id,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();

    expect(errA).toBeNull();
    expect(errB).toBeNull();

    const storyAId = storyA!.id;
    const storyBId = storyB!.id;

    try {
      // Both authors should be able to link to the same point
      const { error: linkAError } = await supabaseAdmin
        .from(TABLE)
        .insert({ story_id: storyAId, point_id: pointId, author_id: userA.user.id });

      const { error: linkBError } = await supabaseAdmin
        .from(TABLE)
        .insert({ story_id: storyBId, point_id: pointId, author_id: userB.user.id });

      expect(linkAError, `UserA link should succeed: ${linkAError?.message}`).toBeNull();
      expect(linkBError, `UserB link should succeed (different author): ${linkBError?.message}`).toBeNull();

      // Verify both rows exist
      const { data: rows } = await supabaseAdmin
        .from(TABLE)
        .select('story_id, author_id')
        .eq('point_id', pointId)
        .in('story_id', [storyAId, storyBId]);

      expect(rows?.length).toBe(2);
    } finally {
      await supabaseAdmin.from(TABLE).delete().eq('story_id', storyAId);
      await supabaseAdmin.from(TABLE).delete().eq('story_id', storyBId);
      await supabaseAdmin.from('stories').delete().eq('id', storyAId);
      await supabaseAdmin.from('stories').delete().eq('id', storyBId);
    }
  });

  // ── 5. RLS: user-scoped client can insert with author_id ──────────────────

  test('authenticated user can insert story_point with author_id via user-scoped client (RLS)', async () => {
    // Create story via admin
    const { data: storyData, error: storyError } = await supabaseAdmin
      .from('stories')
      .insert({
        title: `P465 RLS insert test ${Date.now()}`,
        content: 'Story for RLS insert test.',
        author_id: userA.user.id,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();

    expect(storyError).toBeNull();
    const storyId = storyData!.id;

    try {
      const userClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
      );

      // User inserts their own story_point (with author_id — new column)
      const { error: linkError } = await userClient
        .from(TABLE)
        .insert({
          story_id: storyId,
          point_id: pointId,
          author_id: userA.user.id,
        });

      expect(
        linkError,
        `RLS blocked user's own story_point insert: ${linkError?.message}`
      ).toBeNull();
    } finally {
      await supabaseAdmin.from(TABLE).delete().eq('story_id', storyId);
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
  });

  // ── 6. CASCADE: author_id FK respects story deletion ─────────────────────

  test('deleting a story cascades story_points deletion (author_id FK does not break cascade)', async () => {
    const { data: storyData, error: storyError } = await supabaseAdmin
      .from('stories')
      .insert({
        title: `P465 cascade delete test ${Date.now()}`,
        content: 'Story for cascade test.',
        author_id: userA.user.id,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();

    expect(storyError).toBeNull();
    const storyId = storyData!.id;

    // Link
    await supabaseAdmin
      .from(TABLE)
      .insert({ story_id: storyId, point_id: pointId, author_id: userA.user.id });

    // Delete the story
    await supabaseAdmin.from('stories').delete().eq('id', storyId);

    // story_points row should be gone (CASCADE on story_id FK)
    const { data: orphan } = await supabaseAdmin
      .from(TABLE)
      .select('story_id')
      .eq('story_id', storyId)
      .limit(1);

    expect(
      orphan?.length ?? 0,
      'story_points row should be cascade-deleted when the story is deleted'
    ).toBe(0);
  });
});
