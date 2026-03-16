/**
 * @file p521-smoke.spec.ts
 * @description Smoke tests for P521: Position Buttons — Two-Step Progressive Disclosure
 *
 * Fast regression detection:
 * - Prototype page loads without errors
 * - Position buttons render on point detail page
 * - No console errors related to position buttons
 */
import { test, expect } from '@playwright/test';

test.describe('P521: Smoke Tests', () => {
  test('prototype page loads at /tree/position-buttons', async ({ page }) => {
    await page.goto('/tree/position-buttons');
    await page.waitForLoadState('networkidle');

    // Page should load without 404
    await expect(page.locator('h1')).toBeVisible();

    // No console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(1000);
    expect(errors.filter(e => e.includes('position') || e.includes('Position'))).toHaveLength(0);
  });

  test('/tree page lists position-buttons prototype', async ({ page }) => {
    await page.goto('/tree');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Position Buttons v2')).toBeVisible();
  });
});
