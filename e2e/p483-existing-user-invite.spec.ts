/**
 * @file p483-existing-user-invite.spec.ts
 * @description E2E tests for P483: Existing User Invite Path Streamlining.
 *
 * Tests the differentiated flows for existing vs new users:
 *   1. Create page: email lookup auto-overrides name + locks field
 *   2. Create page: "Using their registered name" notification appears
 *   3. Create page: name field reverts to editable when email cleared
 *   4. Accept page (logged in, existing user): no editable name field
 *   5. Accept page (logged in, existing user): profile name shown, not creator-typed name
 *   6. Accept page (unauthenticated, existing user): CTA says "Sign In to Co-Sign"
 *   7. Accept page (unauthenticated, existing user): no name input field
 *   8. Accept page (unauthenticated, new user): unchanged flow with editable name + "Seal & Sign"
 *   9. New user path regression: name input still editable, "Already have an account?" visible
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';
import { setTestSession } from './helpers/test-user';

test.describe('P483 — Existing User Invite Path Streamlining', () => {
  test.setTimeout(60000);

  let creator: TestUser;
  let existingPartner: TestUser;
  // newPartnerEmail: no account exists for this email
  const newPartnerEmail = `new-partner-${Date.now()}@gmail.com`;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P483 Creator' });
    existingPartner = await createTestUser({ name: 'P483 Existing Partner' });
  });

  test.afterAll(async () => {
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
    if (existingPartner?.user?.id) await deleteTestUser(existingPartner.user.id);
  });

  // ── Create Page: Name Override on Lookup ──────────────────────────────────

  test('TC-01: email lookup auto-fills AND locks partner name for existing user', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Type partner name first (simulates creator typing before email)
    const nameInput = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
      .or(page.getByRole('textbox', { name: /partner.*name/i }))
      .or(page.locator('input[placeholder*="partner" i]'));
    await nameInput.fill('Wrong Name');

    // Now enter existing partner's email
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await emailInput.fill(existingPartner.email);

    // Wait for debounced lookup (400ms + network)
    await page.waitForTimeout(2000);

    // Name should be overridden to profile name — even though creator typed first
    await expect(nameInput).toHaveValue('P483 Existing Partner', { timeout: 5000 });

    // Name field should be read-only
    const isReadOnly = await nameInput.getAttribute('readonly');
    expect(isReadOnly).not.toBeNull();
  });

  test('TC-02: "Using their registered name" notification appears after lookup', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await emailInput.fill(existingPartner.email);

    // Wait for lookup
    await page.waitForTimeout(2000);

    // "Account found" badge should appear (existing behavior)
    await expect(page.getByText(/Account found/i)).toBeVisible({ timeout: 5000 });

    // NEW: "Using their registered name" hint
    await expect(page.getByText(/Using their registered name/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-03: name field reverts to editable when email is cleared', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    const nameInput = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
      .or(page.getByRole('textbox', { name: /partner.*name/i }))
      .or(page.locator('input[placeholder*="partner" i]'));

    // Trigger lookup
    await emailInput.fill(existingPartner.email);
    await page.waitForTimeout(2000);

    // Verify locked
    await expect(nameInput).toHaveAttribute('readonly', /.*/);

    // Clear email
    await emailInput.fill('');

    // Name field should revert to editable
    const isReadOnly = await nameInput.getAttribute('readonly');
    expect(isReadOnly).toBeNull();

    // Name should be cleared
    await expect(nameInput).toHaveValue('');

    // Notification should disappear
    await expect(page.getByText(/Using their registered name/i)).not.toBeVisible();
  });

  test('TC-04: lookup for non-existing email shows "No account found" (unchanged)', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await emailInput.fill(newPartnerEmail);
    await page.waitForTimeout(2000);

    // Should show "No account found" message
    await expect(page.getByText(/No account found/i)).toBeVisible({ timeout: 5000 });

    // Name field should remain editable
    const nameInput = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
      .or(page.getByRole('textbox', { name: /partner.*name/i }))
      .or(page.locator('input[placeholder*="partner" i]'));
    const isReadOnly = await nameInput.getAttribute('readonly');
    expect(isReadOnly).toBeNull();

    // "Using their registered name" should NOT appear
    await expect(page.getByText(/Using their registered name/i)).not.toBeVisible();
  });

  // ── Accept Page: Existing User, Logged In ─────────────────────────────────

  test('TC-05: logged-in existing user sees profile name as read-only text (no input)', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, existingPartner.email, {
      status: 'pending',
      visibility: 'private',
    });

    try {
      await setTestSession(page, existingPartner.email);
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Profile name should be visible as text
      await expect(page.getByText('P483 Existing Partner')).toBeVisible({ timeout: 10000 });

      // No editable name input should exist in the footer/certificate area
      const nameInput = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
        .or(page.getByRole('textbox', { name: /partner.*name/i }))
        .or(page.locator('input[placeholder*="Your full name" i]'))
        .or(page.locator('#unauth-partner-name'));
      await expect(nameInput).not.toBeVisible({ timeout: 3000 });

      // "I Accept & Co-Sign" button should be present
      await expect(page.getByRole('button', { name: /Accept.*Co-Sign/i })).toBeVisible({ timeout: 5000 });
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });

  test('TC-06: logged-in existing user sees profile name, not creator-typed name', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, existingPartner.email, {
      status: 'pending',
      visibility: 'private',
    });
    // Set a different partner_display_name (what creator typed)
    const { supabaseAdmin } = await import('../src/lib/supabase-admin');
    await supabaseAdmin
      .from('clarity_agreements')
      .update({ partner_display_name: 'Creator Typed Wrong Name' })
      .eq('id', agreement.id);

    try {
      await setTestSession(page, existingPartner.email);
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Profile name wins over creator-typed name
      await expect(page.getByText('P483 Existing Partner')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Creator Typed Wrong Name')).not.toBeVisible({ timeout: 3000 });
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });

  // ── Accept Page: Existing User, NOT Logged In ─────────────────────────────

  test('TC-07: unauthenticated existing user sees "Sign In to Co-Sign" CTA', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, existingPartner.email, {
      status: 'pending',
      visibility: 'private',
    });

    try {
      // Navigate without session (unauthenticated)
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Wait for existing-user detection + UI update
      await page.waitForTimeout(2000);

      // CTA should say "Sign In to Co-Sign" (not "Seal & Sign")
      await expect(
        page.getByRole('button', { name: /Sign In to Co-Sign/i })
      ).toBeVisible({ timeout: 10000 });

      // "Seal & Sign" should NOT appear
      await expect(
        page.getByRole('button', { name: /Seal & Sign/i })
      ).not.toBeVisible({ timeout: 3000 });
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });

  test('TC-08: unauthenticated existing user does not see name input or "Already have an account?"', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, existingPartner.email, {
      status: 'pending',
      visibility: 'private',
    });

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // No name input field
      const nameInput = page.locator('#unauth-partner-name')
        .or(page.locator('input[placeholder*="Your full name" i]'));
      await expect(nameInput).not.toBeVisible({ timeout: 3000 });

      // No "Already have an account?" link
      await expect(page.getByText(/Already have an account/i)).not.toBeVisible({ timeout: 3000 });
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });

  // ── Accept Page: New User (Regression — Unchanged) ────────────────────────

  test('TC-09: new user (no account) sees editable name field + "Seal & Sign" (unchanged)', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, newPartnerEmail, {
      status: 'pending',
      visibility: 'private',
    });

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Name input should be visible and editable
      const nameInput = page.locator('#unauth-partner-name')
        .or(page.locator('input[placeholder*="Your full name" i]'));
      await expect(nameInput).toBeVisible({ timeout: 10000 });

      // CTA should say "Seal & Sign" (NOT "Sign In to Co-Sign")
      await expect(
        page.getByRole('button', { name: /Seal & Sign/i })
      ).toBeVisible({ timeout: 5000 });

      // "Already have an account?" link should be visible
      await expect(page.getByText(/Already have an account/i)).toBeVisible({ timeout: 5000 });
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });
});
