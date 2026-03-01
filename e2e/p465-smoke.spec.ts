/**
 * @file p465-smoke.spec.ts
 * @description Smoke tests for P465: Point card footer redesign
 *
 * Fast checks that the app loads cleanly after P465 changes.
 * No DB fixtures needed.
 */

import { test, expect } from '@playwright/test';

test.describe('P465 Smoke — app loads without errors', () => {
  test.setTimeout(20000);

  test('app root loads without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter browser noise that is not app errors
    const appErrors = jsErrors.filter(
      e => !e.includes('ResizeObserver loop') && !e.includes('favicon')
    );
    expect(appErrors, `JS errors on /: ${appErrors.join(', ')}`).toHaveLength(0);
  });

  test('app shell renders (not blank page)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });
});
