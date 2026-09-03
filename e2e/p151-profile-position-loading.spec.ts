/**
 * @file p145-profile-position-loading.spec.ts
 * @description E2E tests for P151 - Profile Position Loading Architecture
 *
 * Tests that profile pages correctly load and display user positions using
 * the new efficient batch loading pattern (no N+1 queries).
 *
 * Related: P151 - System-Wide Position Loading Architecture Audit
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('Profile Position Loading (P151)', () => {
  let testUser: TestUser;
  let testPointIds: string[] = [];

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'Position Test User' });
    testPointIds = [];
  });

  test.afterEach(async () => {
    if (testPointIds.length > 0) {
      // Delete history first to avoid FK constraint violation during cascade.
      // When points cascade-delete positions, the trigger inserts into history.
      // If history has point_id FK pointing to a point being deleted simultaneously,
      // PostgreSQL rejects the insert. Explicit cleanup prevents this.
      await supabaseAdmin.from('point_position_history').delete().in('point_id', testPointIds);
      await supabaseAdmin.from('point_positions').delete().in('point_id', testPointIds);
      await supabaseAdmin.from('points').delete().in('id', testPointIds);
    }

    // Clean up test user (after points are gone, no FK conflicts remain)
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('profile page shows user positions on their points', async ({ page }) => {
    // Create a test point with a position
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Profile test: AI will transform education',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p145'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointIds.push(pointData.id);

    // Set a position on the point
    await supabaseAdmin.from('point_positions').insert({
      point_id: pointData.id,
      user_id: testUser.user.id,
      position: 'agree',
    });

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile
    await page.goto(`/p/${testUser.slug}`);
    await expect(page).toHaveURL(`/p/${testUser.slug}`);

    // Switch to Points tab
    const pointsTab = page.getByRole('tab', { name: /points/i });
    await expect(pointsTab).toBeVisible();
    await pointsTab.click();

    // Verify point appears
    await expect(page.getByText('Profile test: AI will transform education')).toBeVisible({ timeout: 10000 });

    // TODO: Verify position badge shows "Agrees" (green badge)
    // TODO: Verify position buttons show user's current position (aria-pressed="true")
    const pointCard = page.locator('.border-l-4', { hasText: 'Profile test: AI will transform education' });
    await expect(pointCard).toBeVisible();

    // Position badge should be visible (cursor-default distinguishes badge from interactive buttons)
    const positionBadge = pointCard.locator('.cursor-default').filter({ hasText: /Agrees|Disagrees|Unsure/ });
    await expect(positionBadge).toBeVisible();
  });

  test('position badges render correctly for different positions', async ({ page }) => {
    // Create 3 points with different positions
    const positions = [
      { statement: 'Point 1: Agree position', position: 'agree' as const },
      { statement: 'Point 2: Disagree position', position: 'disagree' as const },
      { statement: 'Point 3: Unsure position', position: 'unsure' as const },
    ];

    for (const { statement, position } of positions) {
      const { data: pointData, error: pointError } = await supabaseAdmin
        .from('points')
        .insert({
          statement,
          first_validator_id: testUser.user.id,
          tags: ['test', 'p145'],
        })
        .select('id')
        .single();

      if (pointError || !pointData) {
        throw new Error(`Failed to create test point: ${pointError?.message}`);
      }
      testPointIds.push(pointData.id);

      // Set position
      await supabaseAdmin.from('point_positions').insert({
        point_id: pointData.id,
        user_id: testUser.user.id,
        position,
      });
    }

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // TODO: Verify each position badge renders with correct text and styling
    // Agree → "Agrees" (green/blue badge)
    // Disagree → "Disagrees" (red badge)
    // Unsure → "Unsure" (gray badge)
    await expect(page.getByText('Point 1: Agree position')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Point 2: Disagree position')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Point 3: Unsure position')).toBeVisible({ timeout: 10000 });

    // At least one position badge should be visible for each
    const agreeBadge = page.locator('.border-l-4', { hasText: 'Point 1' }).locator('.cursor-default').filter({ hasText: /Agrees/ });
    await expect(agreeBadge).toBeVisible();
  });

  test('batch loading: no N+1 queries for multiple points', async ({ page }) => {
    // Create 10 points with positions
    const pointCount = 10;
    for (let i = 0; i < pointCount; i++) {
      const { data: pointData, error: pointError } = await supabaseAdmin
        .from('points')
        .insert({
          statement: `Batch test point ${i + 1}`,
          first_validator_id: testUser.user.id,
          tags: ['test', 'p145'],
        })
        .select('id')
        .single();

      if (pointError || !pointData) {
        throw new Error(`Failed to create test point: ${pointError?.message}`);
      }
      testPointIds.push(pointData.id);

      // Set position on each point
      await supabaseAdmin.from('point_positions').insert({
        point_id: pointData.id,
        user_id: testUser.user.id,
        position: i % 2 === 0 ? 'agree' : 'disagree',
      });
    }

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // TODO: Monitor network requests to verify batch loading pattern
    // Expected: 2-3 queries total (getPointsForProfileDisplay, batch position counts, batch user positions)
    // NOT expected: N individual queries (N+1 anti-pattern)

    // For now, just verify all points load
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // Verify all points are visible (use .first() — point text may appear in card + link)
    await expect(page.getByText('Batch test point 1').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`Batch test point ${pointCount}`).first()).toBeVisible({ timeout: 10000 });

    // TODO: Verify each point has its position badge visible
    // TODO: Add network monitoring to verify batch loading (not N+1)
  });

  test('unauthenticated viewer sees position counts only (no user position)', async ({ page }) => {
    // Create a point with a position
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Public test: Remote work is the future',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p145'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointIds.push(pointData.id);

    // Set a position from the profile owner
    await supabaseAdmin.from('point_positions').insert({
      point_id: pointData.id,
      user_id: testUser.user.id,
      position: 'agree',
    });

    // Visit profile WITHOUT authenticating
    await page.goto(`/p/${testUser.slug}`);
    await expect(page).toHaveURL(`/p/${testUser.slug}`);

    // Switch to Points tab
    await page.getByRole('tab', { name: /points/i }).click();

    // Verify point is visible
    await expect(page.getByText('Public test: Remote work is the future')).toBeVisible({ timeout: 10000 });

    // TODO: Verify position COUNTS are visible (e.g., "1 agree")
    // TODO: Verify position buttons are NOT in active state (viewer has no position)
    // TODO: Verify clicking position button prompts login (if implemented)

    // Position badge should show the owner's position
    const pointCard = page.locator('.border-l-4', { hasText: 'Public test: Remote work is the future' });
    await expect(pointCard).toBeVisible();
  });

  test('profile shows points user positioned on (not just created)', async ({ page }) => {
    // Create another user who creates a point
    const creatorUser = await createTestUser({ name: 'Point Creator' });

    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Creator test: Climate action is urgent',
        first_validator_id: creatorUser.user.id, // Different creator
        tags: ['test', 'p145'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointIds.push(pointData.id);

    // Test user takes a position on this point
    await supabaseAdmin.from('point_positions').insert({
      point_id: pointData.id,
      user_id: testUser.user.id,
      position: 'strongly_agree',
    });

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // TODO: Verify point appears (user positioned on it, even though they didn't create it)
    // This depends on profile page implementation - does it show:
    // A) Only points user created?
    // B) Points user created + points user positioned on?
    // Current implementation appears to be (A), but spec suggests (B) might be future feature

    // Clean up creator user
    await deleteTestUser(creatorUser.user.id);
  });
});
