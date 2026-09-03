/**
 * @file p145-regression.spec.ts
 * @description E2E regression tests for P151 - Position Loading Architecture
 *
 * Verifies that all existing pages with points continue to work after
 * the position loading architecture refactor. Ensures no regressions
 * in point detail pages, story detail pages, and other point displays.
 *
 * Related: P151 - System-Wide Position Loading Architecture Audit
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('Position Loading Regression Tests (P151)', () => {
  let testUser: TestUser;
  let testPointId: string;
  let testStoryId: string;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'Regression Test User' });
  });

  test.afterEach(async () => {
    // Clean up test point
    if (testPointId) {
      await supabaseAdmin.from('points').delete().eq('id', testPointId);
    }

    // Clean up test story
    if (testStoryId) {
      await supabaseAdmin.from('stories').delete().eq('id', testStoryId);
    }

    // Clean up test user
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('point detail page still works (no regression)', async ({ page }) => {
    // Create test point
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Regression test: Point detail page works',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p145', 'regression'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointId = pointData.id;

    // Set position
    await supabaseAdmin.from('point_positions').insert({
      point_id: testPointId,
      user_id: testUser.user.id,
      position: 'agree',
    });

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to point detail page
    await page.goto(`/point/${testPointId}`);
    await expect(page).toHaveURL(`/point/${testPointId}`);

    // Verify point loads
    await expect(page.getByText('Regression test: Point detail page works')).toBeVisible({ timeout: 10000 });

    // TODO: Verify position buttons are visible and functional
    // Expected: Position buttons show current position (agree is active)
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await expect(agreeButton).toBeVisible();

    // TODO: Verify position counts are displayed
    // Expected: "1 agree" or similar count display

    // TODO: Verify clicking position button works (toggle off)
    await agreeButton.click();
    await page.waitForTimeout(1000);

    // TODO: Verify position was removed (button no longer active)
  });

  test('story detail page unchanged (no regression)', async ({ page }) => {
    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Create a story
    await page.goto('/create');
    const storyContent = 'Regression test story: Position loading still works';
    await page.locator('textarea#story-content').fill(storyContent);
    await page.getByRole('button', { name: /save story/i }).click();

    // Wait for redirect to story detail
    await expect(page).toHaveURL(/\/story\/[a-f0-9-]+/, { timeout: 15000 });
    const currentUrl = page.url();
    testStoryId = currentUrl.split('/story/')[1];

    // Verify story loads
    await expect(page.getByText(storyContent)).toBeVisible();

    // Add a point to the story
    const pointTextarea = page.locator('textarea[placeholder="State your point..."]');
    await pointTextarea.fill('Story point: Position loading works');
    await page.getByRole('button', { name: /add point/i }).click();

    // Wait for point to appear
    await expect(page.getByText('Story point: Position loading works')).toBeVisible({ timeout: 20000 });

    // TODO: Verify position buttons are visible on the point
    // TODO: Verify clicking position button works
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await expect(agreeButton).toBeVisible();
    await agreeButton.click();
    await page.waitForTimeout(1000);

    // TODO: Verify position was saved (button shows active state)

    // Refresh page (regression check for P140-style bugs)
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify no errors after refresh
    await expect(page.getByText('Failed to load story')).not.toBeVisible();
    await expect(page.getByText(storyContent)).toBeVisible();
    await expect(page.getByText('Story point: Position loading works')).toBeVisible();

    // TODO: Verify position persisted after refresh
  });

  test('all pages with points still work after refactor', async ({ page }) => {
    // This test creates a point and verifies it appears correctly across multiple pages
    // Testing the batch loading pattern doesn't break any existing displays

    // Create test point with position
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Cross-page regression test point',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p145', 'regression'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointId = pointData.id;

    // Set position
    await supabaseAdmin.from('point_positions').insert({
      point_id: testPointId,
      user_id: testUser.user.id,
      position: 'strongly_agree',
    });

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Test 1: Point detail page
    await page.goto(`/point/${testPointId}`);
    await expect(page.getByText('Cross-page regression test point')).toBeVisible({ timeout: 10000 });
    // TODO: Verify position badge/buttons visible

    // Test 2: Profile Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await expect(page.getByText('Cross-page regression test point')).toBeVisible({ timeout: 10000 });
    // TODO: Verify position badge shows "Strongly Agrees"

    // Test 3: Profile Stories tab (if point is in a story)
    // TODO: Create story with point, verify it appears correctly

    // Test 4: Story detail page (if point is in a story)
    // TODO: Navigate to story, verify point appears with position

    // All pages should load without errors
    // No console errors should appear (critical for regression)
  });

  test('position changes on one page reflect on all pages', async ({ page }) => {
    // Create test point
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Multi-page sync test point',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p145', 'regression'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointId = pointData.id;

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Take position on point detail page
    await page.goto(`/point/${testPointId}`);
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await expect(agreeButton).toBeVisible();
    await agreeButton.click();
    await page.waitForTimeout(2000);

    // Navigate to profile and verify position shows there
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await expect(page.getByText('Multi-page sync test point')).toBeVisible({ timeout: 10000 });

    // TODO: Verify position badge shows "Agrees"
    const pointCard = page.locator('.border-l-4', { hasText: 'Multi-page sync test point' });
    await expect(pointCard).toBeVisible();
    const positionBadge = pointCard.getByText(/Agrees/);
    await expect(positionBadge).toBeVisible();

    // Change position on profile page
    const disagreeButton = pointCard.getByRole('button', { name: /disagree/i }).first();
    await expect(disagreeButton).toBeVisible();
    await disagreeButton.click();
    await page.waitForTimeout(2000);

    // TODO: Verify position badge updated to "Disagrees"

    // Navigate back to point detail page
    await page.goto(`/point/${testPointId}`);
    await page.waitForLoadState('networkidle');

    // TODO: Verify position buttons reflect new position (disagree is active)
  });

  test('unauthenticated users can still view points (no regression)', async ({ page }) => {
    // Create test point (no authentication needed to view)
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Public access regression test',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p145', 'regression'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointId = pointData.id;

    // Visit point detail page WITHOUT authentication
    await page.goto(`/point/${testPointId}`);

    // Verify point is visible to unauthenticated users
    await expect(page.getByText('Public access regression test')).toBeVisible({ timeout: 10000 });

    // TODO: Verify position buttons are visible (even if not functional)
    // TODO: Verify clicking position button prompts login (if implemented)

    // Visit profile page WITHOUT authentication
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // Verify point is visible on profile
    await expect(page.getByText('Public access regression test')).toBeVisible({ timeout: 10000 });

    // No errors should appear for unauthenticated users
    await expect(page.getByText(/failed to load/i)).not.toBeVisible();
  });
});
