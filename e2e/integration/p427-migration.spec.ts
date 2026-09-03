/**
 * @file p427-migration.spec.ts
 * @description Integration tests for P427: Story Edit and Delete — DB migration verification
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * P427 adds one migration: CHECK (char_length(content) <= 10000) on the `stories` table.
 * This test verifies:
 * 1. The CHECK constraint exists and rejects content > 10,000 chars (via service role)
 * 2. The CHECK constraint accepts content up to 10,000 chars
 * 3. UPDATE RLS allows an author to update their own story content
 * 4. UPDATE RLS blocks a non-author from updating another user's story
 * 5. DELETE RLS allows an author to delete their own story
 * 6. DELETE RLS blocks a non-author from deleting another user's story
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped JWT client: RLS assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const TABLE = 'stories';
const CONTENT_COLUMN = 'content';
const CHAR_MAX = 10000;

test.describe('P427 Migration — stories.content CHECK constraint + RLS', () => {
  test.setTimeout(45000);

  let userA: TestUser;
  let userB: TestUser;
  let userAToken: string;

  test.beforeAll(async () => {
    userA = await createTestUser({ name: 'P427MigrationA' });
    userB = await createTestUser({ name: 'P427MigrationB' });

    // Obtain userA JWT for RLS tests
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email: userA.email,
      password: 'test-password-12345',
    });
    if (error || !signIn?.session) {
      throw new Error(`P427 migration test: failed to sign in userA: ${error?.message}`);
    }
    userAToken = signIn.session.access_token;
    await supabaseAdmin.auth.signOut(); // restore admin client to service_role
  });

  test.afterAll(async () => {
    if (userA?.user?.id) await deleteTestUser(userA.user.id);
    if (userB?.user?.id) await deleteTestUser(userB.user.id);
  });

  // ── 1. CHECK constraint — content column is accessible ──────────────────

  test('content column exists on stories table', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select(CONTENT_COLUMN)
      .limit(1);

    expect(
      error,
      `Column "${CONTENT_COLUMN}" missing from "${TABLE}". Run: ./scripts/migrate.sh`
    ).toBeNull();
  });

  // ── 2. CHECK constraint — rejects content over CHAR_MAX chars ───────────

  test(`CHECK constraint rejects content over ${CHAR_MAX} characters`, async () => {
    const tooLong = 'A'.repeat(CHAR_MAX + 1);

    const { error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        content: tooLong,
        author_id: userA.user.id,
        visibility: 'private',
        tags: [],
      });

    // Expect a CHECK constraint violation
    expect(error, `Expected CHECK violation for ${CHAR_MAX + 1}-char content but got no error`).not.toBeNull();
    expect(error?.message).toMatch(/check/i);
  });

  // ── 3. CHECK constraint — accepts content at CHAR_MAX ───────────────────

  test(`CHECK constraint accepts content at exactly ${CHAR_MAX} characters`, async () => {
    const exactly10k = 'B'.repeat(CHAR_MAX);
    let rowId: string | undefined;

    try {
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert({
          content: exactly10k,
          author_id: userA.user.id,
          visibility: 'private',
          tags: [],
        })
        .select('id')
        .single();

      expect(error, `Unexpected error inserting ${CHAR_MAX}-char content: ${error?.message}`).toBeNull();
      rowId = data?.id;
    } finally {
      if (rowId) await supabaseAdmin.from(TABLE).delete().eq('id', rowId);
    }
  });

  // ── 4. CHECK constraint — rejects UPDATE to content over CHAR_MAX ────────

  test(`CHECK constraint rejects UPDATE that sets content over ${CHAR_MAX} characters`, async () => {
    // Insert a valid short story first
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from(TABLE)
      .insert({
        content: 'Short valid story for constraint update test.',
        author_id: userA.user.id,
        visibility: 'private',
        tags: [],
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();
    const rowId = insertData?.id;

    try {
      const tooLong = 'C'.repeat(CHAR_MAX + 1);

      const { error: updateError } = await supabaseAdmin
        .from(TABLE)
        .update({ content: tooLong })
        .eq('id', rowId!);

      expect(updateError, `Expected CHECK violation on UPDATE but got no error`).not.toBeNull();
      expect(updateError?.message).toMatch(/check/i);
    } finally {
      if (rowId) await supabaseAdmin.from(TABLE).delete().eq('id', rowId);
    }
  });

  // ── 5. RLS UPDATE — author can update own story content ─────────────────

  test('RLS UPDATE allows author to update own story content', async () => {
    // Insert story via admin to avoid RLS on INSERT
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from(TABLE)
      .insert({
        content: 'Original content for RLS update test.',
        author_id: userA.user.id,
        visibility: 'private',
        tags: [],
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();
    const rowId = insertData?.id;

    try {
      const userClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
      );

      const { error } = await userClient
        .from(TABLE)
        .update({ content: 'Updated content by the author.' })
        .eq('id', rowId!);

      expect(error, `RLS blocked own-story update: ${error?.message}`).toBeNull();
    } finally {
      if (rowId) await supabaseAdmin.from(TABLE).delete().eq('id', rowId);
    }
  });

  // ── 6. RLS UPDATE — non-author cannot update another user's story ────────

  test('RLS UPDATE blocks non-author from updating another user story', async () => {
    // Insert a story owned by userB
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from(TABLE)
      .insert({
        content: "UserB's story that userA should not be able to edit.",
        author_id: userB.user.id,
        visibility: 'public',
        tags: [],
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();
    const rowId = insertData?.id;

    try {
      // userA attempts to update userB's story
      const userClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
      );

      const { error, data } = await userClient
        .from(TABLE)
        .update({ content: 'Injected content by non-author.' })
        .eq('id', rowId!)
        .select('id');

      // RLS silently filters — no error thrown, but 0 rows updated
      expect(error, 'Unexpected error on cross-user update').toBeNull();
      expect(data?.length ?? 0, 'RLS should block non-author from updating story').toBe(0);
    } finally {
      if (rowId) await supabaseAdmin.from(TABLE).delete().eq('id', rowId);
    }
  });

  // ── 7. RLS DELETE — author can delete own story ──────────────────────────

  test('RLS DELETE allows author to delete own story', async () => {
    // Insert a story owned by userA
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from(TABLE)
      .insert({
        content: "UserA's story to be deleted by themselves.",
        author_id: userA.user.id,
        visibility: 'private',
        tags: [],
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();
    const rowId = insertData?.id;

    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
    );

    const { error } = await userClient
      .from(TABLE)
      .delete()
      .eq('id', rowId!);

    expect(error, `RLS blocked own-story delete: ${error?.message}`).toBeNull();

    // Verify the row is actually gone
    const { data: check } = await supabaseAdmin
      .from(TABLE)
      .select('id')
      .eq('id', rowId!)
      .single();

    expect(check, 'Story should be deleted but still exists').toBeNull();
  });

  // ── 8. RLS DELETE — non-author cannot delete another user's story ────────

  test('RLS DELETE blocks non-author from deleting another user story', async () => {
    // Insert a story owned by userB
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from(TABLE)
      .insert({
        content: "UserB's story that userA should not be able to delete.",
        author_id: userB.user.id,
        visibility: 'public',
        tags: [],
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();
    const rowId = insertData?.id;

    try {
      // userA attempts to delete userB's story
      const userClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
      );

      const { error } = await userClient
        .from(TABLE)
        .delete()
        .eq('id', rowId!);

      // RLS silently filters — no rows deleted, no error thrown
      expect(error, 'Unexpected error on cross-user delete').toBeNull();

      // Verify the row still exists (RLS blocked the delete)
      const { data: check } = await supabaseAdmin
        .from(TABLE)
        .select('id')
        .eq('id', rowId!)
        .single();

      expect(check, 'RLS should have blocked the delete but story is gone').not.toBeNull();
    } finally {
      if (rowId) await supabaseAdmin.from(TABLE).delete().eq('id', rowId);
    }
  });

  // ── 9. CASCADE — story_points deleted when story deleted ────────────────

  test('deleting a story cascades to story_points (no orphaned junction rows)', async () => {
    // Insert a story
    const { data: storyData, error: storyError } = await supabaseAdmin
      .from(TABLE)
      .insert({
        content: 'Story for cascade delete test.',
        author_id: userA.user.id,
        visibility: 'private',
        tags: [],
      })
      .select('id')
      .single();

    expect(storyError).toBeNull();
    const storyId = storyData?.id;

    // Insert a point
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'E2E cascade test point for P427.',
        first_validator_id: userA.user.id,
        tags: ['test'],
      })
      .select('id')
      .single();

    expect(pointError).toBeNull();
    const pointId = pointData?.id;

    // Link them
    const { error: linkError } = await supabaseAdmin
      .from('story_points')
      .insert({ story_id: storyId, point_id: pointId });

    expect(linkError).toBeNull();

    // Delete the story
    await supabaseAdmin.from(TABLE).delete().eq('id', storyId!);

    // story_points row should be gone (CASCADE)
    const { data: linkCheck } = await supabaseAdmin
      .from('story_points')
      .select('story_id')
      .eq('story_id', storyId!)
      .limit(1);

    expect(linkCheck?.length ?? 0, 'story_points row should be cascade-deleted with the story').toBe(0);

    // But the point itself should still exist
    const { data: pointCheck } = await supabaseAdmin
      .from('points')
      .select('id')
      .eq('id', pointId!)
      .single();

    expect(pointCheck, 'Points should NOT be deleted when a story is deleted').not.toBeNull();

    // Cleanup point
    await supabaseAdmin.from('points').delete().eq('id', pointId!);
  });
});
