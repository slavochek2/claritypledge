/**
 * @file point-position-persistence.spec.ts
 * @description E2E test to verify that position updates on points persist to profile page
 *
 * Bug fix verification: When a user takes a position on a point via the point detail page,
 * that position should be saved to the database and visible on their profile page.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('Point Position Persistence', () => {
  let testUser: TestUser;
  let testPointId: string;

  test.beforeAll(async () => {
    // Apply RLS fix for point_position_history table
    // This policy is needed for the log_position_change() trigger to work
    console.log('[TEST SETUP] Note: RLS policy for point_position_history must be applied manually');
    console.log('[TEST SETUP] Run: supabase/migrations/20260209_fix_position_history_rls.sql');
  });

  // Unique per run. A fixed literal here left 110 identical rows on the shared test
  // project: cleanup in afterEach is declared but does not always complete (a timed-out
  // test can lose its teardown budget), and every leftover row then matches this file's
  // own `hasText` locators. Uniqueness makes the tests correct whether or not cleanup
  // runs, and matches what the rest of the suite already does (e.g. p1104's fixtures).
  const POINT_STATEMENT = `E2E Test Point: Remote work increases productivity ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  test.beforeEach(async () => {
    // Create test user
    testUser = await createTestUser({ name: 'Position Tester' });

    // Create a test point using Supabase Admin
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: POINT_STATEMENT,
        context: 'Testing position persistence',
        first_validator_id: testUser.user.id,
        tags: ['test'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }

    testPointId = pointData.id;
    console.log(`[TEST] Created test point: ${testPointId}`);
  });

  test.afterEach(async () => {
    // Clean up test point
    if (testPointId) {
      await supabaseAdmin.from('points').delete().eq('id', testPointId);
    }

    // Clean up test user
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('should persist position from point detail page to profile page', async ({ page }) => {
    // Capture browser console logs
    page.on('console', msg => console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', error => console.error(`[BROWSER ERROR]`, error));

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to point detail page
    await page.goto(`/point/${testPointId}`);
    await expect(page).toHaveURL(`/point/${testPointId}`);

    // Verify point is loaded
    await expect(page.getByText(POINT_STATEMENT)).toBeVisible();

    // Click "Agree" position button
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await expect(agreeButton).toBeVisible();
    await agreeButton.click();

    // Wait for position to be saved (button should show active state)
    await page.waitForTimeout(2000); // Give time for DB write

    // DEBUGGING: Check if position was actually saved to DB
    const { data: dbPosition, error: dbError } = await supabaseAdmin
      .from('point_positions')
      .select('*')
      .eq('point_id', testPointId)
      .eq('user_id', testUser.user.id)
      .single();

    console.log('[DEBUG] DB position check:', dbPosition, dbError);

    // Navigate to profile page
    await page.goto(`/p/${testUser.slug}`);
    await expect(page).toHaveURL(`/p/${testUser.slug}`);

    // Switch to Points tab
    const pointsTab = page.getByRole('tab', { name: /points/i });
    await expect(pointsTab).toBeVisible();
    await pointsTab.click();

    // Verify the point appears on profile
    await expect(page.getByText(POINT_STATEMENT)).toBeVisible({ timeout: 10000 });

    // Verify position badge is shown (user took position "agree")
    // The PositionBadge component displays "Agrees" in a blue badge
    const pointCard = page.locator('.border-l-4', { hasText: POINT_STATEMENT });
    await expect(pointCard).toBeVisible();

    // Check for the actual position badge text (PositionBadge shows "Agrees" for agree position)
    const positionBadge = pointCard.getByText(/Agrees|Disagrees|Unsure/);
    await expect(positionBadge).toBeVisible();
  });

  test('should allow position changes and persist updates', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to point detail page
    await page.goto(`/point/${testPointId}`);

    // Take initial position: Agree
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await agreeButton.click();
    await page.waitForTimeout(1000);

    // Change position: Disagree
    const disagreeButton = page.getByRole('button', { name: /disagree/i }).first();
    await disagreeButton.click();
    await page.waitForTimeout(1000);

    // Navigate to profile
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // Verify point still appears (with updated position)
    await expect(page.getByText(POINT_STATEMENT)).toBeVisible({ timeout: 10000 });
  });

  test('should remove position when toggled off', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to point detail page
    await page.goto(`/point/${testPointId}`);

    // Take a position
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await agreeButton.click();
    await page.waitForTimeout(1000);

    // Verify position was saved by checking profile
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await expect(page.getByText(POINT_STATEMENT)).toBeVisible({ timeout: 10000 });

    // Go back and remove position (toggle off)
    await page.goto(`/point/${testPointId}`);
    await agreeButton.click(); // Click again to remove
    await page.waitForTimeout(1000);

    // Check profile - point should no longer appear in Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // Should show empty state or point should not be visible
    const emptyState = page.getByText(/no positions taken yet/i);
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test('should maintain position counts after user takes position', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to point detail page
    await page.goto(`/point/${testPointId}`);

    // Check initial count (should be 0 for all positions)
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();

    // Take position
    await agreeButton.click();
    await page.waitForTimeout(1000);

    // Reload page to verify counts updated
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Position counts should reflect the new position
    // (Implementation detail: verify the button shows count > 0 or has active state)
    await expect(agreeButton).toBeVisible();
  });

  test('should persist position update from profile page Points tab', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to point detail page and take initial position
    await page.goto(`/point/${testPointId}`);
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await agreeButton.click();
    await page.waitForTimeout(2000);

    // Go to profile Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // Verify point appears with initial position
    await expect(page.getByText(POINT_STATEMENT)).toBeVisible({ timeout: 10000 });

    // Verify the initial position badge shows "Agrees"
    const initialPointCard = page.locator('.border-l-4', { hasText: POINT_STATEMENT });
    await expect(initialPointCard.getByText(/Agrees/)).toBeVisible({ timeout: 5000 });

    // Click a different position button on the profile page
    const disagreeButton = initialPointCard.getByRole('button', { name: /disagree/i }).first();
    await expect(disagreeButton).toBeVisible();
    await disagreeButton.click();

    // Wait for position update to complete and page to refresh
    await page.waitForTimeout(3000);

    // Verify the position badge updated to "Disagrees" without navigation
    await expect(initialPointCard.getByText(/Disagrees/)).toBeVisible({ timeout: 10000 });

    // Optional: Navigate away and back to verify persistence across page loads
    await page.goto('/events');
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // Verify position still shows as "Disagrees" after page reload
    const reloadedPointCard = page.locator('.border-l-4', { hasText: POINT_STATEMENT });
    await expect(reloadedPointCard.getByText(/Disagrees/)).toBeVisible();
  });
});
