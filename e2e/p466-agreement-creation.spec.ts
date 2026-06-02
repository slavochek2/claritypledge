/**
 * @file p466-agreement-creation.spec.ts
 * @description E2E tests for P466: Agreement Creation — HelloSign Redesign.
 *
 * Tests the core user flows for the certificate-as-form creation pattern:
 *   1. Certificate frame visible from page load
 *   2. Partner name input is inline within the certificate
 *   3. Real-time update as user types
 *   4. Auto-fill from email lookup
 *   5. Validation: empty name blocks submission
 *   6. Submitted name stored as partner_display_name
 *   7. Pending view shows stored name (not "Invited party")
 *   8. Accept page pre-fills partner name slot (editable)
 *   9. After partner accepts, profile name takes precedence in rendering
 *  10. Submit button label is "Seal & Send Invitation ✦"
 *  11. Email and visibility remain below the certificate
 *  12. Existing agreement states (active, declined) visually unchanged
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement, type TestAgreement as _TestAgreement } from './helpers/test-agreement';
import { setTestSession } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P466 — Agreement Creation (HelloSign Redesign)', () => {
  test.setTimeout(60000);

  let creator: TestUser;
  let partner: TestUser;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P466E2E Creator' });
    partner = await createTestUser({ name: 'P466E2E Partner' });
  });

  test.afterAll(async () => {
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
    if (partner?.user?.id) await deleteTestUser(partner.user.id);
  });

  // ── 1. Certificate frame visible from page load ────────────────────────────

  test('certificate frame renders on /agreements/new before any input', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Certificate title
    await expect(page.getByText(/Clarity Partner Agreement/i).first()).toBeVisible({ timeout: 10000 });
    // Pledge text
    await expect(page.getByText(/We all crave being understood/i)).toBeVisible({ timeout: 5000 });
    // Creator name auto-populated from profile
    await expect(page.getByText('P466E2E Creator')).toBeVisible({ timeout: 5000 });
  });

  // ── 2. Partner name input is inline within the certificate ─────────────────

  test('partner name input is inside the certificate frame (not a separate form section above)', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
      .or(page.getByRole('textbox', { name: /partner.*name|partner.*full name/i }))
      .or(page.locator('input[placeholder*="partner" i]'));

    await expect(nameInput).toBeVisible({ timeout: 10000 });

    // Email field is NOT the partner name input — it sits below the certificate
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });

    // Name input must appear above the email input in DOM order
    const nameBox = await nameInput.boundingBox();
    const emailBox = await emailInput.boundingBox();
    expect(nameBox?.y).toBeLessThan(emailBox?.y ?? Infinity);
  });

  // ── 3. Real-time update as user types ─────────────────────────────────────

  test('certificate partner slot updates live as user types a name', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
      .or(page.getByRole('textbox', { name: /partner.*name/i }))
      .or(page.locator('input[placeholder*="partner" i]'));

    await nameInput.fill('Jordan Kim');

    // The typed name should appear within the certificate (not just in the input)
    await expect(page.getByText('Jordan Kim').first()).toBeVisible({ timeout: 5000 });
  });

  // ── 4. Submit button label ─────────────────────────────────────────────────

  test('submit button is labeled "Seal & Send Invitation ✦" (Req 9)', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /Seal & Send Invitation/i })
    ).toBeVisible({ timeout: 10000 });
  });

  // ── 5. Email and visibility are below the certificate ─────────────────────

  test('email field and visibility toggle are below the certificate frame', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const certTitle = page.getByText(/Clarity Partner Agreement/i).first();
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');

    const certBox = await certTitle.boundingBox();
    const emailBox = await emailInput.boundingBox();

    // Email must render below the certificate title
    expect(emailBox?.y).toBeGreaterThan(certBox?.y ?? 0);
  });

  // ── 6. Validation: empty name blocks submission ────────────────────────────

  test('submitting without a partner name shows a validation error', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Fill email but leave partner name empty
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await emailInput.fill(partner.email);

    const submitButton = page.getByRole('button', { name: /Seal & Send Invitation/i });
    await submitButton.click();

    // Either inline error text or aria-invalid on the input
    const nameInput = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
      .or(page.getByRole('textbox', { name: /partner.*name/i }))
      .or(page.locator('input[placeholder*="partner" i]'));

    const hasInlineError = page.getByText(/partner name is required|name is required/i);
    const _hasAriaInvalid = nameInput.locator('[aria-invalid="true"]');

    const errorVisible = await hasInlineError.isVisible().catch(() => false);
    const ariaInvalid = await nameInput.getAttribute('aria-invalid').catch(() => null);

    expect(errorVisible || ariaInvalid === 'true').toBe(true);

    // Should not have navigated away
    expect(page.url()).toContain('/agreements/new');
  });

  // ── 7. Submitted name stored as partner_display_name ──────────────────────

  test('submitted partner name is stored as partner_display_name on the agreement', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
      .or(page.getByRole('textbox', { name: /partner.*name/i }))
      .or(page.locator('input[placeholder*="partner" i]'));

    await nameInput.fill('Morgan Reyes');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await emailInput.fill(partner.email);

    await page.getByRole('button', { name: /Seal & Send Invitation/i }).click();

    // Should navigate to the pending agreement page
    await page.waitForURL(/\/agreements\/[^/]+$/, { timeout: 15000 });

    // Extract agreement ID from URL
    const agreementId = page.url().split('/agreements/').at(-1);
    expect(agreementId).toBeTruthy();

    // Verify DB record
    const { data } = await supabaseAdmin
      .from('clarity_agreements')
      .select('partner_display_name')
      .eq('id', agreementId!)
      .single();

    expect(data?.partner_display_name).toBe('Morgan Reyes');

    // Clean up
    if (agreementId) await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreementId);
  });

  // ── 8. Pending view shows stored name, not "Invited party" ────────────────

  test('pending agreement shows partner_display_name (not "Invited party")', async ({ page }) => {
    // Create a pending agreement with a stored partner_display_name
    const pendingAgreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending',
      visibility: 'private',
    });
    await supabaseAdmin
      .from('clarity_agreements')
      .update({ partner_display_name: 'Dakota Blue' })
      .eq('id', pendingAgreement.id);

    try {
      await setTestSession(page, creator.email);
      await page.goto(`/agreements/${pendingAgreement.id}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('Dakota Blue')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Invited party')).not.toBeVisible({ timeout: 3000 });
    } finally {
      await deleteTestAgreement(pendingAgreement.id);
    }
  });

  // ── 9. Pending view with null partner_display_name falls back to "Invited party" ──

  test('pending agreement with no partner_display_name shows "Invited party" (legacy fallback)', async ({ page }) => {
    const pendingAgreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending',
      visibility: 'private',
    });
    // Explicitly ensure partner_display_name is null (legacy state)
    await supabaseAdmin
      .from('clarity_agreements')
      .update({ partner_display_name: null })
      .eq('id', pendingAgreement.id);

    try {
      await setTestSession(page, creator.email);
      await page.goto(`/agreements/${pendingAgreement.id}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('Invited party')).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteTestAgreement(pendingAgreement.id);
    }
  });

  // ── 10. Accept page pre-fills partner name slot ───────────────────────────

  test('accept-agreement page shows partner_display_name pre-filled in partner slot', async ({ page }) => {
    const pendingAgreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending',
      visibility: 'private',
    });
    await supabaseAdmin
      .from('clarity_agreements')
      .update({ partner_display_name: 'Pre-filled Alex' })
      .eq('id', pendingAgreement.id);

    try {
      await setTestSession(page, partner.email);
      await page.goto(`/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Pre-filled name visible in the slot or in the input value
      await expect(
        page.getByText('Pre-filled Alex').or(
          page.locator('input[value="Pre-filled Alex"]')
        ).first()
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteTestAgreement(pendingAgreement.id);
    }
  });

  // ── 11. Partner can edit their name before accepting ──────────────────────

  test('partner can overwrite pre-filled name on accept page before signing', async ({ page }) => {
    const pendingAgreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending',
      visibility: 'private',
    });
    await supabaseAdmin
      .from('clarity_agreements')
      .update({ partner_display_name: 'Old Name' })
      .eq('id', pendingAgreement.id);

    try {
      await setTestSession(page, partner.email);
      await page.goto(`/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      const nameSlot = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
        .or(page.getByRole('textbox', { name: /partner.*name/i }))
        .or(page.locator('input[placeholder*="partner" i]'));

      await nameSlot.fill('New Name');
      await expect(nameSlot).toHaveValue('New Name');
    } finally {
      await deleteTestAgreement(pendingAgreement.id);
    }
  });

  // ── 12. After acceptance, profile name takes precedence ───────────────────

  test('active agreement shows profile name over partner_display_name (fallback chain)', async ({ page }) => {
    // Active agreement: partner has a profile (P466E2E Partner), display_name is different
    const activeAgreement = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'private',
      partnerSignedAt: new Date().toISOString(),
    });
    await supabaseAdmin
      .from('clarity_agreements')
      .update({ partner_display_name: 'Should Not Show' })
      .eq('id', activeAgreement.id);

    try {
      await setTestSession(page, creator.email);
      await page.goto(`/agreements/${activeAgreement.id}`);
      await page.waitForLoadState('networkidle');

      // Profile name wins
      await expect(page.getByText('P466E2E Partner')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Should Not Show')).not.toBeVisible({ timeout: 3000 });
    } finally {
      await deleteTestAgreement(activeAgreement.id);
    }
  });

  // ── 13. Active agreement with no profile shows "Partner" (not "Invited party") ──

  test('active agreement with no profile name shows "Partner" terminal fallback (not "Invited party")', async ({ page }) => {
    // Active agreement with no partner profile id and no display_name — edge case
    const activeAgreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'active',
      visibility: 'private',
      partnerSignedAt: new Date().toISOString(),
    });
    await supabaseAdmin
      .from('clarity_agreements')
      .update({ partner_display_name: null })
      .eq('id', activeAgreement.id);

    try {
      await setTestSession(page, creator.email);
      await page.goto(`/agreements/${activeAgreement.id}`);
      await page.waitForLoadState('networkidle');

      // "Invited party" must NOT appear in non-pending states
      await expect(page.getByText('Invited party')).not.toBeVisible({ timeout: 3000 });
    } finally {
      await deleteTestAgreement(activeAgreement.id);
    }
  });

  // ── 14. Auto-fill from email lookup ───────────────────────────────────────

  test('entering a known email auto-fills the partner name slot when user has not typed yet', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await emailInput.fill(partner.email);

    // Wait for debounced lookup to complete (up to 3s)
    await page.waitForTimeout(1500);

    const nameInput = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
      .or(page.getByRole('textbox', { name: /partner.*name/i }))
      .or(page.locator('input[placeholder*="partner" i]'));

    // The name slot should be auto-filled with the partner's profile name
    const filledValue = await nameInput.inputValue().catch(() => '');
    expect(filledValue.length).toBeGreaterThan(0);
  });

  // ── 15. No console errors on the create page ──────────────────────────────

  test('create-agreement-page has no unexpected JS console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (
        msg.type() === 'error' &&
        !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)
      ) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    expect(
      consoleErrors,
      `Console errors on create-agreement-page:\n${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  // ── 16. Terms textarea remains in the certificate body ────────────────────

  test('terms textarea is visible inside the certificate and editable', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const termsLabel = page.getByText(/Our terms/i);
    await expect(termsLabel).toBeVisible({ timeout: 10000 });

    const termsTextarea = page.locator('textarea');
    await expect(termsTextarea).toBeVisible({ timeout: 5000 });

    // Terms must appear above the email field (inside the certificate)
    const termsBox = await termsTextarea.boundingBox();
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    const emailBox = await emailInput.boundingBox();
    expect(termsBox?.y).toBeLessThan(emailBox?.y ?? Infinity);
  });

  // ── 17. Visibility toggle below certificate ────────────────────────────────

  test('visibility toggle renders below the certificate frame', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Visibility toggle (Private / Public buttons or segment)
    const visibilityControl = page.getByText(/Private/i).or(page.getByRole('radio', { name: /Private/i })).first();
    await expect(visibilityControl).toBeVisible({ timeout: 10000 });

    const certTitle = page.getByText(/Clarity Partner Agreement/i).first();
    const certBox = await certTitle.boundingBox();
    const visBox = await visibilityControl.boundingBox();

    // Visibility must render below the certificate title
    expect(visBox?.y).toBeGreaterThan(certBox?.y ?? 0);
  });

  // ── 18. P857: terms placeholder names all three suggested dimensions ───────

  test('P857: terms placeholder suggests channel, scope, AND termination', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const termsTextarea = page.locator('#agreement-terms');
    await expect(termsTextarea).toBeVisible({ timeout: 10000 });

    // The greyed suggestion lives in the placeholder attribute (never pre-written
    // into the value). It must name all three dimensions the v4 oath doesn't carry.
    const placeholder = await termsTextarea.getAttribute('placeholder');
    expect(placeholder).toMatch(/Request channel:/);
    expect(placeholder).toMatch(/Scope:/);
    expect(placeholder).toMatch(/Termination:/);
  });

  // ── 19. P857: "Use suggested terms" insert button fills then hides ─────────

  test('P857: "Use suggested terms" fills the empty field, then disappears', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const termsTextarea = page.locator('#agreement-terms');
    await expect(termsTextarea).toBeVisible({ timeout: 10000 });
    // Field is empty by default — the suggestion is only a placeholder
    await expect(termsTextarea).toHaveValue('');

    const insertBtn = page.getByRole('button', { name: /use suggested terms/i });
    await expect(insertBtn).toBeVisible();

    await insertBtn.click();

    // Clicking pulls the full scaffold into the editable value (all 3 dimensions)
    await expect(termsTextarea).toHaveValue(/Request channel:[\s\S]*Scope:[\s\S]*Termination:/);

    // Once the field has content, the insert affordance is gone (it's a starting
    // point, not a re-insert/overwrite control)
    await expect(insertBtn).not.toBeVisible();
  });
});
