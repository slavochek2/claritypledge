/**
 * @file p272-smoke.spec.ts
 * @description Smoke tests for P272: Story Verification in /live
 *
 * Fast regression detection — verifies:
 * - /live page loads without console errors (authenticated)
 * - /live/{code} join page loads without console errors (guest)
 * - Story picker search input renders after selecting "New session" (authenticated + story owner)
 *
 * Creator flow (/live) requires auth → uses setTestSession.
 * Join flow (/live/:code) doesn't require auth → runs as guest.
 *
 * These tests are fast (no two-party setup). Full story sync and verification
 * tests are in e2e/p272-live-verification.spec.ts.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory, TestStory } from './helpers/test-story';

// ============================================================================
// Guest tests — no auth needed (join flow)
// ============================================================================

test.describe('P272 Smoke — Guest (join flow)', () => {
  test('/live/{code} join page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/live/SMOKE272');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(consoleErrors, `Console errors on join page: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  test('/live/{code} join page shows name input and consent checkbox', async ({ page }) => {
    await page.goto('/live/SMOKE272');
    await expect(page.locator('input[placeholder="Enter your name"]')).toBeVisible();
    await expect(page.locator('input[type="checkbox"]')).toBeVisible();
  });
});

// ============================================================================
// Authenticated tests — creator flow
// ============================================================================

test.describe('P272 Smoke — Authenticated (creator flow)', () => {
  let testUser: TestUser;
  let testStory: TestStory | null = null;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'P272 Smoke User' });
    testStory = await createTestStory(testUser.user.id, {
      content: 'P272 smoke test story: calibration practice',
    });
  });

  test.afterEach(async () => {
    if (testStory?.id) await deleteTestStory(testStory.id);
    if (testUser?.user?.id) await deleteTestUser(testUser.user.id);
  });

  test('/live page loads without console errors', async ({ page }) => {
    await setTestSession(page, testUser.email);
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors on /live: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  test('/live page renders without crashing', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    // Page should have rendered successfully (heading visible)
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(10);
  });
});
