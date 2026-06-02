/**
 * @file p857-agreement-certificate.spec.ts
 * @description P857 E2E: agreement certificate version-aware rendering on /partner-template.
 *
 * Smoke (first test, mandatory per tests.md): page loads, no console errors,
 * certificate oath section is visible.
 *
 * Stage A: the certificate renders the legacy bilateral oath text.
 * Stage B: after CURRENT_AGREEMENT_VERSION flips to 4, the rendered text
 *   changes to the v4 first-person oath. Update the assertion in
 *   "renders current version oath text" at that point.
 */

import { test, expect } from '@playwright/test';

test.describe('P857: agreement certificate versioning — /partner-template', () => {

  // ── SMOKE — first test block (required by tests.md) ──────────────────────
  test('smoke: /partner-template loads with no console errors and certificate is visible', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (
        msg.type() === 'error' &&
        // ResizeObserver errors are a known browser/JSDOM artifact — filter them
        !msg.text().includes('ResizeObserver')
      ) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/partner-template');
    await page.waitForLoadState('networkidle');

    // Certificate landmark must be present
    const certificate = page.locator('[aria-label="Agreement certificate"]');
    await expect(certificate).toBeVisible();

    // The oath section heading must be visible (YOUR RIGHT is always present
    // in both legacy and v4 — safe to assert regardless of current version)
    await expect(page.getByText('Your Right', { exact: false })).toBeVisible();

    expect(consoleErrors, `Console errors on /partner-template: ${consoleErrors.join('; ')}`).toHaveLength(0);
  });

  // ── OATH TEXT — renders the current version ───────────────────────────────
  // Stage B: CURRENT_AGREEMENT_VERSION === 4 → v4 first-person number-first oath.
  // (Rollback: if the pointer is flipped back to 'legacy', restore the bilateral
  // assertions from git history — the legacy strings live in AGREEMENT_VERSIONS.)
  test('renders current version oath text (Stage B = v4 number-first)', async ({ page }) => {
    await page.goto('/partner-template');
    await page.waitForLoadState('networkidle');

    const certificate = page.locator('[aria-label="Agreement certificate"]');

    // YOUR RIGHT — v4 first-person text
    await expect(
      certificate.getByText(
        'When we speak, please feel free to ask how well I assume I cognitively understand the intention behind what you say.'
      )
    ).toBeVisible();

    // MY PROMISE — v4 number-first text (apostrophe-agnostic `.` for robustness)
    await expect(
      certificate.getByText(/I.ll give you an honest number/)
    ).toBeVisible();
    await expect(
      certificate.getByText(/the lower of our two numbers/)
    ).toBeVisible();

    // THE EXCEPTION — v4 text (apostrophe-agnostic `.`)
    await expect(
      certificate.getByText(/If I can.t give you an honest number in the moment/)
    ).toBeVisible();
  });

  // ── PROMISE HEADING LABEL reflects the version ───────────────────────────
  // Stage B: heading is "My Promise" (v4 first-person label).
  test('promise section heading matches current version (Stage B = My Promise)', async ({ page }) => {
    await page.goto('/partner-template');
    await page.waitForLoadState('networkidle');

    const certificate = page.locator('[aria-label="Agreement certificate"]');
    // Stage B: expect "My Promise"
    await expect(certificate.getByText('My Promise', { exact: false })).toBeVisible();
    // Stage B: "Our Promise" must NOT appear
    await expect(certificate.getByText('Our Promise', { exact: false })).not.toBeVisible();
  });
});
