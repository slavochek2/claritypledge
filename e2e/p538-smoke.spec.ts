/**
 * @file p538-smoke.spec.ts
 * @description Smoke test for P538: Agreement Download Image & Share Dropdown
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession } from './helpers/test-user';
import type { TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';

test.describe('P538 Smoke — Agreement share toolbar loads', () => {
  let creator: TestUser;
  let partner: TestUser;
  let agreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P538 Smoke Creator' });
    partner = await createTestUser({ name: 'P538 Smoke Partner' });

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

  test('active agreement page loads with share toolbar and no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/clarity partner agreement/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /download image/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /share/i })).toBeVisible();

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('third-party'),
    );
    expect(realErrors).toHaveLength(0);
  });
});
