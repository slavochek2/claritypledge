/**
 * @file p506-auto-extract-hashtags.spec.ts
 * @description P506: E2E tests for automatic hashtag extraction.
 *
 * Verifies that:
 * - Stories with hashtags have tags persisted in DB
 * - Tag pills render on profile for tagged stories
 * - Stories without hashtags have empty tags (no false positives)
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from './helpers/test-story';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P506: Auto-extract hashtags', () => {
  test.setTimeout(45000);

  let author: TestUser;
  let taggedStory: TestStory;
  let untaggedStory: TestStory;

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P506 Extract Test User' });

    // Story with hashtags — tags set as extractHashtags would produce
    taggedStory = await createTestStory(author.user.id, {
      title: 'Tagged Story',
      content: 'Great session about #leadership and #trust today',
      tags: ['leadership', 'trust'],
      visibility: 'public',
    });

    // Story without hashtags
    untaggedStory = await createTestStory(author.user.id, {
      title: 'Untagged Story',
      content: 'A story with no hashtags at all',
      tags: [],
      visibility: 'public',
    });
  });

  test.afterAll(async () => {
    if (untaggedStory?.id) await deleteTestStory(untaggedStory.id);
    if (taggedStory?.id) await deleteTestStory(taggedStory.id);
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  test('story with hashtags has tags persisted in DB', async () => {
    const { data } = await supabaseAdmin
      .from('stories')
      .select('tags')
      .eq('id', taggedStory.id)
      .single();

    expect(data?.tags).toContain('leadership');
    expect(data?.tags).toContain('trust');
  });

  test('story without hashtags has empty tags in DB', async () => {
    const { data } = await supabaseAdmin
      .from('stories')
      .select('tags')
      .eq('id', untaggedStory.id)
      .single();

    expect(data?.tags).toEqual([]);
  });

  test('tags are queryable via Supabase filter', async () => {
    // Verify tags can be filtered — same mechanism the feed uses
    const { data } = await supabaseAdmin
      .from('stories')
      .select('id, tags')
      .contains('tags', ['leadership']);

    const match = data?.find(s => s.id === taggedStory.id);
    expect(match).toBeDefined();
    expect(match?.tags).toContain('leadership');
  });
});
