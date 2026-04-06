/**
 * @file p662-verify.spec.ts
 * @description E2E verification for P662: /story/stN slug resolution
 *
 * Tests that story slugs (e.g. /story/st1) resolve to the correct story UUID
 * and redirect to the canonical URL.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';

// Serial: shared state (storyId) across tests
test.describe.serial('P662: Story slug resolution', () => {
  let testUser: TestUser;
  let storyId: string;
  // Unique slug to avoid collisions with real data
  const SLUG_TAG = `st${Date.now()}`;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P662 Test' });

    // Create a story with system_tags containing the stN slug
    const { data, error } = await supabaseAdmin
      .from('stories')
      .insert({
        title: 'Test story for slug resolution verification',
        content: 'Test story for slug resolution verification',
        author_id: testUser.user.id,
        visibility: 'public',
        tags: ['test'],
        system_tags: [SLUG_TAG, 'v0'],
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create test story: ${error.message}`);
    storyId = data.id;
  });

  test.afterAll(async () => {
    if (storyId) {
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('slug resolves and redirects to canonical UUID URL', async ({ page }) => {
    await page.goto(`/story/${SLUG_TAG}`);

    // Should redirect to the UUID URL
    await expect(page).toHaveURL(new RegExp(`/story/${storyId}`), { timeout: 15000 });

    // Should show the story content
    await expect(page.getByText('Test story for slug resolution verification')).toBeVisible({ timeout: 10000 });
  });

  test('non-existent slug shows not-found state', async ({ page }) => {
    await page.goto('/story/st00000000');

    // Should show error/not-found state
    await expect(
      page.getByText(/not found|doesn't exist|no story/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('direct UUID URL continues working', async ({ page }) => {
    await page.goto(`/story/${storyId}`);

    // Should stay on the UUID URL (no redirect)
    await expect(page).toHaveURL(new RegExp(`/story/${storyId}`), { timeout: 10000 });

    // Should show the story content
    await expect(page.getByText('Test story for slug resolution verification')).toBeVisible({ timeout: 10000 });
  });
});
