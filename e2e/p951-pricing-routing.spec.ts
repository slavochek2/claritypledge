/**
 * @file p951-pricing-routing.spec.ts
 * Routing + offer-surface regression coverage for /program.
 *
 * Originally P951 (Standard/Premium/Free grid); rewritten under P1087, which retires those
 * tiers (spec: "Supersedes... those specs are not wrong; the offer they encode was
 * retired") for a three-card ladder built on the self-serve Clarity Champions membership:
 * Clarity Champions Program €295/month (the one selected card) · Partnership Clarity
 * Package €1,450 · unpriced Coaching, Training & Consulting. Guards the same three seams:
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
  // "Clarity Champions Program" is the ONE name the program carries — page lead, offer
  // card, assurance band and SEO title all say it (founder UAT). Target the offer-card
  // heading exactly — the offer card and the program section below it share the name.
  await expect(page.getByRole('heading', { name: 'Clarity Champions Program', exact: true }).first()).toBeVisible();
  await expect(page.getByText('€295').first()).toBeVisible();
  // The other two rungs of the ladder, restored at founder UAT.
  await expect(page.getByRole('heading', { name: 'Partnership Clarity Package' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Coaching, Training & Consulting' })).toBeVisible();
  // UAT round 3: the explanatory subhead was cut, and the page order reversed so the grid
  // comes FIRST and the program detail follows it. The month arc now runs past month three.
  await expect(page.getByText(/Clarity Champions is the program above/i)).toHaveCount(0);
  await expect(page.getByText(/your first three months/i)).toHaveCount(0);
  await expect(page.getByText('Month 4 and beyond')).toBeVisible();
  // One label for the section: "Offers" was retired with the third card's old name.
  await expect(page.getByText('Custom Offers')).toHaveCount(0);
  // The membership CTA must be the live Stripe checkout, not the fail-loud state. It appears
  // TWICE now — in the grid and as the page's closing action on Champions alone.
  const buy = page.getByRole('link', { name: /Start at €295\/month/ });
  await expect(buy).toHaveCount(2);
  for (const link of await buy.all()) {
    await expect(link).toHaveAttribute('href', /^https:\/\/buy\.stripe\.com\//);
  }
  await expect(page.getByText('Checkout temporarily unavailable')).toHaveCount(0);
  // The retired P951 tier names must not be reachable from here.
  await expect(page.getByRole('heading', { name: 'Standard Program' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Premium Program' })).toHaveCount(0);
});

test('/pricing redirects to /program', async ({ page }) => {
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveURL(/\/program$/);
  // "Clarity Champions Program" is the ONE name the program carries — page lead, offer
  // card, assurance band and SEO title all say it (founder UAT). Target the offer-card
  // heading exactly — the offer card and the program section below it share the name.
  await expect(page.getByRole('heading', { name: 'Clarity Champions Program', exact: true }).first()).toBeVisible();
});

test('/offers redirects to /program', async ({ page }) => {
  await page.goto('/offers');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveURL(/\/program$/);
  // "Clarity Champions Program" is the ONE name the program carries — page lead, offer
  // card, assurance band and SEO title all say it (founder UAT). Target the offer-card
  // heading exactly — the offer card and the program section below it share the name.
  await expect(page.getByRole('heading', { name: 'Clarity Champions Program', exact: true }).first()).toBeVisible();
});

test('landing ("/") still renders no pricing cards', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { name: /Clarity Champions/ })).toHaveCount(0);
  await expect(page.getByText('€295')).toHaveCount(0);
});

test('both talk-first CTAs open /intro', async ({ page }) => {
  await page.goto('/program');
  await page.waitForLoadState('networkidle');

  // Two rungs now share the label (founder UAT), so .first() is required — a bare
  // getByRole would throw on the strict-mode violation rather than click either one.
  const talkFirst = page.getByRole('link', { name: 'Book 15 minutes' });
  await expect(talkFirst).toHaveCount(2);
  await talkFirst.first().click();
  await expect(page).toHaveURL(/\/intro/);
});
