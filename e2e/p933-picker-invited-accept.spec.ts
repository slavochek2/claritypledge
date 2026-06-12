/**
 * P933 — Picker-invited partner cannot accept.
 *
 * Canary: create an agreement with partner_profile_id pre-set (simulating the
 * P878 name-picker path), then assert the recipient sees it under "Invited to
 * sign" — not under "Pending invitation" — and can reach the accept page.
 *
 * Before fix: incomingInvitations is empty (IS NULL filter excludes the row),
 * so "Invited to sign" is absent and "Pending invitation" wrongly shows the row.
 * After fix: "Invited to sign" renders with a Review link; "Pending invitation"
 * is absent for User B (not the creator).
 */

import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';

test.describe('P933: picker-invited partner can accept', () => {
  let creatorId: string;
  let creatorEmail: string;
  let creatorSlug: string;
  let recipientId: string;
  let recipientEmail: string;
  let recipientSlug: string;
  let agreementId: string;

  test.beforeAll(async () => {
    const creator = await createTestUser({ name: 'P933 Creator' });
    creatorId = creator.user.id;
    creatorEmail = creator.email;
    creatorSlug = creator.slug;

    const recipient = await createTestUser({ name: 'P933 Recipient' });
    recipientId = recipient.user.id;
    recipientEmail = recipient.email;
    recipientSlug = recipient.slug;

    // Simulate picker-created agreement: partner_profile_id pre-set at creation
    const ag = await createTestAgreement(creatorId, recipientEmail, {
      partnerProfileId: recipientId,
    });
    agreementId = ag.id;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    await Promise.all([
      deleteTestUser(creatorId),
      deleteTestUser(recipientId),
    ]);
  });

  test('smoke: recipient partners page loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('ResizeObserver loop')) {
        errors.push(msg.text());
      }
    });
    await setTestSession(page, recipientEmail);
    await page.goto(`/p/${recipientSlug}/partners`);
    await page.waitForLoadState('networkidle');
    expect(errors, `Console errors: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('picker-invited recipient sees invitation under "Invited to sign" with Review link', async ({ page }) => {
    await setTestSession(page, recipientEmail);
    await page.goto(`/p/${recipientSlug}/partners`);
    await page.waitForLoadState('networkidle');

    // BUG (before fix): heading absent — incomingInvitations empty because
    // getIncomingInvitations filters partner_profile_id IS NULL
    await expect(
      page.getByRole('heading', { name: /Invited to sign/i }),
      'BUG: "Invited to sign" section missing — picker-invited agreement dropped by IS NULL filter',
    ).toBeVisible({ timeout: 10000 });

    // Review badge must be visible (the accept affordance)
    await expect(
      page.getByText('Review'),
      'BUG: Review badge missing — recipient has no accept affordance',
    ).toBeVisible({ timeout: 5000 });
  });

  test('picker-invited agreement does NOT appear in recipient "Pending invitation" section', async ({ page }) => {
    await setTestSession(page, recipientEmail);
    await page.goto(`/p/${recipientSlug}/partners`);
    await page.waitForLoadState('networkidle');

    // BUG (before fix): "Pending invitation" IS visible because the agreement
    // appears via getAgreementsForProfile and pendingAgreements has no creator guard
    await expect(
      page.getByRole('heading', { name: /Pending invitation/i }),
      'BUG: "Pending invitation" visible for recipient who is not the creator',
    ).not.toBeVisible({ timeout: 5000 });
  });

  test('creator still sees picker-invited agreement in their "Pending invitation" (regression guard)', async ({ page }) => {
    await setTestSession(page, creatorEmail);
    await page.goto(`/p/${creatorSlug}/partners`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /Pending invitation/i }),
      'REGRESSION: creator no longer sees outgoing invitation in "Pending invitation"',
    ).toBeVisible({ timeout: 10000 });
  });
});
