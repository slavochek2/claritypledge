/**
 * @file p462-partner-count-prominence.spec.ts
 * @description E2E tests for P462: Clarity Partners Count — Header Prominence
 *
 * Tests conditional styling of the partners count on profile header:
 * - Owner with active partners: number bold navy xl
 * - Owner with 0 partners: number muted xl
 * - Non-owner with no visible agreements: nothing rendered
 * - Visitor seeing public agreement: partners line visible with styling
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';
import { supabaseAdmin } from '../src/lib/supabase-admin';

test.describe('P462 — Partners Count Header Prominence', () => {
  test.setTimeout(60000);

  let owner: TestUser;
  let partner: TestUser;
  let visitor: TestUser;
  let agreementId: string | null = null;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P462 Owner' });
    partner = await createTestUser({ name: 'P462 Partner' });
    visitor = await createTestUser({ name: 'P462 Visitor' });
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    await supabaseAdmin
      .from('clarity_agreements')
      .delete()
      .in('creator_profile_id', [owner?.user?.id, partner?.user?.id].filter(Boolean));
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
    if (partner?.user?.id) await deleteTestUser(partner.user.id);
    if (visitor?.user?.id) await deleteTestUser(visitor.user.id);
  });

  test('TC-01: owner with 0 partners — number shows muted styling, links to /partners', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Partners line should be visible for owner even with 0 agreements
    const partnersLink = page.locator('a[href*="/partners"]').filter({ hasText: /Clarity Partner/i });
    await expect(partnersLink).toBeVisible({ timeout: 10000 });

    // Number "0" should be present
    await expect(partnersLink.getByText('0')).toBeVisible();

    // Number should have muted styling (text-muted-foreground), NOT bold navy
    // The 0-count number should use text-xl text-muted-foreground
    const numberSpan = partnersLink.locator('span').filter({ hasText: '0' });
    await expect(numberSpan).toHaveClass(/text-muted-foreground/);
    // Should NOT have font-bold or navy color for 0-count
    await expect(numberSpan).not.toHaveClass(/font-bold/);

    // Link target correct
    await expect(partnersLink).toHaveAttribute('href', `/p/${owner.slug}/partners`);
  });

  test('TC-02: owner with active partner — number shows bold navy xl styling', async ({ page }) => {
    // Create an active agreement
    const agreement = await createTestAgreement(owner.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });
    agreementId = agreement.id;

    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const partnersLink = page.locator('a[href*="/partners"]').filter({ hasText: /Clarity Partner/i });
    await expect(partnersLink).toBeVisible({ timeout: 10000 });

    // Number "1" should have bold navy styling
    const numberSpan = partnersLink.locator('span').filter({ hasText: '1' });
    await expect(numberSpan).toHaveClass(/text-xl/);
    await expect(numberSpan).toHaveClass(/font-bold/);

    // Label "Clarity Partners →" should be text-sm text-muted-foreground
    const labelSpan = partnersLink.locator('span').filter({ hasText: /Clarity Partner/ });
    await expect(labelSpan).toHaveClass(/text-sm/);
    await expect(labelSpan).toHaveClass(/text-muted-foreground/);

    // Min tap height preserved
    const box = await partnersLink.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('TC-03: non-owner with no visible agreements — partners line not rendered', async ({ page }) => {
    // Ensure no agreements exist for visitor viewing owner's profile
    // (cleanup from previous test already handled, but visitor has no agreements with owner)
    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Wait for profile to load
    await expect(page.getByText('P462 Owner')).toBeVisible({ timeout: 10000 });

    // Partners metadata line should NOT be visible for non-owner with no visible agreements
    // Check that no link to /partners exists in the profile header area
    const partnersLink = page.locator('a[href*="/partners"]').filter({ hasText: /Clarity Partner/i });
    // Note: owner's active agreement from TC-02 is public, so visitor WILL see it.
    // This test needs owner with NO agreements. Let's clean up first.
    if (agreementId) {
      await deleteTestAgreement(agreementId);
      agreementId = null;
      await page.reload();
      await page.waitForLoadState('networkidle');
    }
    await expect(partnersLink).not.toBeVisible({ timeout: 5000 });
  });

  test('TC-04: visitor sees public active agreement — partners count visible', async ({ page }) => {
    // Create a public active agreement
    const agreement = await createTestAgreement(owner.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });
    agreementId = agreement.id;

    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Visitor should see the partners count (public agreement exists)
    const partnersLink = page.locator('a[href*="/partners"]').filter({ hasText: /Clarity Partner/i });
    await expect(partnersLink).toBeVisible({ timeout: 10000 });

    // Number styling — visitor sees count with prominent styling (same as owner with N>0)
    const numberSpan = partnersLink.locator('span').filter({ hasText: '1' });
    await expect(numberSpan).toHaveClass(/text-xl/);
    await expect(numberSpan).toHaveClass(/font-bold/);

    // Link still navigable
    await expect(partnersLink).toHaveAttribute('href', `/p/${owner.slug}/partners`);

    await deleteTestAgreement(agreement.id);
    agreementId = null;
  });

  test('TC-05: ✦ diamond icon present and aria-hidden', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const partnersLink = page.locator('a[href*="/partners"]').filter({ hasText: /Clarity Partner/i });
    await expect(partnersLink).toBeVisible({ timeout: 10000 });

    // Diamond icon should be present and decorative (aria-hidden)
    const diamond = partnersLink.locator('span[aria-hidden="true"]').filter({ hasText: '✦' });
    await expect(diamond).toBeVisible();
  });
});
