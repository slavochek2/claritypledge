/**
 * @file p152-profile-calibration.spec.ts
 * @description E2E tests for P152: Profile System Production Readiness
 *
 * Tests calibration display and ear count badge on profile pages.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createCalibrationData, createEarCountData, deleteCalibrationData } from './helpers/test-calibration';

test.describe('P152: Profile Calibration Display', () => {
  let testUser: TestUser;
  let visitorUser: TestUser;

  test.beforeEach(async () => {
    // Create test users
    testUser = await createTestUser({ name: 'Calibration Test User' });
    visitorUser = await createTestUser({ name: 'Visitor User' });
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testUser?.user?.id) {
      await deleteCalibrationData(testUser.user.id);
      await deleteTestUser(testUser.user.id);
    }
    if (visitorUser?.user?.id) {
      await deleteTestUser(visitorUser.user.id);
    }
  });

  test('visitor sees calibration when user has ≥5 sessions', async ({ page }) => {
    // Setup: Create 5 calibration sessions
    await createCalibrationData({
      listenerId: testUser.user.id,
      speakerId: visitorUser.user.id,
      count: 5,
      overconfident: false, // Well calibrated
    });

    // Navigate to profile (no auth - visitor view)
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify page loaded
    await expect(page.getByRole('heading', { name: testUser.name })).toBeVisible();

    // Verify calibration section visible
    await expect(page.getByText('Understanding Calibration')).toBeVisible();

    // Verify calibration bar present (blue dot indicator)
    const calibrationBar = page.locator('.bg-blue-500.rounded-full').filter({ hasText: '' }); // Blue dot
    await expect(calibrationBar).toBeVisible();

    // Verify tooltip shows on click (CalibrationTooltip has onClick handler)
    await calibrationBar.click();
    // Tooltip text: "Avg (their rating − your confidence) over N sessions"
    await expect(page.getByText(/over \d+ session/i).first()).toBeVisible();
  });

  test('owner sees own calibration when they have ≥5 sessions', async ({ page }) => {
    // Setup: Create 5 calibration sessions
    await createCalibrationData({
      listenerId: testUser.user.id,
      speakerId: visitorUser.user.id,
      count: 5,
    });

    // Login as profile owner
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify calibration section visible
    await expect(page.getByText('Understanding Calibration')).toBeVisible();

    // Verify calibration bar present
    const calibrationBar = page.locator('.bg-blue-500.rounded-full').filter({ hasText: '' });
    await expect(calibrationBar).toBeVisible();

    // Verify owner-specific UI: Create Story button
    await expect(page.getByRole('button', { name: /create story/i })).toBeVisible();
  });

  test('calibration shows empty state when user has <5 sessions', async ({ page }) => {
    // Setup: Create only 2 calibration sessions (insufficient)
    await createCalibrationData({
      listenerId: testUser.user.id,
      speakerId: visitorUser.user.id,
      count: 2,
    });

    // Navigate to profile (works for both owner and visitor)
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify profile loads successfully
    await expect(page.getByRole('heading', { name: testUser.name })).toBeVisible();

    // Verify calibration bar IS rendered (always shown now — empty state)
    await expect(page.getByText('Understanding Calibration')).toBeVisible();

    // Verify no blue dot (no calibration data yet — empty bar, just the track)
    const blueDot = page.locator('.bg-blue-500.rounded-full').filter({ hasText: '' });
    await expect(blueDot).not.toBeVisible();

    // Verify profile still works normally
    await expect(page.getByRole('tab', { name: /stories/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /points/i })).toBeVisible();
  });

  test('ear count badge visible when user has >0 ears', async ({ page }) => {
    // Setup: Create 3 successful understandings (ears)
    await createEarCountData({
      listenerId: testUser.user.id,
      speakerId: visitorUser.user.id,
      count: 3,
    });

    // Navigate to profile
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify ear count badge visible
    const earBadge = page.locator('text="3"').filter({ has: page.locator('svg') }); // Number with ear icon
    await expect(earBadge.first()).toBeVisible();

    // Verify tooltip shows on hover (Radix Tooltip opens on hover, not click)
    await earBadge.first().hover();
    await expect(page.getByText(/understood.*stories/i).first()).toBeVisible();
  });

  test('ear count badge shows 0 when user has no ears', async ({ page }) => {
    // Setup: No ear count data created

    // Navigate to profile
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify ear count badge IS visible showing 0 (always shown)
    const earBadge = page.locator('span.inline-flex').filter({ hasText: '0' }).first();
    await expect(earBadge).toBeVisible();

    // Verify tooltip on hover explains the metric
    await earBadge.hover();
    await expect(page.getByText(/stories/i).first()).toBeVisible();
  });

  test('calibration persists across tab switches', async ({ page }) => {
    // Setup: Create calibration data
    await createCalibrationData({
      listenerId: testUser.user.id,
      speakerId: visitorUser.user.id,
      count: 5,
    });

    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify calibration visible on Stories tab (default)
    await expect(page.getByText('Understanding Calibration')).toBeVisible();

    // Switch to Points tab
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForTimeout(300); // Wait for tab transition

    // Switch back to Stories tab
    await page.getByRole('tab', { name: /stories/i }).click();
    await page.waitForTimeout(300);

    // Verify calibration still visible
    await expect(page.getByText('Understanding Calibration')).toBeVisible();
  });

  test('profile layout consistent between owner and visitor views', async ({ page }) => {
    // Setup: Create calibration data
    await createCalibrationData({
      listenerId: testUser.user.id,
      speakerId: visitorUser.user.id,
      count: 5,
    });

    // 1. Load as visitor (no auth)
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify visitor view structure
    const visitorCalibration = page.getByText('Understanding Calibration');
    await expect(visitorCalibration).toBeVisible();

    const visitorTabs = page.getByRole('tablist');
    await expect(visitorTabs).toBeVisible();

    // 2. Login and reload (owner view)
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify owner view has same structure
    const ownerCalibration = page.getByText('Understanding Calibration');
    await expect(ownerCalibration).toBeVisible();

    const ownerTabs = page.getByRole('tablist');
    await expect(ownerTabs).toBeVisible();

    // Verify only functional difference: Create Story button
    const createButton = page.getByRole('button', { name: /create story/i });
    await expect(createButton).toBeVisible(); // Only in owner view
  });

  test('no regression: position-taking still works on visitor view', async ({ page }) => {
    // This test verifies existing functionality isn't broken
    // Position-taking requires a point to exist, so we'll just verify the UI doesn't crash

    // Setup: Login as visitor
    await setTestSession(page, visitorUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Verify page loads without errors
    await expect(page.getByRole('heading', { name: testUser.name })).toBeVisible();

    // Verify Points tab accessible
    const pointsTab = page.getByRole('tab', { name: /points/i });
    await expect(pointsTab).toBeVisible();
    await pointsTab.click();

    // Verify empty state or points list renders
    const pointsPanel = page.getByRole('tabpanel');
    await expect(pointsPanel).toBeVisible();
  });
});
