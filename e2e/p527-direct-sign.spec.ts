/**
 * @file p527-direct-sign.spec.ts
 * @description E2E tests for P527: Direct Sign for New Users.
 *
 * Tests the core flow: new user signs agreement without email round-trip.
 * The edge function `create-and-sign` handles server-side user creation,
 * profile creation, agreement acceptance, and session token generation.
 *
 * NOTE: These tests call the real edge function on the test project.
 * No mocking — the full server-side flow executes.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteTestUserByEmail,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import {
  createTestAgreement,
  deleteTestAgreement,
} from './helpers/test-agreement';
import { supabaseAdmin } from './helpers/supabase-admin';

const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];

test.describe('P527 — Direct Sign for New Users', () => {
  test.setTimeout(60000);

  let creator: TestUser;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P527 Creator' });
  });

  test.afterAll(async () => {
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  // ── 1. Happy path: new user signs directly ──────────────────────────────

  test('TC-01: new user signs agreement without email round-trip', async ({ page }) => {
    const partnerEmail = `p527-tc01-${Date.now()}@gmail.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Assert: page shows editable name field + sign button
      await expect(page.getByPlaceholder('Your full name')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: /seal.*sign/i })).toBeVisible();

      // Fill in partner name
      await page.getByPlaceholder('Your full name').fill('TC01 Partner');

      // Click the sign button
      await page.getByRole('button', { name: /seal.*sign/i }).click();

      // Wait for navigation to agreement detail page (direct sign success)
      await page.waitForURL(`**/agreements/${agreement.id}`, { timeout: 20000 });

      // Assert: NO redirect to /agreements/confirm-email occurred
      expect(page.url()).toContain(`/agreements/${agreement.id}`);
      expect(page.url()).not.toContain('confirm-email');

      // Assert: agreement is displayed (some indicator of the signed agreement)
      await expect(page.getByText(/active/i).or(page.getByText(/sealed/i)).or(page.getByText(/TC01 Partner/i))).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteTestAgreement(agreement.id);
      await deleteTestUserByEmail(partnerEmail);
    }
  });

  test('TC-02: new user has valid session after signing (AC-2)', async ({ page }) => {
    const partnerEmail = `p527-tc02-${Date.now()}@gmail.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      await page.getByPlaceholder('Your full name').fill('TC02 Partner');
      await page.getByRole('button', { name: /seal.*sign/i }).click();
      await page.waitForURL(`**/agreements/${agreement.id}`, { timeout: 20000 });

      // Navigate to an authenticated page
      await page.goto('/connections');
      await page.waitForLoadState('networkidle');

      // Should not redirect to login — session is valid
      expect(page.url()).toContain('/connections');

      // Refresh and verify session persists
      await page.reload();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/connections');
    } finally {
      await deleteTestAgreement(agreement.id);
      await deleteTestUserByEmail(partnerEmail);
    }
  });

  test('TC-03: new user profile is complete after signing (AC-3)', async ({ page }) => {
    const partnerEmail = `p527-tc03-${Date.now()}@gmail.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      await page.getByPlaceholder('Your full name').fill('TC03 Partner');
      await page.getByRole('button', { name: /seal.*sign/i }).click();
      await page.waitForURL(`**/agreements/${agreement.id}`, { timeout: 20000 });

      // Query profile via admin
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('name, email, slug, avatar_color, is_verified')
        .eq('email', partnerEmail)
        .single();

      expect(profile).not.toBeNull();
      expect(profile!.name).toBe('TC03 Partner');
      expect(profile!.email).toBe(partnerEmail);
      expect(profile!.slug).toBeTruthy();
      expect(profile!.slug).toMatch(/^tc03-partner/);
      expect(AVATAR_COLORS).toContain(profile!.avatar_color);
      expect(profile!.is_verified).toBe(true);
    } finally {
      await deleteTestAgreement(agreement.id);
      await deleteTestUserByEmail(partnerEmail);
    }
  });

  test('TC-04: agreement is active with partner data set (AC-4)', async ({ page }) => {
    const partnerEmail = `p527-tc04-${Date.now()}@gmail.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      await page.getByPlaceholder('Your full name').fill('TC04 Partner');
      await page.getByRole('button', { name: /seal.*sign/i }).click();
      await page.waitForURL(`**/agreements/${agreement.id}`, { timeout: 20000 });

      // Query agreement via admin
      const { data: ag } = await supabaseAdmin
        .from('clarity_agreements')
        .select('status, partner_profile_id, partner_signed_at, partner_display_name')
        .eq('id', agreement.id)
        .single();

      expect(ag).not.toBeNull();
      expect(ag!.status).toBe('active');
      expect(ag!.partner_profile_id).toBeTruthy();
      expect(ag!.partner_signed_at).toBeTruthy();
      expect(ag!.partner_display_name).toBe('TC04 Partner');
    } finally {
      await deleteTestAgreement(agreement.id);
      await deleteTestUserByEmail(partnerEmail);
    }
  });

  // ── 2. Existing user: unchanged (regression) ───────────────────────────

  test('TC-05: existing user flow is unchanged — P488 path still works (AC-6)', async ({ page }) => {
    const existingPartner = await createTestUser({ name: 'P527 Existing Partner' });
    const agreement = await createTestAgreement(creator.user.id, existingPartner.email);

    try {
      // Set session for existing partner
      await setTestSession(page, existingPartner.email);

      // Navigate to accept page
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Page shows authenticated partner flow "I Accept & Co-Sign"
      await expect(page.getByRole('button', { name: /accept.*co-sign/i })).toBeVisible({ timeout: 10000 });

      // NOT the new-user direct-sign flow (no name input for new users)
      await expect(page.getByPlaceholder('Your full name')).not.toBeVisible();
    } finally {
      await deleteTestAgreement(agreement.id);
      await deleteTestUser(existingPartner.user.id);
    }
  });

  // ── 3. Fallback: edge function failure → OTP flow (AC-8) ───────────────

  test('TC-06: falls back to OTP flow when edge function fails (AC-8)', async ({ page }) => {
    const partnerEmail = `p527-tc06-${Date.now()}@gmail.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);

    try {
      // Intercept the create-and-sign edge function to return 500
      await page.route('**/functions/v1/create-and-sign', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'INTERNAL', message: 'Simulated failure' }),
        });
      });

      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      await page.getByPlaceholder('Your full name').fill('TC06 Partner');
      await page.getByRole('button', { name: /seal.*sign/i }).click();

      // Should fall back to OTP flow — navigates to confirm-email page
      await page.waitForURL('**/confirm-email', { timeout: 20000 });
      expect(page.url()).toContain('confirm-email');
    } finally {
      await deleteTestAgreement(agreement.id);
      // No user to clean up — edge function was mocked to fail
    }
  });

  // ── 4. Decline flow unchanged (AC-10) ──────────────────────────────────

  test('TC-07: decline flow for new users is unchanged (AC-10)', async ({ page }) => {
    const partnerEmail = `p527-tc07-${Date.now()}@gmail.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Click decline
      await page.getByRole('button', { name: /decline/i }).click();

      // Confirm decline in dialog
      await page.getByRole('dialog').getByRole('button', { name: /decline/i }).click();

      // Should navigate to declined page
      await page.waitForURL(`**/agreements/${agreement.id}/declined`, { timeout: 10000 });

      // Verify no account was created for the partner email
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', partnerEmail)
        .maybeSingle();

      expect(profile).toBeNull();
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });

  // ── 5. Edge cases ──────────────────────────────────────────────────────

  test('TC-08: replaying a consumed token does not create a second account', async ({ page }) => {
    const partnerEmail = `p527-tc08-${Date.now()}@gmail.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);

    try {
      // First: complete direct-sign flow
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      await page.getByPlaceholder('Your full name').fill('TC08 Partner');
      await page.getByRole('button', { name: /seal.*sign/i }).click();
      await page.waitForURL(`**/agreements/${agreement.id}`, { timeout: 20000 });

      // Second: navigate to same accept URL with same token
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Should show invalid/expired/already-signed state — NOT a sign button for new users
      // The agreement is now active, so the page should detect it's no longer pending
      const signButton = page.getByRole('button', { name: /seal.*sign/i });
      await expect(signButton).not.toBeVisible({ timeout: 5000 });
    } finally {
      await deleteTestAgreement(agreement.id);
      await deleteTestUserByEmail(partnerEmail);
    }
  });

  test('TC-09: expired invitation token shows invalid state', async ({ page }) => {
    const partnerEmail = `p527-tc09-${Date.now()}@gmail.com`;
    // Create agreement with expired invitation
    const agreement = await createTestAgreement(creator.user.id, partnerEmail, {
      invitationExpiresAt: new Date(Date.now() - 86400000).toISOString(), // 24h ago
    });

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Should show invalid/expired state
      // The getAgreementByToken RPC may return null for expired tokens, showing invalid page
      // OR it may return the agreement but the accept page handles expiry
      const signButton = page.getByRole('button', { name: /seal.*sign/i });
      const invalidText = page.getByText(/expired|invalid/i);

      // Either the page shows invalid text OR the sign button is not visible
      const isInvalid = await invalidText.isVisible().catch(() => false);
      const isSignVisible = await signButton.isVisible().catch(() => false);

      expect(isInvalid || !isSignVisible).toBe(true);
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });

  test('TC-10: empty partner name is rejected', async ({ page }) => {
    const partnerEmail = `p527-tc10-${Date.now()}@gmail.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Leave name field empty, click sign
      await page.getByPlaceholder('Your full name').fill('');
      await page.getByRole('button', { name: /seal.*sign/i }).click();

      // Should show validation error, NOT call edge function
      await expect(page.getByText(/please enter your name/i)).toBeVisible({ timeout: 5000 });

      // Still on accept page (no navigation)
      expect(page.url()).toContain('/accept');
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });
});
