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

import { supabaseAdmin } from '../../src/lib/supabase-admin';

export interface TestStory {
  id: string;
  slug: string;
  authorId: string;
  title: string;
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
    summary?: string;
    visibility?: 'public' | 'verified_only' | 'private';
    tags?: string[];
  } = {}
): Promise<TestStory> {
  const slug = `test-story-${Date.now()}`;
  const title = options.title || `Test Story ${Date.now()}`;
  const summary = options.summary || 'Test story for E2E tests';

  console.log(`[TEST HELPER] Creating test story: ${title}`);

  const { data, error } = await supabaseAdmin
    .from('stories')
    .insert({
      slug,
      title,
      summary,
      author_id: authorId,
      visibility: options.visibility || 'public',
      tags: options.tags || ['test'],
      status: 'published',
    })
    .select('id, slug, author_id, title')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create test story:', error);
    throw new Error(`Failed to create test story: ${error.message}`);
  }

  console.log(`[TEST HELPER] Test story created: ${data.id} (slug: ${data.slug})`);

  return {
    id: data.id,
    slug: data.slug,
    authorId: data.author_id,
    title: data.title,
  };
}

/**
 * Links a story to a point via the story_points junction table
 * @param storyId - ID of the story
 * @param pointId - ID of the point
 */
export async function linkStoryToPoint(storyId: string, pointId: string): Promise<void> {
  console.log(`[TEST HELPER] Linking story ${storyId} to point ${pointId}`);

  const { error } = await supabaseAdmin
    .from('story_points')
    .insert({
      story_id: storyId,
      point_id: pointId,
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
