/**
 * @file test-story.ts
 *
 * E2E Test Helpers for Story Management
 *
 * These helpers use the Supabase Admin API to:
 * 1. Create test stories with authors
 * 2. Link stories to points
 * 3. Clean up test data after tests
 *
 * All helpers use service_role key which bypasses RLS via
 * "Test data: service_role bypass" policies.
 */

import { supabaseAdmin } from './supabase-admin';

export interface TestStory {
  id: string;
  authorId: string;
  /**
   * The label this helper used in its log line. NOT a database column — P701
   * (`20260413110000_p701_drop_story_title.sql`) dropped `stories.title`. Kept so
   * callers that read `.title` for a log or an assertion message still compile.
   */
  title: string;
  content: string;
}

/**
 * Creates a test story in the database
 * @param authorId - User ID of the story author
 * @param options - Optional overrides for story properties
 */
export async function createTestStory(
  authorId: string,
  options: {
    title?: string;
    content?: string;
    visibility?: 'public' | 'verified_only' | 'private';
    tags?: string[];
  } = {}
): Promise<TestStory> {
  const title = options.title || `Test Story ${Date.now()}`;
  const content = options.content || 'Test story for E2E tests';

  console.log(`[TEST HELPER] Creating test story: ${title}`);

  const { data, error } = await supabaseAdmin
    .from('stories')
    .insert({
      // `title` is NOT sent: P701 dropped stories.title. Writing it returns
      // PGRST 42703 "column stories.title does not exist" and every test using
      // this helper fails in setup, at 0ms, which reads as an unrelated outage.
      content,
      author_id: authorId,
      // NOTE: production DB default is 'private' (P424 migration).
      // Tests that care about visitor visibility must pass visibility: 'private' explicitly.
      // This helper defaults to 'public' to avoid breaking 30+ existing tests that don't
      // exercise visibility-specific paths.
      visibility: options.visibility ?? 'public',
      tags: options.tags || ['test'],
    })
    .select('id, author_id, content')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create test story:', error);
    throw new Error(`Failed to create test story: ${error.message}`);
  }

  console.log(`[TEST HELPER] Test story created: ${data.id}`);

  return {
    id: data.id,
    authorId: data.author_id,
    title,
    content: data.content,
  };
}

/**
 * Links a story to a point via the story_points junction table
 * @param storyId - ID of the story
 * @param pointId - ID of the point
 *
 * P465: story_points.author_id is NOT NULL after migration. We look it up from
 * the stories table rather than changing every call site across the test suite.
 */
export async function linkStoryToPoint(storyId: string, pointId: string): Promise<void> {
  console.log(`[TEST HELPER] Linking story ${storyId} to point ${pointId}`);

  // P465: fetch author_id before inserting (story_points.author_id is NOT NULL)
  const { data: story, error: storyError } = await supabaseAdmin
    .from('stories')
    .select('author_id')
    .eq('id', storyId)
    .single();

  if (storyError) {
    console.error('[TEST HELPER] Failed to fetch story author_id:', storyError);
    throw new Error(`Failed to fetch story author_id: ${storyError.message}`);
  }

  const { error } = await supabaseAdmin
    .from('story_points')
    .insert({
      story_id: storyId,
      point_id: pointId,
      author_id: story.author_id,
    });

  if (error) {
    console.error('[TEST HELPER] Failed to link story to point:', error);
    throw new Error(`Failed to link story to point: ${error.message}`);
  }

  console.log(`[TEST HELPER] Story linked to point`);
}

/**
 * Deletes a test story and its related data
 * @param storyId - ID of the story to delete
 *
 * Note: CASCADE will automatically delete:
 * - story_points (via story_id FK)
 * - story_versions (via story_id FK, if that table exists)
 */
export async function deleteTestStory(storyId: string): Promise<void> {
  console.log(`[TEST HELPER] Deleting test story: ${storyId}`);

  const { error } = await supabaseAdmin
    .from('stories')
    .delete()
    .eq('id', storyId);

  if (error) {
    console.warn(`[TEST HELPER] Error deleting story ${storyId}:`, error);
    // Don't throw - story might already be deleted
  } else {
    console.log(`[TEST HELPER] Test story deleted: ${storyId}`);
  }
}
