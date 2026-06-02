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
  // Stage A: CURRENT_AGREEMENT_VERSION === 'legacy' → bilateral text renders.
  // Stage B: flip CURRENT_AGREEMENT_VERSION to 4, then:
  //   - replace the legacy text assertion with the v4 text below:
  //       "When we speak, please feel free to ask how well I assume I cognitively understand the intention behind what you say."
  //   - replace the OUR PROMISE assertion with:
  //       page.getByText(/I'll give you an honest number/)
  test('renders current version oath text (Stage A = legacy bilateral)', async ({ page }) => {
    await page.goto('/partner-template');
    await page.waitForLoadState('networkidle');

    const certificate = page.locator('[aria-label="Agreement certificate"]');

    // YOUR RIGHT — legacy bilateral text (Stage A)
    await expect(
      certificate.getByText(
        'When we speak, if either of us needs to know the other truly understood them, we can ask to have it mirrored back.'
      )
    ).toBeVisible();

    // OUR PROMISE — legacy bilateral text (Stage A)
    await expect(
      certificate.getByText(/We will explain back what we think the other meant/)
    ).toBeVisible();

    // THE EXCEPTION — legacy bilateral text (Stage A)
    // Apostrophe-agnostic (`.`): the registry renders a typographic U+2019 (’),
    // mandated by the spec and asserted curly by the unit tests.
    await expect(
      certificate.getByText(/If either of us can.t keep this promise in the moment/)
    ).toBeVisible();
  });

  // ── PROMISE HEADING LABEL reflects the version ───────────────────────────
  // Stage A: heading is "Our Promise" (legacy bilateral label).
  // Stage B: heading changes to "My Promise" (v4 first-person label).
  test('promise section heading matches current version (Stage A = Our Promise)', async ({ page }) => {
    await page.goto('/partner-template');
    await page.waitForLoadState('networkidle');

    const certificate = page.locator('[aria-label="Agreement certificate"]');
    // Stage A: expect "Our Promise"
    await expect(certificate.getByText('Our Promise', { exact: false })).toBeVisible();
    // Stage A: "My Promise" must NOT appear
    await expect(certificate.getByText('My Promise', { exact: false })).not.toBeVisible();
  });
});
