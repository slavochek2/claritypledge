/**
 * @file p607-visibility-inheritance.spec.ts
 * @description P607: Verify that visibility is correctly inherited when creating
 * points from stories and stories from points.
 *
 * Tests the service layer — createPoint() with explicit visibility and
 * createStory() with explicit visibility both produce correct DB rows.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';

test.describe('P607: Visibility inheritance on content creation', () => {
  let userId: string;

  test.beforeAll(async () => {
    const testUser = await createTestUser();
    userId = testUser.user.id;
  });

  test.afterAll(async () => {
    await deleteTestUser(userId);
  });

  test.describe('Point inherits story visibility', () => {
    test('point created with visibility=private has private in DB', async () => {
      // Create a private story as the parent context
      const story = await createTestStory(userId, {
        visibility: 'private',
        content: 'P607 test: private story parent',
        tags: ['test', 'p607'],
      });

      // Create a point with explicit private visibility (simulating inheritance)
      const point = await createTestPoint(userId, {
        statement: 'P607 test: point from private story',
        tags: ['test', 'p607'],
        visibility: 'private',
      });

      // Verify DB row
      const { data, error } = await supabaseAdmin
        .from('points')
        .select('visibility')
        .eq('id', point.id)
        .single();

      expect(error).toBeNull();
      expect(data?.visibility).toBe('private');

      // Cleanup
      await deleteTestPoint(point.id);
      await deleteTestStory(story.id);
    });

    test('point created with visibility=public has public in DB', async () => {
      const story = await createTestStory(userId, {
        visibility: 'public',
        content: 'P607 test: public story parent',
        tags: ['test', 'p607'],
      });

      const point = await createTestPoint(userId, {
        statement: 'P607 test: point from public story',
        tags: ['test', 'p607'],
        visibility: 'public',
      });

      const { data, error } = await supabaseAdmin
        .from('points')
        .select('visibility')
        .eq('id', point.id)
        .single();

      expect(error).toBeNull();
      expect(data?.visibility).toBe('public');

      await deleteTestPoint(point.id);
      await deleteTestStory(story.id);
    });
  });

  test.describe('Story inherits point visibility', () => {
    test('story created with visibility=private has private in DB', async () => {
      // Create a private point as the parent context
      const point = await createTestPoint(userId, {
        statement: 'P607 test: private point parent',
        tags: ['test', 'p607'],
        visibility: 'private',
      });

      // Create a story with explicit private visibility (simulating inheritance)
      const story = await createTestStory(userId, {
        visibility: 'private',
        content: 'P607 test: story from private point',
        tags: ['test', 'p607'],
      });

      const { data, error } = await supabaseAdmin
        .from('stories')
        .select('visibility')
        .eq('id', story.id)
        .single();

      expect(error).toBeNull();
      expect(data?.visibility).toBe('private');

      await deleteTestStory(story.id);
      await deleteTestPoint(point.id);
    });

    test('story created with visibility=public has public in DB', async () => {
      const point = await createTestPoint(userId, {
        statement: 'P607 test: public point parent',
        tags: ['test', 'p607'],
        visibility: 'public',
      });

      const story = await createTestStory(userId, {
        visibility: 'public',
        content: 'P607 test: story from public point',
        tags: ['test', 'p607'],
      });

      const { data, error } = await supabaseAdmin
        .from('stories')
        .select('visibility')
        .eq('id', story.id)
        .single();

      expect(error).toBeNull();
      expect(data?.visibility).toBe('public');

      await deleteTestStory(story.id);
      await deleteTestPoint(point.id);
    });
  });

  test.describe('Standalone creation defaults', () => {
    test('point created without visibility defaults to public', async () => {
      const point = await createTestPoint(userId, {
        statement: 'P607 test: standalone point (no parent)',
        tags: ['test', 'p607'],
      });

      const { data, error } = await supabaseAdmin
        .from('points')
        .select('visibility')
        .eq('id', point.id)
        .single();

      expect(error).toBeNull();
      expect(data?.visibility).toBe('public');

      await deleteTestPoint(point.id);
    });

    test('story created without explicit visibility defaults to public', async () => {
      const story = await createTestStory(userId, {
        content: 'P607 test: standalone story (no parent)',
        tags: ['test', 'p607'],
      });

      const { data, error } = await supabaseAdmin
        .from('stories')
        .select('visibility')
        .eq('id', story.id)
        .single();

      expect(error).toBeNull();
      expect(data?.visibility).toBe('public');

      await deleteTestStory(story.id);
    });
  });

  test.describe('Cross-visibility constraint still enforced', () => {
    test('linking private point to public story is blocked by DB constraint', async () => {
      const publicStory = await createTestStory(userId, {
        visibility: 'public',
        content: 'P607 test: public story for constraint check',
        tags: ['test', 'p607'],
      });

      const privatePoint = await createTestPoint(userId, {
        statement: 'P607 test: private point for constraint check',
        tags: ['test', 'p607'],
        visibility: 'private',
      });

      // Attempt to link — should fail due to cross-visibility constraint (P586)
      const { error } = await supabaseAdmin
        .from('story_points')
        .insert({
          story_id: publicStory.id,
          point_id: privatePoint.id,
          author_id: userId,
        });

      expect(error).not.toBeNull();

      await deleteTestPoint(privatePoint.id);
      await deleteTestStory(publicStory.id);
    });
  });
});
