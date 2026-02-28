/**
 * @file agreements.spec.ts
 * @description E2E tests for P422: Clarity Partner Agreement
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';
import { supabaseAdmin } from '../src/lib/supabase-admin';

test.describe('P422 — Clarity Partner Agreement', () => {
  test.setTimeout(60000);

  let creator: TestUser;
  let partner: TestUser;
  let visitorUser: TestUser;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P422 Creator' });
    partner = await createTestUser({ name: 'P422 Partner' });
    visitorUser = await createTestUser({ name: 'P422 Visitor' });
  });

  test.afterAll(async () => {
    await supabaseAdmin
      .from('clarity_agreements')
      .delete()
      .in('creator_profile_id', [creator?.user?.id, partner?.user?.id].filter(Boolean));
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
    if (partner?.user?.id) await deleteTestUser(partner.user.id);
    if (visitorUser?.user?.id) await deleteTestUser(visitorUser.user.id);
  });

  test('TC-01: creator creates agreement with an existing user partner — shows pending state', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Clarity Partner Agreement')).toBeVisible({ timeout: 10000 });

    // Fill partner email — triggers live lookup
    await page.getByLabel(/partner.*email/i).fill(partner.email);

    // Live lookup should show "Account found" indicator
    await expect(page.getByText(/account found/i)).toBeVisible({ timeout: 5000 });

    // Terms textarea pre-filled
    await expect(page.getByLabel(/our terms/i)).not.toBeEmpty();

    await page.getByRole('button', { name: /create & send invitation/i }).click();

    // Redirected to /agreements/[id] in pending state
    await expect(page).toHaveURL(/\/agreements\/[0-9a-f-]{36}$/, { timeout: 10000 });

    // Pending state: invitation sent banner
    await expect(page.getByText(/Invitation sent to/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P422 Creator')).toBeVisible();

    // Cleanup
    const agreementId = page.url().split('/agreements/')[1];
    await deleteTestAgreement(agreementId);
  });

  test('TC-02: creator creates agreement with a new user partner — shows pending state', async ({ page }) => {
    await setTestSession(page, creator.email);
    const newUserEmail = `p422-new-${Date.now()}@gmail.com`;

    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    await page.getByLabel(/partner.*email/i).fill(newUserEmail);

    // Live lookup shows "no account found" copy
    await expect(page.getByText(/no account found/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/our terms/i)).not.toBeEmpty();

    await page.getByRole('button', { name: /create & send invitation/i }).click();

    // Lands on pending page
    await expect(page).toHaveURL(/\/agreements\/[0-9a-f-]{36}$/, { timeout: 10000 });
    await expect(page.getByText(/Invitation sent to/i)).toBeVisible({ timeout: 10000 });

    const agreementId = page.url().split('/agreements/')[1];
    await deleteTestAgreement(agreementId);
  });

  test('TC-03: existing user partner accepts agreement → celebration dialog → active certificate', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending',
      visibility: 'public',
    });

    await setTestSession(page, partner.email);
    // Pass the invitation token in the URL so the accept page can load the agreement
    await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // Accept page header shows creator's name (appears in subtitle + certificate — use first)
    await expect(page.getByText(/P422 Creator/i).first()).toBeVisible({ timeout: 10000 });
    // Certificate pledge text visible
    await expect(page.getByText(/We all crave being understood/i)).toBeVisible();

    // Click accept
    await page.getByRole('button', { name: /i accept.*co-sign|accept.*co-sign/i }).click();

    // Celebration dialog appears
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/sealed/i)).toBeVisible();

    // Navigate to agreement
    await page.getByRole('button', { name: /view agreement/i }).click();

    // Active certificate view
    await expect(page.getByText('Active since').or(page.getByText(/active/i)).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P422 Partner')).toBeVisible({ timeout: 10000 });

    await deleteTestAgreement(agreement.id);
  });

  test('TC-04: unauthenticated partner redirected to signup with returnTo', async ({ page }) => {
    const token = `test-token-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const agreement = await createTestAgreement(creator.user.id, `p422-unauth-${Date.now()}@gmail.com`, {
      status: 'pending',
      visibility: 'private',
      invitationExpiresAt: expiresAt,
      invitationToken: token,
    });

    // Visit as unauthenticated (no setTestSession)
    await page.goto(`/agreements/${agreement.id}/accept?token=${token}`);
    await page.waitForLoadState('networkidle');

    // Agreement content readable before auth
    await expect(page.getByText(/We all crave being understood/i)).toBeVisible({ timeout: 10000 });

    // Auth prompt present
    await expect(
      page.getByRole('link', { name: /create account/i }).or(
        page.getByRole('button', { name: /create account/i })
      )
    ).toBeVisible({ timeout: 5000 });

    // Clicking signup carries returnTo with token
    await page.getByRole('link', { name: /create account/i })
      .or(page.getByRole('button', { name: /create account/i }))
      .click();
    await page.waitForURL(/\/signup/, { timeout: 10000 });
    expect(page.url()).toContain('returnTo=');
    expect(page.url()).toContain(agreement.id);

    await deleteTestAgreement(agreement.id);
  });

  test('TC-05: partner declines agreement → decline landing shown, agreement marked declined', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending',
      visibility: 'private',
    });

    await setTestSession(page, partner.email);
    await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // Decline button present
    await page.getByRole('button', { name: /decline/i }).click();

    // Confirmation dialog
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('dialog').getByRole('button', { name: /decline/i }).click();

    // Declined landing page shows correct text
    await expect(page.getByText(/Invitation Declined/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/no longer active/i)).toBeVisible();

    // DB record updated
    const { data: updated } = await supabaseAdmin
      .from('clarity_agreements')
      .select('status')
      .eq('id', agreement.id)
      .single();
    expect(updated?.status).toBe('declined');

    await deleteTestAgreement(agreement.id);
  });

  test('TC-06: expired invitation shows expired banner — resend generates new token', async ({ page }) => {
    const expiredAt = new Date(Date.now() - 1000).toISOString();
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending',
      visibility: 'private',
      invitationExpiresAt: expiredAt,
    });

    const originalToken = agreement.invitationToken;

    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${agreement.id}`);
    await page.waitForLoadState('networkidle');

    // Expired state shown (lazy expiry: getAgreement marks it expired on read)
    await expect(page.getByText(/expired/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /resend invitation/i })).toBeVisible();

    // Resend
    await page.getByRole('button', { name: /resend invitation/i }).click();

    // After resend, pending state returns
    await expect(page.getByText(/Invitation sent to/i)).toBeVisible({ timeout: 10000 });

    // Token rotated in DB
    const { data: refreshed } = await supabaseAdmin
      .from('clarity_agreements')
      .select('invitation_token, invitation_expires_at')
      .eq('id', agreement.id)
      .single();
    expect(refreshed?.invitation_token).not.toBe(originalToken);
    expect(new Date(refreshed!.invitation_expires_at) > new Date()).toBe(true);

    await deleteTestAgreement(agreement.id);
  });

  test('TC-07a: creator terminates active agreement → terminated banner shown', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });

    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${agreement.id}`);
    await page.waitForLoadState('networkidle');

    // Active state shown (use first() to avoid strict mode violation)
    await expect(page.getByText('Active since').first()).toBeVisible({ timeout: 10000 });

    // Terminate button — the UI uses a direct "Terminate Agreement" button
    await page.getByRole('button', { name: /terminate/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /terminate/i }).last().click();

    await expect(page.getByText('This agreement was terminated').first()).toBeVisible({ timeout: 10000 });

    const { data: result } = await supabaseAdmin
      .from('clarity_agreements')
      .select('status, terminated_by')
      .eq('id', agreement.id)
      .single();
    expect(result?.status).toBe('terminated');
    expect(result?.terminated_by).toBe(creator.user.id);

    await deleteTestAgreement(agreement.id);
  });

  test('TC-07b: partner terminates active agreement → terminated banner shown', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });

    await setTestSession(page, partner.email);
    await page.goto(`/agreements/${agreement.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /terminate/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /terminate/i }).last().click();

    await expect(page.getByText('This agreement was terminated').first()).toBeVisible({ timeout: 10000 });

    const { data: result } = await supabaseAdmin
      .from('clarity_agreements')
      .select('status, terminated_by')
      .eq('id', agreement.id)
      .single();
    expect(result?.status).toBe('terminated');
    expect(result?.terminated_by).toBe(partner.user.id);

    await deleteTestAgreement(agreement.id);
  });

  test('TC-08: public active agreement visible on profile page without authentication', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });

    // Unauthenticated visit to creator's profile
    await page.goto(`/p/${creator.slug}`);
    await page.waitForLoadState('networkidle');

    // Partner Agreements section visible
    await expect(page.getByText(/Partner Agreement/i)).toBeVisible({ timeout: 10000 });

    await deleteTestAgreement(agreement.id);
  });

  test('TC-09: private agreement hidden from non-party profile visitors', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'private',
      partnerSignedAt: new Date().toISOString(),
    });

    // Log in as non-party visitor
    await setTestSession(page, visitorUser.email);
    await page.goto(`/agreements/${agreement.id}`);
    await page.waitForLoadState('networkidle');

    // Should be blocked — private + non-party
    await expect(
      page.getByText(/private/i).or(page.getByText(/not found/i)).or(page.getByText(/access/i))
    ).toBeVisible({ timeout: 10000 });

    await deleteTestAgreement(agreement.id);
  });

  test('TC-10: creator with no name set sees inline error and cannot submit', async ({ page }) => {
    const namelessUser = await createTestUser({ name: 'temp' });
    await supabaseAdmin.from('profiles').update({ name: '' }).eq('id', namelessUser.user.id);

    await setTestSession(page, namelessUser.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Inline error about missing name
    await expect(
      page.getByText(/please add your name.*settings|add your name.*settings|add your name/i)
    ).toBeVisible({ timeout: 10000 });

    // Submit button disabled
    await expect(
      page.getByRole('button', { name: /create & send invitation/i })
    ).toBeDisabled({ timeout: 3000 });

    await deleteTestUser(namelessUser.user.id);
  });

  test('TC-11: creator entering their own email sees inline error — submit disabled', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    await page.getByLabel(/partner.*email/i).fill(creator.email);
    // Trigger the debounced lookup + validation
    await page.keyboard.press('Tab');

    // Inline error (debounce fires after 400ms — wait generously)
    await expect(
      page.getByText(/can't invite yourself|cannot.*yourself|invite yourself/i)
    ).toBeVisible({ timeout: 5000 });

    // Submit button disabled because partnerEmail error is set
    const submitButton = page.getByRole('button', { name: /create & send invitation/i });
    await expect(submitButton).toBeDisabled({ timeout: 3000 });
  });
});
