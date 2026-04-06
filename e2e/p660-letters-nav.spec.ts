/**
 * @file p660-letters-nav.spec.ts
 * @description E2E tests for P660: Navigation rename and tab switching
 *
 * Tests:
 * - Nav shows "Letters" instead of "Docs"
 * - Default tab is Drafts
 * - Tab switching (Drafts / Sent / Inbox) updates URL
 * - Legacy redirects: /docs -> /letters?tab=drafts, /d/:id -> /letters/drafts/:id
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';

test.describe('P660: Letters Navigation & Tab Switching', () => {
  test.describe.configure({ timeout: 30000 });

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P660 Nav Test User' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('nav shows "Letters" instead of "Docs"', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Bottom nav should contain "Letters" (or "Clarity Letters" on desktop)
    const nav = page.locator('nav');
    await expect(nav.getByText(/Letters/)).toBeVisible();

    // "Docs" should not appear in nav
    const docsLink = nav.getByText('Docs', { exact: true });
    await expect(docsLink).not.toBeVisible();
  });

  test('default tab is Drafts when no tab param', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Drafts tab should be active
    const draftsTab = page.getByRole('tab', { name: /Drafts/i });
    await expect(draftsTab).toHaveAttribute('aria-selected', 'true');
  });

  test('tab switching updates URL param', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Switch to Sent tab
    const sentTab = page.getByRole('tab', { name: /Sent/i });
    await sentTab.click();
    await expect(page).toHaveURL(/[?&]tab=sent/);

    // Switch to Inbox tab
    const inboxTab = page.getByRole('tab', { name: /Inbox/i });
    await inboxTab.click();
    await expect(page).toHaveURL(/[?&]tab=inbox/);

    // Switch back to Drafts
    const draftsTab = page.getByRole('tab', { name: /Drafts/i });
    await draftsTab.click();
    await expect(page).toHaveURL(/[?&]tab=drafts/);
  });

  test('all three tabs render content areas', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Drafts tab panel should be visible by default
    const draftsPanel = page.getByRole('tabpanel');
    await expect(draftsPanel).toBeVisible();

    // Switch to Sent — panel should update
    await page.getByRole('tab', { name: /Sent/i }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();

    // Switch to Inbox — panel should update
    await page.getByRole('tab', { name: /Inbox/i }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });

  test('/docs redirects to /letters?tab=drafts', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/docs');
    await page.waitForLoadState('networkidle');

    // Should redirect to /letters with drafts tab
    await expect(page).toHaveURL(/\/letters/);
    const draftsTab = page.getByRole('tab', { name: /Drafts/i });
    await expect(draftsTab).toHaveAttribute('aria-selected', 'true');
  });

  test('/d/:id redirects to /letters/drafts/:id', async ({ page }) => {
    await setTestSession(page, user.email);

    // Create a doc to have a valid ID
    const { supabaseAdmin } = await import('./helpers/supabase-admin');
    let docId: string | undefined;

    try {
      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ title: 'P660 redirect test doc', owner_id: user.user.id })
        .select('id')
        .single();
      docId = doc!.id;

      await page.goto(`/d/${docId}`);
      await page.waitForLoadState('networkidle');

      // Should redirect to /letters/drafts/:id
      await expect(page).toHaveURL(new RegExp(`/letters/drafts/${docId}`));
    } finally {
      if (docId) {
        await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
      }
    }
  });

  test('browser back/forward navigates between tab states', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    // Navigate to Sent
    await page.getByRole('tab', { name: /Sent/i }).click();
    await expect(page).toHaveURL(/[?&]tab=sent/);

    // Navigate to Inbox
    await page.getByRole('tab', { name: /Inbox/i }).click();
    await expect(page).toHaveURL(/[?&]tab=inbox/);

    // Go back — should return to Sent
    await page.goBack();
    await expect(page).toHaveURL(/[?&]tab=sent/);

    // Go back again — should return to Drafts
    await page.goBack();
    await expect(page).toHaveURL(/[?&]tab=drafts/);

    // Go forward — should go to Sent
    await page.goForward();
    await expect(page).toHaveURL(/[?&]tab=sent/);
  });
});
