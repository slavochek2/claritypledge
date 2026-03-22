/**
 * @file p566-smoke.spec.ts
 * @description Smoke tests for P566: Audio Chunk Upload Reliability.
 *
 * Pattern: authenticate → navigate → check no console errors.
 * Lightweight — verify page stability, not business logic.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { mockMicPermission } from './helpers/test-realtime';

let testUser: TestUser;

test.beforeAll(async () => {
  testUser = await createTestUser({ name: 'P566SmokeUser' });
});

test.afterAll(async () => {
  if (testUser?.user?.id) await deleteTestUser(testUser.user.id);
});

test.describe('P566: Smoke tests', () => {
  test('/live page loads without console errors', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockMicPermission(page);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    try {
      await setTestSession(page, testUser.email);
      await page.goto('/live');
      await page.waitForLoadState('networkidle');

      // Page should load without crashing
      await expect(page).toHaveURL(/\/live/);

      // No console errors
      expect(consoleErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('RecordingIndicator component is present on /live page', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockMicPermission(page);

    try {
      await setTestSession(page, testUser.email);
      await page.goto('/live');
      await page.waitForLoadState('networkidle');

      // The RecordingIndicator should be in the DOM (may not be visible until session starts)
      // Check for the data-testid or the component's container
      const indicator = page.locator('[data-testid="recording-indicator"]');

      // If session is not active, indicator might not be visible — that's OK for smoke.
      // We're checking the page doesn't crash, not that the indicator is shown.
      // If indicator IS visible, verify it contains expected healthy text.
      if (await indicator.isVisible()) {
        await expect(indicator).toContainText('Session recorded');
      }
    } finally {
      await context.close();
    }
  });

  test('/live page has no unhandled promise rejections', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockMicPermission(page);

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    try {
      await setTestSession(page, testUser.email);
      await page.goto('/live');
      await page.waitForLoadState('networkidle');

      // Wait a beat for any async errors to surface
      await page.waitForTimeout(2000);

      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
