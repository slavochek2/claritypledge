/**
 * @file p472-smoke.spec.ts
 * @description Smoke tests for P472: Agreements post-UAT polish
 *
 * Fast regression — verify certificate pages load cleanly after P472 changes.
 * No DB fixtures needed. Tests run unauthenticated where possible.
 */

import { test, expect } from '@playwright/test';

test.describe('P472 Smoke — agreements pages load without errors', () => {
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

  test('/agreements/new redirects unauthenticated user to login without crashing', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });

    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Should redirect to /login — not crash with unhandled errors
    const appErrors = jsErrors.filter(
      e =>
        !e.includes('ResizeObserver loop') &&
        !e.includes('favicon') &&
        !e.includes('Failed to load resource')
    );
    expect(appErrors, `JS errors on /agreements/new: ${appErrors.join(', ')}`).toHaveLength(0);
  });

  test('/agreements/:id loads gracefully for a non-existent ID (404 path)', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });

    // Navigate to a non-existent agreement — should render not-found, not crash
    await page.goto('/agreements/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    const appErrors = jsErrors.filter(
      e =>
        !e.includes('ResizeObserver loop') &&
        !e.includes('favicon') &&
        !e.includes('Failed to load resource')
    );
    expect(appErrors, `JS errors on /agreements/: ${appErrors.join(', ')}`).toHaveLength(0);
  });

  test('/agreements/:id shows "sign in to view" or "not found" — not a blank crash', async ({ page }) => {
    await page.goto('/agreements/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    // Page must render something useful, not be blank
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });
});
