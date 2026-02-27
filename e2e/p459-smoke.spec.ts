/**
 * @file p459-smoke.spec.ts
 * @description Smoke tests for P459: Agreements to Connections page relocation.
 *
 * Fast gate confirming that the two new surfaces render without JS crashes:
 *
 *   1. Profile page loads — agreements section no longer crashes the content area
 *   2. /p/:slug/connections route responds (not 404, no JS errors)
 *   3. Metadata line present for a profile with agreements
 *
 * Tests run authenticated (owner) so the metadata line renders.
 * Console error filter suppresses known non-critical patterns (Supabase realtime,
 * Vite HMR) that fire in test environments.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement, type TestAgreement } from './helpers/test-agreement';

// ─── Known non-critical error patterns ────────────────────────────────────────

const SUPPRESSED_ERROR_PATTERNS = [
  /supabase.*realtime/i,
  /WebSocket.*failed/i,
  /net::ERR_/i,
  /\[vite\]/i,
];

function isKnownNonCritical(msg: string): boolean {
  return SUPPRESSED_ERROR_PATTERNS.some(p => p.test(msg));
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let owner: TestUser;
let partnerUser: TestUser;
let agreement: TestAgreement;

test.beforeAll(async () => {
  owner = await createTestUser({ name: 'P459Smoke' });
  partnerUser = await createTestUser({ name: 'P459SmokePartner' });

  agreement = await createTestAgreement(
    owner.user.id,
    partnerUser.email,
    {
      partnerProfileId: partnerUser.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    }
  );
});

test.afterAll(async () => {
  if (agreement?.id) await deleteTestAgreement(agreement.id);
  if (owner?.user?.id) await deleteTestUser(owner.user.id);
  if (partnerUser?.user?.id) await deleteTestUser(partnerUser.user.id);
});

// ─── Smoke tests ─────────────────────────────────────────────────────────────

test.describe('P459 Smoke — pages load without JS errors after implementation', () => {
  test.describe.configure({ timeout: 60000 });

  test('profile page loads without console errors (agreements section removed from content area)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Profile must render the owner's name
    await expect(page.getByText(owner.name)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on /p/${owner.slug}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('/p/:slug/connections route loads without 404 or console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // Must not land on 404 page
    await expect(page).not.toHaveURL(/404/);

    // Must render at minimum a heading — page is not blank
    const heading = page.getByRole('heading');
    await expect(heading.first()).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on /p/${owner.slug}/connections: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('metadata line appears in profile header for owner with at least one agreement', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // The compact metadata line must appear — "✦ N Clarity Partners →" or similar
    // Matches any text containing "Clarity Partner" or a link to /connections
    const metadataLine = page.locator('text=/Clarity Partner/i')
      .or(page.locator(`a[href="/p/${owner.slug}/connections"]`));

    await expect(metadataLine.first()).toBeVisible({ timeout: 10000 });
  });

  test('profile page does NOT render old ProfileAgreementsSection in content area', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // The old component rendered: <section aria-label="Partner Agreements">
    // It must NOT appear in the content area after P459
    const oldSection = page.locator('section[aria-label="Partner Agreements"]');
    await expect(oldSection).not.toBeVisible({ timeout: 5000 });
  });

  test('connections page loads for anonymous visitor without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // No setTestSession — anonymous browse
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // Anonymous users may see public agreements or empty state — either is fine
    // What must not happen: JS crash or unhandled error
    expect(
      consoleErrors,
      `Console errors for anonymous visitor on /p/${owner.slug}/connections: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('connections page loads for visitor (not owner) without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, partnerUser.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/404/);

    expect(
      consoleErrors,
      `Console errors for visitor on /p/${owner.slug}/connections: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });
});
