/**
 * @file p538-agreement-share.spec.ts
 * @description E2E tests for P538: Agreement Download Image & Share Dropdown
 *
 * Covers:
 *   - Toolbar visibility: shown only on active agreements, only for parties
 *   - Download Image button presence
 *   - Share dropdown items: Copy Link, Share on LinkedIn, Invite by Email
 *   - Toolbar hidden on pending agreements
 *   - Toolbar hidden for non-party visitors
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import { createTestUser, setTestSession } from './helpers/test-user';
import type { TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';

// ── Flow 1: Active agreement — party sees toolbar ─────────────────────────────

test.describe('Flow 1 — Active agreement toolbar for party', () => {
  let creator: TestUser;
  let partner: TestUser;
  let agreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P538 Creator' });
    partner = await createTestUser({ name: 'P538 Partner' });

    const agreement = await createTestAgreement(creator.profileId, partner.email, {
      partnerProfileId: partner.profileId,
      status: 'active',
      partnerSignedAt: new Date().toISOString(),
    });
    agreementId = agreement.id;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    if (partner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(partner.user.id);
    if (creator?.user?.id) await supabaseAdmin.auth.admin.deleteUser(creator.user.id);
  });

  test('creator sees Download Image button on active agreement', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /download image/i })).toBeVisible({ timeout: 10000 });
  });

  test('creator sees Share dropdown with all options', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: /share/i });
    await expect(shareButton).toBeVisible({ timeout: 10000 });

    await shareButton.click();

    await expect(page.getByText(/copy link/i)).toBeVisible();
    await expect(page.getByText(/share on linkedin/i)).toBeVisible();
    await expect(page.getByText(/invite by email/i)).toBeVisible();
  });

  test('partner sees toolbar on active agreement', async ({ page }) => {
    await setTestSession(page, partner.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /download image/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /share/i })).toBeVisible();
  });
});

// ── Flow 2: Non-active agreements — toolbar hidden ────────────────────────────

test.describe('Flow 2 — Toolbar hidden on non-active agreements', () => {
  let creator: TestUser;
  let pendingAgreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P538 F2 Creator' });

    const pending = await createTestAgreement(creator.profileId, 'p538-pending@test.example', {
      status: 'pending',
    });
    pendingAgreementId = pending.id;
  });

  test.afterAll(async () => {
    if (pendingAgreementId) await deleteTestAgreement(pendingAgreementId);
    if (creator?.user?.id) await supabaseAdmin.auth.admin.deleteUser(creator.user.id);
  });

  test('pending agreement does not show Download Image or Share buttons', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${pendingAgreementId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/clarity partner agreement/i)).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: /download image/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /share/i })).not.toBeVisible();
  });
});

// ── Flow 3: Non-party visitor — toolbar hidden ────────────────────────────────

test.describe('Flow 3 — Toolbar hidden for non-party visitors', () => {
  let creator: TestUser;
  let partner: TestUser;
  let visitor: TestUser;
  let agreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P538 F3 Creator' });
    partner = await createTestUser({ name: 'P538 F3 Partner' });
    visitor = await createTestUser({ name: 'P538 F3 Visitor' });

    const agreement = await createTestAgreement(creator.profileId, partner.email, {
      partnerProfileId: partner.profileId,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });
    agreementId = agreement.id;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    if (visitor?.user?.id) await supabaseAdmin.auth.admin.deleteUser(visitor.user.id);
    if (partner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(partner.user.id);
    if (creator?.user?.id) await supabaseAdmin.auth.admin.deleteUser(creator.user.id);
  });

  test('non-party visitor does not see toolbar on public active agreement', async ({ page }) => {
    await setTestSession(page, visitor.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/clarity partner agreement/i)).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: /download image/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /share/i })).not.toBeVisible();
  });
});
