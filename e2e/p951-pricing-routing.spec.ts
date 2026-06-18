/**
 * @file p951-pricing-routing.spec.ts
 * P951 routing regression coverage for the /pricing surface.
 *
 * Guards the three seams the P951 restructure introduced (all anonymous, no auth):
 *   1. /pricing loads cleanly and shows the three tiers.
 *   2. /offers permanently redirects to /pricing (preserves previously shared links).
 *   3. The landing ("/") no longer renders pricing cards — P951 cut them so the landing
 *      drives the webinar only. A silent regression here would re-add the landing's lost
 *      conversion path or strip /pricing's.
 */

import { test, expect } from '@playwright/test';

test('smoke: /pricing loads with all three tiers and no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  expect(consoleErrors, `Console errors on /pricing: ${consoleErrors.join(', ')}`).toHaveLength(0);
  await expect(page.getByRole('heading', { name: 'Free Platform' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Standard Program' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Premium Program' })).toBeVisible();
  await expect(page.getByText('€2450').first()).toBeVisible();
});

test('/offers redirects to /pricing', async ({ page }) => {
  await page.goto('/offers');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole('heading', { name: 'Premium Program' })).toBeVisible();
});

test('landing ("/") no longer renders pricing cards', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // The landing renders (anonymous → program page), but the pricing tiers are gone.
  await expect(page.getByRole('heading', { name: 'Premium Program' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Standard Program' })).toHaveCount(0);
  await expect(page.getByText('€2450')).toHaveCount(0);
});
