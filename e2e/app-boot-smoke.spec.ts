/**
 * @file app-boot-smoke.spec.ts
 * Smoke test: does the app boot without a React crash?
 *
 * Catches the recurring "Invalid hook call" / error boundary crash that
 * unit tests (Vitest/JSDOM) cannot detect. Run after code changes to
 * confirm the app actually renders in a real browser.
 *
 * Usage:
 *   npm run smoke              # quick boot check (~5s)
 *   npx playwright test e2e/app-boot-smoke.spec.ts
 */

import { test, expect } from '@playwright/test';

test.describe('App Boot Smoke', () => {
  test('home page loads without error boundary', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Error boundary should NOT be visible
    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    // App navigation should render — data-nav="main" is on SimpleNavigation, which renders it unconditionally (no auth/null branch)
    await expect(page.locator('[data-nav="main"]')).toBeVisible();

    // No fatal React errors in console
    const fatalErrors = consoleErrors.filter(e =>
      e.includes('Invalid hook call') ||
      e.includes('Cannot read properties of null') ||
      e.includes('Minified React error')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('feed page loads without error boundary', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('/live page loads without error boundary (TDZ guard)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    // Error boundary should NOT be visible — catches TDZ and hook-order crashes
    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    // No TDZ or fatal React errors in console
    const tdzErrors = consoleErrors.filter(e =>
      e.includes('before initialization') ||
      e.includes('Minified React error')
    );
    expect(tdzErrors).toHaveLength(0);
  });
});
