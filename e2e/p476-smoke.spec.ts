/**
 * @file p476-smoke.spec.ts
 * @description Smoke tests for P476: Accept Page — Full-Screen Email Confirmation After Magic Link
 *
 * Fast gate: verifies the accept page and new confirmation page/route load without
 * JS crashes. Runs before the full E2E suite to catch render errors quickly.
 *
 * Smoke gate passes if:
 *   - The accept page navigates without 5xx errors for an unauthenticated user
 *   - No uncaught JS errors on accept page load
 *   - The /sign-pledge/confirm page (PledgeConfirmationPage) still loads unchanged
 *   - The new AgreementEmailConfirmation page/route (if a dedicated route exists) loads cleanly
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement, type TestAgreement } from './helpers/test-agreement';

const IGNORE_ERRORS = /supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]|ResizeObserver loop|favicon/i;

test.describe('P476 Smoke Tests', () => {
  test.setTimeout(30000);

  let creator: TestUser;
  let pendingAgreement: TestAgreement;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P476 Smoke Creator' });
    pendingAgreement = await createTestAgreement(creator.user.id, 'p476-smoke-partner@example-test.com', {
      status: 'pending',
      visibility: 'private',
    });
  });

  test.afterAll(async () => {
    if (pendingAgreement?.id) await deleteTestAgreement(pendingAgreement.id);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  // ── 1. Accept page loads without JS errors (unauthenticated) ──────────────

  test('accept-agreement-page loads without JS errors for unauthenticated user', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !IGNORE_ERRORS.test(msg.text())) {
        jsErrors.push(msg.text());
      }
    });

    // Unauthenticated — no setTestSession
    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    expect(
      jsErrors,
      `JS errors on unauthenticated accept page: ${jsErrors.join('\n')}`
    ).toHaveLength(0);
  });

  // ── 2. Accept page renders key content ────────────────────────────────────

  test('accept-agreement-page renders the certificate and CTA (unauthenticated state)', async ({ page }) => {
    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    // Certificate content should be visible
    await expect(page.getByText(/We all crave being understood/i)).toBeVisible({ timeout: 10000 });

    // Unauthenticated CTA should be present
    await expect(
      page.getByRole('button', { name: /seal.*create account/i })
    ).toBeVisible({ timeout: 5000 });
  });

  // ── 3. /sign-pledge/confirm page still loads unchanged ────────────────────

  test('/sign-pledge/confirm (PledgeConfirmationPage) still loads without errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !IGNORE_ERRORS.test(msg.text())) {
        jsErrors.push(msg.text());
      }
    });

    // Without an email param, PledgeConfirmationPage redirects to /sign-pledge
    // With an email param it renders the confirmation UI
    await page.goto('/sign-pledge/confirm?email=test%40example.com');
    await page.waitForLoadState('networkidle');

    expect(
      jsErrors,
      `JS errors on /sign-pledge/confirm: ${jsErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('/sign-pledge/confirm with email param renders confirmation content', async ({ page }) => {
    await page.goto('/sign-pledge/confirm?email=test%40example.com');
    await page.waitForLoadState('networkidle');

    // PledgeConfirmationPage should render — not be blank
    await expect(page.locator('body')).not.toBeEmpty();

    // The "Almost Done!" heading is the main h1 on PledgeConfirmationPage
    await expect(page.getByText(/almost done/i)).toBeVisible({ timeout: 5000 });
  });

  // ── 4. Invalid token shows error state — not a blank crash ────────────────

  test('accept page with invalid token shows error state — not a blank crash', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto('/agreements/00000000-0000-0000-0000-000000000000/accept?token=invalid-token');
    await page.waitForLoadState('networkidle');

    expect(
      jsErrors,
      `JS crashes on invalid accept URL: ${jsErrors.join('\n')}`
    ).toHaveLength(0);

    // Should render an error/invalid state message — not be blank
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
