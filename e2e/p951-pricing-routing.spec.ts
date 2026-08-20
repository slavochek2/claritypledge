/**
 * @file p951-pricing-routing.spec.ts
 * Routing + offer-surface regression coverage for /program.
 *
 * Originally P951 (Standard/Premium/Free grid); rewritten under P1087, which retires those
 * tiers (spec: "Supersedes... those specs are not wrong; the offer they encode was
 * retired") for a three-card ladder built on the self-serve Clarity Champions membership:
 * Champions €295/month (the one selected card) · Partnership Clarity Package €1,450 ·
 * unpriced Custom Offers. Guards the same three seams, updated content:
 *   1. /program loads cleanly and shows the three-card ladder.
 *   2. /pricing and /offers both redirect to /program (preserves previously shared links).
 *   3. The landing ("/") still renders no pricing cards — its job is the alignment-audit
 *      CTA, unrelated to this offer. A silent regression here would re-add pricing there.
 */

import { test, expect } from '@playwright/test';

test('smoke: /program loads with the three-card offer ladder and no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/program');
  await page.waitForLoadState('networkidle');

  expect(consoleErrors, `Console errors on /program: ${consoleErrors.join(', ')}`).toHaveLength(0);
  // "Clarity Champions" legitimately appears in two headings — the page lead and the
  // offer card — so target the exact offer-card heading, not a substring match.
  await expect(page.getByRole('heading', { name: 'Clarity Champions', exact: true })).toBeVisible();
  await expect(page.getByText('€295').first()).toBeVisible();
  // The other two rungs of the ladder, restored at founder UAT.
  await expect(page.getByRole('heading', { name: 'Partnership Clarity Package' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Custom Offers' })).toBeVisible();
  // The membership CTA must be the live Stripe checkout, not the fail-loud state.
  await expect(page.getByRole('link', { name: /Start at €295\/month/ })).toHaveAttribute(
    'href',
    /^https:\/\/buy\.stripe\.com\//
  );
  await expect(page.getByText('Checkout temporarily unavailable')).toHaveCount(0);
  // The retired P951 tier names must not be reachable from here.
  await expect(page.getByRole('heading', { name: 'Standard Program' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Premium Program' })).toHaveCount(0);
});

test('/pricing redirects to /program', async ({ page }) => {
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveURL(/\/program$/);
  // "Clarity Champions" legitimately appears in two headings — the page lead and the
  // offer card — so target the exact offer-card heading, not a substring match.
  await expect(page.getByRole('heading', { name: 'Clarity Champions', exact: true })).toBeVisible();
});

test('/offers redirects to /program', async ({ page }) => {
  await page.goto('/offers');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveURL(/\/program$/);
  // "Clarity Champions" legitimately appears in two headings — the page lead and the
  // offer card — so target the exact offer-card heading, not a substring match.
  await expect(page.getByRole('heading', { name: 'Clarity Champions', exact: true })).toBeVisible();
});

test('landing ("/") still renders no pricing cards', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { name: 'Clarity Champions' })).toHaveCount(0);
  await expect(page.getByText('€295')).toHaveCount(0);
});

test('the Custom Offers CTA opens /intro', async ({ page }) => {
  await page.goto('/program');
  await page.waitForLoadState('networkidle');

  await page.getByRole('link', { name: 'Book 15 minutes' }).click();
  await expect(page).toHaveURL(/\/intro/);
});
