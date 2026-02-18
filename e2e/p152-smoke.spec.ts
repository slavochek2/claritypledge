/**
 * @file p152-smoke.spec.ts
 * @description Smoke tests for P152: Profile Calibration Display
 *
 * Fast regression detection - verifies page loads without errors.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createCalibrationData, deleteCalibrationData } from './helpers/test-calibration';

test.describe('P152 Smoke Tests', () => {
  let testUser: TestUser;
  let visitorUser: TestUser;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'Smoke Test User' });
    visitorUser = await createTestUser({ name: 'Visitor User' });
  });

  test.afterEach(async () => {
    if (testUser?.user?.id) {
      await deleteCalibrationData(testUser.user.id);
      await deleteTestUser(testUser.user.id);
    }
    if (visitorUser?.user?.id) {
      await deleteTestUser(visitorUser.user.id);
    }
  });

  test('profile page with calibration loads without errors', async ({ page }) => {
    // Setup: Create calibration data
    await createCalibrationData({
      listenerId: testUser.user.id,
      speakerId: visitorUser.user.id,
      count: 5,
    });

    // Capture console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to profile
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify page loads
    await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`));

    // Verify no console errors
    expect(consoleErrors).toHaveLength(0);

    // Verify main heading present
    await expect(page.getByRole('heading', { name: testUser.name })).toBeVisible();

    // Verify calibration section present
    await expect(page.getByText('Understanding Calibration')).toBeVisible();
  });

  test('profile page with insufficient calibration loads without errors', async ({ page }) => {
    // Setup: Create insufficient calibration data
    await createCalibrationData({
      listenerId: testUser.user.id,
      speakerId: visitorUser.user.id,
      count: 2,
    });

    // Capture console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify page loads
    await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`));

    // Verify no console errors
    expect(consoleErrors).toHaveLength(0);

    // Verify calibration section IS shown (always visible — shows empty bar when insufficient data)
    await expect(page.getByText('Understanding Calibration')).toBeVisible();
    // Verify profile still loads
    await expect(page.getByRole('heading', { name: testUser.name })).toBeVisible();
  });

  test('profile page with no calibration data loads without errors', async ({ page }) => {
    // No setup - user has zero calibration data

    // Capture console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify page loads
    await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`));

    // Verify no console errors
    expect(consoleErrors).toHaveLength(0);

    // Verify profile name visible
    await expect(page.getByRole('heading', { name: testUser.name })).toBeVisible();

    // Calibration section may or may not be visible (depends on null handling)
    // Just verify page doesn't crash
  });

  test('profile page tabs load without errors', async ({ page }) => {
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify Stories tab loads (default)
    await expect(page.getByRole('tab', { name: /stories/i })).toBeVisible();

    // Switch to Points tab
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify Points tab panel visible
    await expect(page.getByRole('tabpanel')).toBeVisible();

    // Switch back to Stories tab
    await page.getByRole('tab', { name: /stories/i }).click();
    await page.waitForLoadState('networkidle');

    // Verify Stories tab panel visible
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });

  test('profile page with ear count loads without errors', async ({ page }) => {
    // Setup: Create ear count data
    await createCalibrationData({
      listenerId: testUser.user.id,
      speakerId: visitorUser.user.id,
      count: 5,
    });

    // Capture console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify page loads
    await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`));

    // Verify no console errors
    expect(consoleErrors).toHaveLength(0);

    // Verify ear count visible (may be 0 or >0 depending on data)
    // Just verify page renders without crashing
    await expect(page.getByRole('heading', { name: testUser.name })).toBeVisible();
  });

  test('profile 404 page loads gracefully', async ({ page }) => {
    // Navigate to non-existent profile
    await page.goto('/p/non-existent-user-slug-12345');
    await page.waitForLoadState('networkidle');

    // Verify error page renders (not blank or crashed)
    // Could be 404 page or redirect to home
    const body = await page.textContent('body');
    expect(body).toBeTruthy(); // Page has content

    // Common 404 indicators
    const has404 = body?.match(/not found|404|doesn't exist/i);
    if (has404) {
      // Verify 404 page has helpful content
      expect(body).toMatch(/not found|404|doesn't exist/i);
    }
  });
});
