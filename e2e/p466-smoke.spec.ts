/**
 * @file p466-smoke.spec.ts
 * @description Smoke tests for P466: Agreement Creation — HelloSign Redesign.
 *
 * Verifies the three main pages load without JS crashes:
 *   1. /agreements/new (create-agreement-page) — authenticated creator
 *   2. /agreements/:id/accept?token=... (accept-agreement-page) — authenticated partner
 *   3. /agreements/:id (agreement-page) — pending state with partner_display_name
 *
 * These tests run before the full E2E and accessibility suites to catch
 * render crashes quickly. The smoke gate passes if:
 *   - The page navigates without 5xx errors
 *   - No uncaught JS errors in the console
 *   - Key content is visible (certificate frame renders)
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement, type TestAgreement } from './helpers/test-agreement';
import { supabaseAdmin } from '../src/lib/supabase-admin';

test.describe('P466 Smoke Tests — Create, Accept, and Agreement Pages', () => {
  test.setTimeout(60000);

  let creator: TestUser;
  let partner: TestUser;
  let pendingAgreement: TestAgreement;
  let activeAgreement: TestAgreement;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P466Smoke Creator' });
    partner = await createTestUser({ name: 'P466Smoke Partner' });

    pendingAgreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending',
      visibility: 'private',
    });
    await supabaseAdmin
      .from('clarity_agreements')
      .update({ partner_display_name: 'P466 Smoke Test Name' })
      .eq('id', pendingAgreement.id);

    activeAgreement = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });
    await supabaseAdmin
      .from('clarity_agreements')
      .update({ partner_display_name: 'P466 Active Display Name' })
      .eq('id', activeAgreement.id);
  });

  test.afterAll(async () => {
    if (pendingAgreement?.id) await deleteTestAgreement(pendingAgreement.id);
    if (activeAgreement?.id) await deleteTestAgreement(activeAgreement.id);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
    if (partner?.user?.id) await deleteTestUser(partner.user.id);
  });

  // ── Create page smoke ─────────────────────────────────────────────────────

  test('create-agreement-page loads without JS errors and renders certificate', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // No JS crashes
    expect(
      consoleErrors,
      `Console errors on create-agreement-page: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);

    // Certificate content renders
    await expect(page.getByText(/Clarity Partner Agreement/i).first()).toBeVisible({ timeout: 10000 });

    // Creator name auto-populated
    await expect(page.getByText('P466Smoke Creator')).toBeVisible({ timeout: 5000 });
  });

  test('create-agreement-page has an editable partner name input', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // The editable slot must be present (this is the core P466 addition)
    const partnerSlot = page.locator('input[aria-label*="partner" i][aria-label*="name" i]')
      .or(page.getByRole('textbox', { name: /partner.*full name|partner.*name/i }))
      .or(page.locator('input[placeholder*="partner" i]'));
    await expect(partnerSlot).toBeVisible({ timeout: 10000 });
  });

  test('create-agreement-page renders pledge text inside certificate', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/We all crave being understood/i)).toBeVisible({ timeout: 10000 });
  });

  // ── Accept page smoke ─────────────────────────────────────────────────────

  test('accept-agreement-page loads without JS errors and renders certificate', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, partner.email);
    await page.goto(`/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`);
    await page.waitForLoadState('networkidle');

    expect(
      consoleErrors,
      `Console errors on accept-agreement-page: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);

    await expect(page.getByText(/We all crave being understood/i)).toBeVisible({ timeout: 10000 });
  });

  test('accept-agreement-page shows partner_display_name in certificate', async ({ page }) => {
    await setTestSession(page, partner.email);
    await page.goto(`/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // Either the editable slot shows the pre-filled value, or the name appears as text
    await expect(
      page.getByText(/P466 Smoke Test Name/i).or(
        page.locator('input[value="P466 Smoke Test Name"]')
      ).first()
    ).toBeVisible({ timeout: 10000 });
  });

  // ── Agreement page smoke ──────────────────────────────────────────────────

  test('agreement-page (pending with partner_display_name) loads without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${pendingAgreement.id}`);
    await page.waitForLoadState('networkidle');

    expect(
      consoleErrors,
      `Console errors on agreement-page (pending): ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('agreement-page (pending) shows partner_display_name (not "Invited party")', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${pendingAgreement.id}`);
    await page.waitForLoadState('networkidle');

    // P466 requirement: stored name shown instead of "Invited party"
    await expect(page.getByText('P466 Smoke Test Name')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Invited party')).not.toBeVisible({ timeout: 3000 });
  });

  test('agreement-page (active with partner_display_name) loads without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${activeAgreement.id}`);
    await page.waitForLoadState('networkidle');

    expect(
      consoleErrors,
      `Console errors on agreement-page (active): ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('agreement-page (active) shows profile name (overrides partner_display_name per fallback chain)', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${activeAgreement.id}`);
    await page.waitForLoadState('networkidle');

    // Fallback chain: partner.name > partnerDisplayName
    // Since partner has a profile name ('P466Smoke Partner'), it should be shown
    await expect(page.getByText('P466Smoke Partner')).toBeVisible({ timeout: 10000 });
  });
});
