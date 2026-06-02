/**
 * @file p508-partner-template.spec.ts
 * @description E2E tests for P508: Public Partner Agreement Template Page
 *
 * Covers:
 *   - Page loads without auth
 *   - Certificate renders with mock data (Albert Einstein & Mother Teresa)
 *   - Pledge sections visible (Your Right, My Promise, The Exception)
 *   - Terms section shows human-readable text
 *   - CTA links point to correct routes
 *   - No "Creator"/"Partner" role labels on signatures
 */

import { test, expect } from '@playwright/test';

test.describe('P508: Partner Template Page', () => {
  test.beforeEach(async ({ page }) => {
    // No auth — page is public
    await page.goto('/partner-template');
  });

  test('page loads without authentication', async ({ page }) => {
    // Should not redirect to /login
    await expect(page).toHaveURL(/\/partner-template/);
    // Certificate heading visible (target the cert h2 exactly — the hero h1
    // "What does a Clarity Partner Agreement look like?" also contains the phrase)
    await expect(
      page.getByRole('heading', { name: 'Clarity Partner Agreement', exact: true })
    ).toBeVisible();
  });

  test('certificate shows mock partner names', async ({ page }) => {
    await expect(page.getByText(/We,\s+Albert Einstein\s+and\s+Mother Teresa,\s+agree to:/)).toBeVisible();
  });

  test('pledge sections are visible', async ({ page }) => {
    await expect(page.getByText('Your Right')).toBeVisible();
    await expect(page.getByText('My Promise')).toBeVisible();
    await expect(page.getByText('The Exception')).toBeVisible();
  });

  test('terms section shows human-readable example text', async ({ page }) => {
    // Key phrases from the friendly terms
    await expect(page.getByText(/work conversations/i)).toBeVisible();
    await expect(page.getByText(/one session per month/i)).toBeVisible();
    await expect(page.getByText(/at least 15 minutes/i)).toBeVisible();
  });

  test('template hint is visible', async ({ page }) => {
    await expect(page.getByText(/takes 1 minute to create/i)).toBeVisible();
  });

  test('CTA links to agreement creation', async ({ page }) => {
    const ctaLink = page.getByRole('link', { name: /create your agreement/i });
    await expect(ctaLink).toBeVisible();
    await expect(ctaLink).toHaveAttribute('href', /\/agreements\/new\/create/);
  });

  test('sign in link points to login', async ({ page }) => {
    const signInLink = page.getByRole('link', { name: /sign in/i });
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute('href', /\/login/);
  });

  test('no Creator/Partner role labels on signature slots', async ({ page }) => {
    // The active variant hides labels — verify they're not in the DOM
    const certificate = page.locator('[aria-label="Agreement certificate"]');
    await expect(certificate).toBeVisible();

    // These uppercase role labels should NOT appear
    await expect(certificate.getByText('CREATOR', { exact: true })).not.toBeVisible();
    await expect(certificate.getByText('PARTNER', { exact: true })).not.toBeVisible();
  });
});
