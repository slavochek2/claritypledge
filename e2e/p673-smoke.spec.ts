/**
 * @file p673-smoke.spec.ts
 * @description P673: Smoke tests — route health and regression guards.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';

test.describe('P673: Smoke tests', () => {
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P673 Smoke' });
  });

  test.afterAll(async () => {
    await deleteTestUser(user.user.id);
  });

  test('letter reading route loads without console errors', async ({ page: _page }) => {
    // TODO: Create test letter, navigate to /letter/:id
    // Assert: no console errors
    // Assert: cover or reading content renders
  });

  test('letter preview route loads without console errors', async ({ page }) => {
    await setTestSession(page, user.email);
    // TODO: Create test doc, navigate to /letter/:docId/preview
    // Assert: preview banner visible ("THIS IS A PREVIEW")
    // Assert: no console errors
  });

  test('non-letter routes still have top navigation (regression guard)', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/');
    // chromeFree must NOT leak to non-letter routes
    await expect(page.locator('nav').first()).toBeVisible();
  });

  test('/letters route still has navigation (not chrome-free)', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    // Letters list page should have nav — only reading/preview/results are chrome-free
    await expect(page.locator('nav').first()).toBeVisible();
  });
});
