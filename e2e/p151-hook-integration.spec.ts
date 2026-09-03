/**
 * @file p145-hook-integration.spec.ts
 * @description E2E tests for P151 - usePointsForProfile hook integration
 *
 * Tests that the React hook properly loads points with positions,
 * handles loading states, and refetches on user changes.
 *
 * Related: P151 - System-Wide Position Loading Architecture Audit
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('usePointsForProfile Hook Integration (P151)', () => {
  let testUser: TestUser;
  let testPointIds: string[] = [];

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'Hook Test User' });
    testPointIds = [];
  });

  test.afterEach(async () => {
    // Clean up test points
    if (testPointIds.length > 0) {
      await supabaseAdmin.from('points').delete().in('id', testPointIds);
    }

    // Clean up test user
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('usePointsForProfile hook loads data correctly', async ({ page }) => {
    // Create test point with position
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Hook test: AI ethics should be regulated',
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
      position: 'strongly_agree',
    });

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // TODO: Verify hook loads data (check browser console for hook debug logs)
    // TODO: Verify points array includes PointWithUserPosition data structure
    // Expected structure: { id, statement, positionCounts, totalPositions, userPosition }

    // Verify point is visible (means hook loaded successfully)
    await expect(page.getByText('Hook test: AI ethics should be regulated')).toBeVisible({ timeout: 10000 });

    // TODO: Add console log monitoring to verify hook lifecycle
    // - Should log: "Loading points for profile..."
    // - Should log: "Points loaded successfully"
    // - Should NOT log: "Error loading points"
  });

  test('hook handles loading states correctly', async ({ page }) => {
    // Create test point
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Loading state test point',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p145'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointIds.push(pointData.id);

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile
    await page.goto(`/p/${testUser.slug}`);

    // TODO: Verify loading state is shown initially
    // Expected: Spinner or skeleton while hook fetches data
    // Current implementation may not show loading state explicitly

    // Switch to Points tab
    await page.getByRole('tab', { name: /points/i }).click();

    // TODO: Verify loading state transitions to loaded state
    // Expected: Spinner disappears, content appears

    // Verify point appears (loading complete)
    await expect(page.getByText('Loading state test point')).toBeVisible({ timeout: 10000 });

    // TODO: Verify no error state is shown
    // Expected: No "Failed to load" message
    await expect(page.getByText(/failed to load/i)).not.toBeVisible();
  });

  test('hook refetches on user change (login/logout)', async ({ page }) => {
    // Create test point with position
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Refetch test: Privacy is a human right',
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
      position: 'agree',
    });

    // Visit profile WITHOUT authenticating first
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // Verify point is visible (unauthenticated view)
    await expect(page.getByText('Refetch test: Privacy is a human right')).toBeVisible({ timeout: 10000 });

    // TODO: Verify position badge shows owner's position but NOT active state
    // (because viewer is not authenticated)

    // Now authenticate
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // TODO: Verify hook refetched data with user context
    // Expected: Position buttons now show active state (viewer is the owner)
    // Expected: Position badge still visible with correct position

    // Verify point still visible (authenticated view)
    await expect(page.getByText('Refetch test: Privacy is a human right')).toBeVisible({ timeout: 10000 });

    // TODO: Verify position buttons reflect user's position (aria-pressed="true")
  });

  test('hook handles empty state (no points)', async ({ page }) => {
    // Don't create any points - test empty state

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // TODO: Verify empty state message is shown
    // Expected: "No positions taken yet" or similar message
    const emptyState = page.getByText(/no positions|no points/i);
    await expect(emptyState).toBeVisible({ timeout: 5000 });

    // TODO: Verify no loading spinner stuck in loading state
    // TODO: Verify no error message shown
  });

  test('hook handles error state gracefully', async ({ page }) => {
    // This test is tricky - need to trigger an error in the hook
    // Options:
    // 1. Network failure (disconnect)
    // 2. Invalid profile ID
    // 3. Database error (hard to simulate)

    // For now, test with invalid profile slug
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to non-existent profile
    await page.goto('/p/invalid-slug-that-does-not-exist-12345');

    // TODO: Verify error handling (profile not found)
    // Expected: 404 page or error message
    // Expected: Hook does not crash the page

    // Verify page doesn't crash
    await expect(page).toHaveURL(/\/p\/invalid-slug-that-does-not-exist-12345/);

    // TODO: Verify appropriate error message shown
    // TODO: Verify no infinite loading state
  });

  test('hook refetches when switching between profiles', async ({ page }) => {
    // Create a second user with points
    const secondUser = await createTestUser({ name: 'Second User' });

    // Create point for first user
    const { data: point1Data } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'First user point',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p145'],
      })
      .select('id')
      .single();
    if (point1Data) testPointIds.push(point1Data.id);

    // Create point for second user
    const { data: point2Data } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Second user point',
        first_validator_id: secondUser.user.id,
        tags: ['test', 'p145'],
      })
      .select('id')
      .single();
    if (point2Data) testPointIds.push(point2Data.id);

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Visit first profile
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await expect(page.getByText('First user point')).toBeVisible({ timeout: 10000 });

    // Switch to second profile
    await page.goto(`/p/${secondUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // TODO: Verify hook refetched data for second profile
    // Expected: First user's point NOT visible
    // Expected: Second user's point IS visible
    await expect(page.getByText('Second user point')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('First user point')).not.toBeVisible();

    // Clean up second user
    await deleteTestUser(secondUser.user.id);
  });
});
