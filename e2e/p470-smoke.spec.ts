/**
 * @file p470-smoke.spec.ts
 * @description Smoke tests for P470: Point card footer — attribution consistency
 *
 * Fast checks that key pages load cleanly after P470 changes.
 * No DB fixtures needed.
 */

import { test, expect } from '@playwright/test';

test.describe('P470 Smoke — pages load without errors', () => {
  test.setTimeout(20000);

  test('app root loads without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

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

  test('/point/:id loads without JS errors (uses a public known point or 404 gracefully)', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });

    // Navigate to a non-existent point — should render 404 gracefully, not crash
    await page.goto('/point/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    // The page must either show "Point not found" or redirect — not crash with unhandled errors
    const appErrors = jsErrors.filter(
      e =>
        !e.includes('ResizeObserver loop') &&
        !e.includes('favicon') &&
        !e.includes('Failed to load resource') // expected 404 API call
    );
    expect(appErrors, `JS errors on /point/: ${appErrors.join(', ')}`).toHaveLength(0);
  });

  test('/events page loads without console errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });

    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    const appErrors = jsErrors.filter(
      e => !e.includes('ResizeObserver loop') && !e.includes('favicon')
    );
    expect(appErrors, `JS errors on /events: ${appErrors.join(', ')}`).toHaveLength(0);
  });
});
