/**
 * @file p465-story-points-migration.spec.ts
 * @description Integration tests for P465: story_points.author_id migration verification
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * Verifies:
 * 1. `author_id` column exists on `story_points` table (migration applied)
 * 2. Inserting a story_point with author_id succeeds
 * 3. UNIQUE(author_id, point_id) constraint rejects second story for same (author, point)
 * 4. SELECT by author_id returns rows (index usable)
 * 5. Authenticated user can SELECT story_points (public SELECT policy)
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped JWT client: RLS assertions
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser } from '../helpers/test-user';
import type { TestUser } from '../helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from '../helpers/test-point';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

const TABLE = 'story_points';

test.describe.serial('P465 Migration — story_points.author_id column + UNIQUE constraint', () => {
  test.setTimeout(45000);

  let author: TestUser;
  let pointId: string;
  let story1Id: string;
  let story2Id: string;
  let authorToken: string;

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P465 Migration Author' });

    const point = await createTestPoint(author.user.id, {
      statement: `P465 migration test point ${Date.now()}`,
    });
    pointId = point.id;
    await createTestPosition(point.id, author.user.id, 'agree');

    const story1 = await createTestStory(author.user.id, {
      title: 'P465 Story One',
      content: 'First story for constraint test',
    });
    story1Id = story1.id;

    const story2 = await createTestStory(author.user.id, {
      title: 'P465 Story Two',
      content: 'Second story — same author, same point',
    });
    story2Id = story2.id;

    // Get author JWT for RLS tests
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email: author.email,
      password: 'test-password-12345',
    });
    if (error || !signIn?.session) {
      throw new Error(`P465: Failed to sign in author: ${error?.message}`);
    }
    authorToken = signIn.session.access_token;
    await supabaseAdmin.auth.signOut();
  });

  test.afterAll(async () => {
    // Cascade order: delete story_points first (via point delete), then stories, then user
    if (pointId) await deleteTestPoint(pointId);
    if (story1Id) await deleteTestStory(story1Id);
    if (story2Id) await deleteTestStory(story2Id);
    if (author?.user?.id) {
      await supabaseAdmin.auth.admin.deleteUser(author.user.id);
    }
  });

  // ── 1. Schema check ──────────────────────────────────────────────────────
  test('author_id column exists in story_points table', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select('author_id')
      .limit(1);

    expect(
      error,
      `Migration not applied: "author_id" missing from "story_points". Run: ./scripts/migrate.sh`
    ).toBeNull();
  });

  // ── 2. Insert with author_id succeeds ────────────────────────────────────
  test('inserting story_point with author_id succeeds', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        story_id: story1Id,
        point_id: pointId,
        author_id: author.user.id,
      });

    expect(error, `First insert should succeed: ${error?.message}`).toBeNull();
  });

  // ── 3. UNIQUE(author_id, point_id) rejects duplicate ────────────────────
  test('UNIQUE(author_id, point_id) rejects second story for same author+point', async () => {
    // story1 already linked above. story2 has different story_id (passes PK)
    // but same (author_id, point_id) — must fail UNIQUE constraint.
    const { error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        story_id: story2Id,
        point_id: pointId,
        author_id: author.user.id,
      });

    expect(error, 'Expected UNIQUE constraint violation').not.toBeNull();
    expect(error?.code, 'Expected PostgreSQL error code 23505 (unique_violation)').toBe('23505');
  });

  // ── 4. SELECT by author_id returns linked story ──────────────────────────
  test('SELECT by author_id returns the linked story', async () => {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('story_id, point_id, author_id')
      .eq('author_id', author.user.id)
      .eq('point_id', pointId);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].story_id).toBe(story1Id);
    expect(data![0].author_id).toBe(author.user.id);
  });

  // ── 5. RLS: authenticated user can SELECT story_points ───────────────────
  test('authenticated user can SELECT story_points (public SELECT policy)', async () => {
    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${authorToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data, error } = await userClient
      .from(TABLE)
      .select('story_id, point_id')
      .eq('point_id', pointId);

    expect(error, `Authenticated SELECT on story_points failed: ${error?.message}`).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
