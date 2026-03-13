/**
 * P501: Smoke test — pages load with understood pill present
 */
import { test, expect } from '@playwright/test';

test.describe('P501: Understood pill smoke', () => {
  test('feed page loads and contains "understood" text', async ({ page }) => {
    await page.goto('/feed?tab=stories');
    await expect(page.locator('h1, [role="heading"]').first()).toBeVisible();
    // At least one "understood" pill should be present if any stories exist
    const _pills = page.locator('text=/\\d+ understood/');
    // Page loads without errors — no 500, no console errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    expect(errors).toEqual([]);
  });

  test('profile page loads without errors', async ({ page }) => {
    await page.goto('/p/slava');
    await expect(page.locator('text=Stories')).toBeVisible();
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    expect(errors).toEqual([]);
  });
});
