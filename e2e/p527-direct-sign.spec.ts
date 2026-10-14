/**
 * @file p527-direct-sign.spec.ts
 * @description E2E tests for the new-partner signing flow on the agreement accept page.
 *
 * P527 originally signed a new partner in one click: the `create-and-sign` edge function
 * created a confirmed account, signed the agreement and returned a session to whoever held
 * the invitation link. P1487 (founder decision: mailbox-delivered first sign-in) retired that:
 * the invitation link is not proof of owning the invited mailbox. "Seal & Sign" now sends a
 * sign-in link to the invited address; the partner opens it, returns signed in, and the
 * agreement is accepted automatically. These tests assert that flow end to end.
 *
 * What is real and what is stood in for: the page, the auth server's link verification, the
 * profile write in /auth/callback and the accept RPC all run for real against the test
 * project. Only the outbound email is replaced — the OTP request is intercepted (no mail is
 * sent) and the test plays the mailbox: it creates the unconfirmed account the auth server
 * would create for that request (same email and metadata), mints that address's sign-in link
 * and opens it the way the email template does (/auth/verify with `redirect_to`). The
 * creator notification call is observed and answered locally, so no mail goes out there
 * either.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import {
  createTestAgreement,
  deleteTestAgreement,
} from './helpers/test-agreement';
import { supabaseAdmin } from './helpers/supabase-admin';

const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];

interface MailboxStub {
  /** The OTP request the page sent, once it has sent one. */
  otp: () => { email: string; data: Record<string, unknown>; createUser: boolean; redirectTo: string } | null;
  /** Calls the page made to the retired one-click function. */
  oneClickCalls: () => number;
  /** Creator-notification calls the page made (send-agreement-emails). */
  notifyBodies: () => Array<Record<string, unknown>>;
}

/** Intercept outbound mail paths for one page; nothing reaches a real mailbox. */
async function stubMail(page: Page): Promise<MailboxStub> {
  let otp: ReturnType<MailboxStub['otp']> = null;
  let oneClick = 0;
  const notify: Array<Record<string, unknown>> = [];
  await page.route('**/auth/v1/otp**', async (route) => {
    const req = route.request();
    const body = req.postDataJSON() as { email: string; data?: Record<string, unknown>; create_user?: boolean };
    otp = {
      email: body.email,
      data: body.data ?? {},
      createUser: body.create_user !== false,
      redirectTo: new URL(req.url()).searchParams.get('redirect_to') ?? '',
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/functions/v1/create-and-sign', async (route) => {
    oneClick++;
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'MAILBOX_REQUIRED' }) });
  });
  await page.route('**/functions/v1/send-agreement-emails', async (route) => {
    notify.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  return { otp: () => otp, oneClickCalls: () => oneClick, notifyBodies: () => notify };
}

async function authUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin.rpc('get_auth_user_by_email', { p_email: email.toLowerCase() });
  return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
}

async function cleanupPartner(email: string) {
  const id = await authUserIdByEmail(email);
  if (id) await deleteTestUser(id);
}

/**
 * Plays the partner's mailbox: does what the auth server does for the intercepted OTP request
 * (an unconfirmed account carrying the page's metadata), then opens that address's one-time
 * sign-in link as the email template renders it.
 */
async function openMailboxLink(page: Page, mail: MailboxStub, expectedEmail: string) {
  const otp = mail.otp();
  expect(otp, 'the page sent no sign-in link request').not.toBeNull();
  expect(otp!.email, 'sign-in link must go to the invited address').toBe(expectedEmail);
  expect(otp!.createUser).toBe(true);
  expect(await authUserIdByEmail(expectedEmail), 'no account may exist before the mailbox link is opened').toBeNull();

  const { error: cErr } = await supabaseAdmin.auth.admin.createUser({
    email: expectedEmail, email_confirm: false, user_metadata: otp!.data,
  });
  expect(cErr, cErr?.message).toBeNull();
  const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: expectedEmail });
  expect(lErr, lErr?.message).toBeNull();
  const params = new URLSearchParams({ token_hash: link!.properties!.hashed_token, type: 'magiclink' });
  await page.goto(`/auth/verify?${params.toString()}&redirect_to=${encodeURIComponent(otp!.redirectTo)}`);
}

