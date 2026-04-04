/**
 * P551 Smoke Tests — Clarity Docs
 *
 * Fast regression detection: doc routes load without crashing.
 * These tests run against the deployed app (not DB directly).
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  generateTestEmail,
} from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

// ===========================================================================
// Authenticated smoke tests
// ===========================================================================

test.describe('P551: Smoke — /docs route', () => {
  let userId: string;
  let userEmail: string;

  test.beforeAll(async () => {
    userEmail = generateTestEmail();
    const user = await createTestUser({ email: userEmail, name: 'P551 Smoke' });
    userId = user.user.id;
  });

  test.afterAll(async () => {
    // Clean up docs created during tests
    await supabaseAdmin.from('clarity_docs').delete().eq('owner_id', userId);
    await deleteTestUser(userId);
  });

  test('/docs loads for authenticated user without errors', async ({ page }) => {
    await setTestSession(page, userEmail);
    await page.goto('/docs');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    // Should not show an error page or crash
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toMatch(/error|500|crash|unexpected/i);
  });

  test('/docs redirects unauthenticated user', async ({ page }) => {
    await page.goto('/docs');
    await page.waitForLoadState('networkidle');

    // Should redirect to login or show auth gate
    const url = page.url();
    const _hasAuthGate = url.includes('/login') ||
      url.includes('/signup') ||
      url.includes('/auth') ||
      url === page.url(); // May show inline auth gate

    // Either redirected or page shows sign-in prompt
    if (!url.includes('/docs')) {
      // Redirected — good
      expect(url).not.toContain('/docs');
    } else {
      // Stayed on /docs but should show auth prompt
      const authPrompt = page.getByText(/sign in|log in|create account/i);
      await expect(authPrompt).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('P551: Smoke — /d/:docId route', () => {
  let userId: string;
  let userEmail: string;
  let docId: string;

  test.beforeAll(async () => {
    userEmail = generateTestEmail();
    const user = await createTestUser({ email: userEmail, name: 'P551 SmokeDet' });
    userId = user.user.id;

    // Create a doc for the test
    const { data, error } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: userId,
        title: 'Smoke Test Doc',
        visibility: 'private',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`Failed to create smoke doc: ${error?.message}`);
    docId = data.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await deleteTestUser(userId);
  });

  test('/d/:validDocId loads for owner', async ({ page }) => {
    await setTestSession(page, userEmail);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('Smoke Test Doc')).toBeVisible({ timeout: 10000 });
  });

  test('/d/:invalidId shows not-found state', async ({ page }) => {
    await setTestSession(page, userEmail);
    await page.goto('/d/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    // Should show not found message
    const notFoundText = page.getByText(/not found|doesn't exist|no doc/i);
    await expect(notFoundText).toBeVisible({ timeout: 10000 });
  });

  test('/d/:invalidFormat shows error gracefully', async ({ page }) => {
    await setTestSession(page, userEmail);
    await page.goto('/d/not-a-valid-uuid');
    await page.waitForLoadState('networkidle');

    // Should not crash — show not found or error
    await expect(page.locator('body')).toBeVisible();
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toMatch(/500|unexpected error|crash/i);
  });
});
