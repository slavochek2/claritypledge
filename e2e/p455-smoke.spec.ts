/**
 * @file p455-smoke.spec.ts
 * @description Smoke test for P455: Live mobile layout regression guard
 *
 * Fast check: live page loads at mobile viewport, no console errors,
 * no layout-breaking crashes introduced by the reorder.
 */

import { test, expect } from '@playwright/test';

test('P455 smoke — live page loads at mobile viewport without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/live');

  await expect(page.locator('h1, [role="heading"]').first()).toBeVisible({ timeout: 10000 });

  const layoutErrors = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver')
  );
  expect(layoutErrors).toHaveLength(0);
});
