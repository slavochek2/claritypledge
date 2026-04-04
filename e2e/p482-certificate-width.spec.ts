/**
 * @file p482-certificate-width.spec.ts
 * @description E2E tests for P482: CertificatePageShell — consistent width across certificate pages.
 *
 * Verifies that all certificate-rendering pages use the same max-width (768px / max-w-3xl).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession } from './helpers/test-user';
import type { TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';

const EXPECTED_MAX_WIDTH = 768;

test.describe('P482 — Certificate page width consistency', () => {
  let creator: TestUser;
  let agreementId: string;
  let invitationToken: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P482 Width Creator' });
    const agreement = await createTestAgreement({
      creatorId: creator.user.id,
      partnerEmail: 'p482-width-partner@test.claritypledge.com',
      partnerDisplayName: 'Width Partner',
    });
    agreementId = agreement.id;
    invitationToken = agreement.invitation_token;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    if (creator?.user?.id) await supabaseAdmin.auth.admin.deleteUser(creator.user.id);
  });

  test('agreement detail page uses max-w-3xl container', async ({ page }) => {
    await setTestSession(page, creator);
    await page.goto(`/agreements/${agreementId}`);
    await expect(page.locator('[data-testid="agreement-certificate"]').or(page.locator('text=Clarity Partner Agreement'))).toBeVisible();
    const shell = page.locator('[data-testid="certificate-page-shell"]');
    await expect(shell).toBeVisible();
    const box = await shell.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(EXPECTED_MAX_WIDTH + 2);
  });

  test('create agreement page uses max-w-3xl container', async ({ page }) => {
    await setTestSession(page, creator);
    await page.goto('/agreements/new');
    await expect(page.locator('text=Clarity Partner Agreement').first()).toBeVisible();
    const shell = page.locator('[data-testid="certificate-page-shell"]');
    await expect(shell).toBeVisible();
    const box = await shell.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(EXPECTED_MAX_WIDTH + 2);
  });

  test('accept agreement page uses max-w-3xl container', async ({ page }) => {
    await page.goto(`/agreements/${agreementId}/accept?token=${encodeURIComponent(invitationToken)}`);
    await expect(page.locator('text=invited you').first()).toBeVisible();
    const shell = page.locator('[data-testid="certificate-page-shell"]');
    await expect(shell).toBeVisible();
    const box = await shell.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(EXPECTED_MAX_WIDTH + 2);
  });

  test('all certificate pages have matching container width', async ({ page }) => {
    await setTestSession(page, creator);
    await page.goto(`/agreements/${agreementId}`);
    await expect(page.locator('[data-testid="certificate-page-shell"]')).toBeVisible();
    const detailBox = await page.locator('[data-testid="certificate-page-shell"]').boundingBox();
    await page.goto('/agreements/new');
    await expect(page.locator('[data-testid="certificate-page-shell"]')).toBeVisible();
    const createBox = await page.locator('[data-testid="certificate-page-shell"]').boundingBox();
    expect(detailBox).toBeTruthy();
    expect(createBox).toBeTruthy();
    expect(detailBox!.width).toBeCloseTo(createBox!.width, 0);
  });
});
