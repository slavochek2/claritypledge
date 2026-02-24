/**
 * @file p426-smoke.spec.ts
 * @description Smoke tests for P426: Story "Show more" toggle
 *
 * Verifies that /live and profile pages load without JS errors after the
 * toggle changes are applied. No auth required for the profile feed page.
 */

import { test, expect } from '@playwright/test';

test.describe('P426 Smoke — Pages load without errors', () => {
  test('/live page loads without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors on /live: ${consoleErrors.join(', ')}`).toHaveLength(0);
    await expect(page.locator('body')).toBeVisible();
  });

  test('/feed page (profile story cards) loads without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors on /feed: ${consoleErrors.join(', ')}`).toHaveLength(0);
    await expect(page.locator('body')).toBeVisible();
  });
});
