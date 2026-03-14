/**
 * @file public-pages-smoke.spec.ts
 * Smoke tests for static/public pages — verifies they load without JS crashes.
 *
 * Pattern: navigate → check no console errors → check body has content.
 * These tests run anonymously (no auth) and are very fast.
 */

import { test, expect } from '@playwright/test';

const PUBLIC_PAGES = [
  { path: '/about', label: 'About' },
  { path: '/privacy-policy', label: 'Privacy Policy' },
  { path: '/terms-of-service', label: 'Terms of Service' },
  { path: '/feed', label: 'Feed' },
  { path: '/demo', label: 'Demo' },
  { path: '/pledgers', label: 'Pledgers' },
  { path: '/partner-template', label: 'Partner Template' },
] as const;

for (const { path, label } of PUBLIC_PAGES) {
  test(`${label} page loads without JS errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(path);
    await page.waitForLoadState('networkidle');

    // No console errors
    expect(consoleErrors, `Console errors on ${path}: ${consoleErrors.join(', ')}`).toHaveLength(0);
    // Page has content
    await expect(page.locator('body')).toBeVisible();
    // Not a blank page
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, `${label} page appears blank`).toBeGreaterThan(0);
  });
}
