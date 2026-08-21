/**
 * @file p951-pricing-routing.spec.ts
 * Routing + offer-surface regression coverage for /pricing.
 *
 * Originally P951 (Standard/Premium/Free grid); rewritten under P1087, which retires those
 * tiers (spec: "Supersedes... those specs are not wrong; the offer they encode was
 * retired") for a three-card ladder built on the self-serve Clarity Champions membership:
 * Clarity Champions Program €295/month (the one selected card) · Partnership Clarity
 * Package €1,450 · unpriced Coaching, Training & Consulting. Guards the same three seams:
 *   1. /pricing loads cleanly and shows the three-card ladder.
 *   2. /program and /offers both redirect to /pricing (P1087 round 5 flipped the canonical
 *      URL from /program to /pricing; both old paths must keep resolving).
 *   3. The landing ("/") still renders no pricing cards — its job is the alignment-audit
 *      CTA, unrelated to this offer. A silent regression here would re-add pricing there.
 */

import { test, expect } from '@playwright/test';

test('smoke: /pricing loads with the three-card offer ladder and no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  expect(consoleErrors, `Console errors on /pricing: ${consoleErrors.join(', ')}`).toHaveLength(0);
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
  // UAT round 5: the batch countdown sits with the "weekly live session / batch of 3–10"
  // facts, above the month arc; the closing CTA has its own heading so the buy button has
  // a subject. The countdown moved three times across UAT — this pins where it landed.
  const countdownY = (await page.getByRole('timer').boundingBox())!.y;
  const arcY = (await page.getByText('Month 1').boundingBox())!.y;
  expect(countdownY).toBeLessThan(arcY);
  await expect(page.getByRole('heading', { name: 'Join the Clarity Champions Program' })).toBeVisible();
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

test('/program redirects to /pricing', async ({ page }) => {
  await page.goto('/program');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveURL(/\/pricing$/);
  // "Clarity Champions Program" is the ONE name the program carries — page lead, offer
  // card, assurance band and SEO title all say it (founder UAT). Target the offer-card
  // heading exactly — the offer card and the program section below it share the name.
  await expect(page.getByRole('heading', { name: 'Clarity Champions Program', exact: true }).first()).toBeVisible();
});

test('/offers redirects to /pricing', async ({ page }) => {
  await page.goto('/offers');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveURL(/\/pricing$/);
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

test('the ONLY talk-first CTA is the unpriced rung, and it opens /intro', async ({ page }) => {
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  // P1087 round 5: the €1,450 Partnership package now buys directly on Stripe, so the
  // 15-minute call survives on exactly ONE rung — the unpriced one, where the call exists
  // to scope work that cannot be priced without it. A second "Book 15 minutes" appearing
  // here means a fixed-price offer has silently regained a call gate in front of it.
  const talkFirst = page.getByRole('link', { name: 'Book 15 minutes' });
  await expect(talkFirst).toHaveCount(1);

  // ...and the Partnership rung checks out on Stripe instead.
  const partnershipBuy = page.getByRole('link', { name: /Buy for €1,450/ });
  await expect(partnershipBuy).toHaveAttribute('href', /^https:\/\/buy\.stripe\.com\//);

  await talkFirst.click();
  await expect(page).toHaveURL(/\/intro/);
});

test('the nav collapses the audience landings under "Use cases" and lists ALL of them', async ({ page }) => {
  await page.goto('/coach');
  await page.waitForLoadState('networkidle');

  // P1087: the four landings used to sit flat in the header AND self-filter, so the page
  // you were on was the one entry missing. Opening the menu FROM /coach must still list
  // /coach — that absence is the defect this guards.
  await page.getByRole('button', { name: /Use cases/i }).click();
  await expect(page.getByRole('menuitem', { name: 'For coaches' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'For builders' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'For co-founders' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'For hiring' })).toBeVisible();
});

test('the nav CTA is hidden on /pricing so it does not undercut the paid action', async ({ page }) => {
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  // A free-call CTA in the header directly above a page selling €295/month competes with
  // the thing the page exists to sell (same reasoning as P844 on event detail pages).
  await expect(page.getByRole('link', { name: /Book a free alignment audit/i })).toHaveCount(0);

  // MOBILE too — a desktop-only assertion passed here while the mobile sandwich still
  // rendered the CTA as its FIRST item, which is exactly where it does the most damage.
  // Caught by a screenshot, not by this test, until this line was added.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /menu/i }).first().click();
  await expect(page.locator('#mobile-navigation-menu')).toBeVisible();
  await expect(page.getByRole('link', { name: /Book a free alignment audit/i })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });

  // Control: it IS present on a page that is not selling anything, so this test fails if
  // the CTA disappears globally rather than just here.
  await page.goto('/manifesto');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: /Book a free alignment audit/i }).first()).toBeVisible();
});

test('the mobile menu renders every public link under a labelled group, Use cases first', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /menu/i }).first().click();
  const menu = page.locator('#mobile-navigation-menu');
  await expect(menu).toBeVisible();

  // P1087 round 6: the founder's read of the flat list was "it's a bit of chaos". Every
  // group carries a label now — labelling only "Use cases" made the rest read as
  // leftovers. Order is asserted because the desktop dropdown renders the SAME structure:
  // if these ever diverge again, one of the two menus is wrong and nothing else would say so.
  const labels = await menu.locator('div.uppercase.tracking-wider').allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(['Use cases', 'Product', 'Learn']);

  // The Partnership template link must reach the real artifact, not 404.
  await page.goto('/partner-template');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/partner-template$/);
});

test('the FAQ block renders all five questions and opens', async ({ page }) => {
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');

  // The FAQ had no coverage of any kind — not even that it renders (adversarial review).
  // The unit tests bind its CLAIMS to the page's; this binds the render path, which the
  // unit tests cannot reach: the accordion is composed at the page, not in OffersSection.
  const questions = page.getByRole('button', { name: /\?$/ });
  await expect(questions).toHaveCount(5);

  await page.getByRole('button', { name: "What if the first two sessions aren't for me?" }).click();
  await expect(page.getByText(/Full refund of month one/i)).toBeVisible();
});