/** Fill the name, press "Seal & Sign", land on the check-your-email page, open the link. */
async function signViaMailbox(page: Page, mail: MailboxStub, agreementId: string, token: string, partnerEmail: string, name: string) {
  await page.goto(`/agreements/${agreementId}/accept?token=${token}`);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Your full name').fill(name);
  await page.getByRole('button', { name: /seal.*sign/i }).click();
  await page.waitForURL('**/agreements/confirm-email', { timeout: 20000 });
  await openMailboxLink(page, mail, partnerEmail);
  // Signed in, back on the accept page, the stored intent auto-accepts → agreement page.
  await page.waitForURL((u) => u.pathname === `/agreements/${agreementId}`, { timeout: 30000 });
}

test.describe('P527 / P1487 — New partner signs through the mailbox', () => {
  test.setTimeout(60000);

  let creator: TestUser;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P527 Creator' });
  });

  test.afterAll(async () => {
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  // ── 1. Happy path: new partner signs through the mailbox (P1487) ────────

  test('TC-01: new partner signs via a mailbox link and lands on the signed agreement', async ({ page }) => {
    const partnerEmail = `p527-tc01-${Date.now()}@example.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);
    const mail = await stubMail(page);

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Assert: page shows editable name field + sign button
      await expect(page.getByPlaceholder('Your full name')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: /seal.*sign/i })).toBeVisible();

      await page.getByPlaceholder('Your full name').fill('TC01 Partner');
      await page.getByRole('button', { name: /seal.*sign/i }).click();

      // Holding the link signs nobody in: the page asks for the mailbox instead.
      await page.waitForURL('**/agreements/confirm-email', { timeout: 20000 });
      expect(mail.oneClickCalls(), 'the retired one-click function must not be called').toBe(0);
      const { data: pending } = await supabaseAdmin.from('clarity_agreements').select('status').eq('id', agreement.id).single();
      expect(pending!.status, 'nothing is signed before the mailbox link is opened').toBe('pending');

      await openMailboxLink(page, mail, partnerEmail);
      await page.waitForURL((u) => u.pathname === `/agreements/${agreement.id}`, { timeout: 30000 });

      // Assert: agreement is displayed (some indicator of the signed agreement)
      await expect(page.getByText(/active/i).or(page.getByText(/sealed/i)).or(page.getByText(/TC01 Partner/i)).first()).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteTestAgreement(agreement.id);
      await cleanupPartner(partnerEmail);
    }
  });

  test('TC-02: new partner has a valid session after signing (AC-2)', async ({ page }) => {
    const partnerEmail = `p527-tc02-${Date.now()}@example.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);
    const mail = await stubMail(page);

    try {
      await signViaMailbox(page, mail, agreement.id, agreement.invitationToken, partnerEmail, 'TC02 Partner');

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
      await cleanupPartner(partnerEmail);
    }
  });

  test('TC-03: new partner profile is complete and confirmed after signing (AC-3)', async ({ page }) => {
    const partnerEmail = `p527-tc03-${Date.now()}@example.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);
    const mail = await stubMail(page);

    try {
      await signViaMailbox(page, mail, agreement.id, agreement.invitationToken, partnerEmail, 'TC03 Partner');

      // Query profile via admin
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, name, email, slug, avatar_color, is_verified, accepted_terms_version')
        .eq('email', partnerEmail)
        .single();

      expect(profile).not.toBeNull();
      expect(profile!.name).toBe('TC03 Partner');
      expect(profile!.email).toBe(partnerEmail);
      expect(profile!.slug).toBeTruthy();
      expect(profile!.slug).toMatch(/^tc03-partner/);
      expect(AVATAR_COLORS).toContain(profile!.avatar_color);
      expect(profile!.is_verified).toBe(true);
      // Terms: the partner agreed by signing; the profile records the accepted version.
      expect(profile!.accepted_terms_version).toBeTruthy();

      // The address was proven by the mailbox link, not by the invitation.
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profile!.id);
      expect(authUser.user?.email_confirmed_at).toBeTruthy();
    } finally {
      await deleteTestAgreement(agreement.id);
      await cleanupPartner(partnerEmail);
    }
  });

  test('TC-04: agreement is active with partner data set, and the creator is notified (AC-4)', async ({ page }) => {
    const partnerEmail = `p527-tc04-${Date.now()}@example.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);
    const mail = await stubMail(page);

    try {
      await signViaMailbox(page, mail, agreement.id, agreement.invitationToken, partnerEmail, 'TC04 Partner');

      // Query agreement via admin
      const { data: ag } = await supabaseAdmin
        .from('clarity_agreements')
        .select('status, partner_profile_id, partner_signed_at, partner_display_name')
        .eq('id', agreement.id)
        .single();

      expect(ag).not.toBeNull();
      expect(ag!.status).toBe('active');
      expect(ag!.partner_profile_id).toBe(await authUserIdByEmail(partnerEmail));
      expect(ag!.partner_signed_at).toBeTruthy();
      expect(ag!.partner_display_name).toBe('TC04 Partner');

      await expect.poll(() => mail.notifyBodies().length, { timeout: 10000 }).toBeGreaterThan(0);
      expect(mail.notifyBodies()).toContainEqual(expect.objectContaining({ action: 'accepted', agreementId: agreement.id }));
    } finally {
      await deleteTestAgreement(agreement.id);
      await cleanupPartner(partnerEmail);
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

  // ── 3. The email path is the only path (P1487; was the AC-8 fallback) ───

  test('TC-06: "Seal & Sign" goes straight to the email path, even when the one-click function is down', async ({ page }) => {
    const partnerEmail = `p527-tc06-${Date.now()}@example.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);
    const mail = await stubMail(page);
    // A deployment where the retired function errors must change nothing.
    await page.unroute('**/functions/v1/create-and-sign');
    let oneClick = 0;
    await page.route('**/functions/v1/create-and-sign', (route) => {
      oneClick++;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'INTERNAL' }) });
    });

    try {
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      await page.getByPlaceholder('Your full name').fill('TC06 Partner');
      await page.getByRole('button', { name: /seal.*sign/i }).click();

      await page.waitForURL('**/confirm-email', { timeout: 20000 });
      expect(page.url()).toContain('confirm-email');
      expect(oneClick).toBe(0);
      expect(mail.otp()?.email).toBe(partnerEmail);
      expect(await authUserIdByEmail(partnerEmail), 'no account before the mailbox link is opened').toBeNull();
    } finally {
      await deleteTestAgreement(agreement.id);
      await cleanupPartner(partnerEmail);
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
    const partnerEmail = `p527-tc08-${Date.now()}@example.com`;
    const agreement = await createTestAgreement(creator.user.id, partnerEmail);
    const mail = await stubMail(page);

    try {
      // First: complete the mailbox sign flow
      await signViaMailbox(page, mail, agreement.id, agreement.invitationToken, partnerEmail, 'TC08 Partner');
      const firstId = await authUserIdByEmail(partnerEmail);
      expect(firstId).toBeTruthy();

      // Second: navigate to same accept URL with same token
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // The agreement is now active, so the page must not offer to sign again
      const signButton = page.getByRole('button', { name: /seal.*sign/i });
      await expect(signButton).not.toBeVisible({ timeout: 5000 });
      expect(await authUserIdByEmail(partnerEmail)).toBe(firstId);
    } finally {
      await deleteTestAgreement(agreement.id);
      await cleanupPartner(partnerEmail);
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
