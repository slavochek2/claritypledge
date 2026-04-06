/**
 * @file p660-smoke.spec.ts
 * @description Smoke tests for P660: Letters Navigation Architecture
 *
 * Fast regression: /letters page loads, all three tabs render, no console errors.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';

test.describe('P660 Smoke — Letters Page', () => {
  test.describe.configure({ timeout: 30000 });

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P660 Smoke User' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('/letters page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Page should load — check for tab bar presence
    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible({ timeout: 10000 });

    // Filter out known benign errors (ResizeObserver)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('third-party')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('all three tabs render', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Drafts tab
    const draftsTab = page.getByRole('tab', { name: /Drafts/i });
    await expect(draftsTab).toBeVisible();

    // Sent tab
    const sentTab = page.getByRole('tab', { name: /Sent/i });
    await expect(sentTab).toBeVisible();

    // Inbox tab
    const inboxTab = page.getByRole('tab', { name: /Inbox/i });
    await expect(inboxTab).toBeVisible();
  });

  test('each tab panel is interactive', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Click each tab and verify panel appears
    for (const tabName of ['Drafts', 'Sent', 'Inbox']) {
      const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') });
      await tab.click();

      const panel = page.getByRole('tabpanel');
      await expect(panel).toBeVisible();
    }
  });

  test('letters page requires authentication', async ({ page }) => {
    // Navigate without setting a session
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Should redirect to login or show auth gate
    // The exact behavior depends on the auth gate implementation
    const url = page.url();
    const isRedirectedOrGated =
      url.includes('/login') ||
      url.includes('/signup') ||
      url.includes('/auth') ||
      !(await page.getByRole('tablist').isVisible().catch(() => false));

    expect(isRedirectedOrGated).toBe(true);
  });
});
