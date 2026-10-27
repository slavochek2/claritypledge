/**
 * @file p660-letters-nav.spec.ts
 * @description E2E tests for P660: Navigation rename and tab switching
 *
 * Tests:
 * - Nav shows "Artifacts" instead of "Docs"
 * - Default tab is Letters, list Drafts
 * - Tab switching (Letters / Canvases) and the list chips update the URL
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

  test('nav shows "Artifacts" and not "Docs"', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/artifacts');
    await page.waitForLoadState('networkidle');

    // P893: scope to the desktop nav — both the desktop nav and the
    // mobile bottom nav render the entry, so an unscoped locator('nav')
    // violates strict mode once both are hydrated.
    // P1512: for a signed-in person the desktop navigation is the sidebar (data-nav="sidebar").
    // P1545: its Letters entry became Artifacts (/artifacts).
    const mainNav = page.locator('nav[data-nav="sidebar"]');
    await expect(mainNav.getByRole('link', { name: /Artifacts/ })).toBeVisible();

    // "Docs" should not appear in either nav
    const docsLink = page.locator('nav').getByText('Docs', { exact: true });
    await expect(docsLink).not.toBeVisible();
  });

  // P1545: the default is the Letters tab (was Inbox since P725).
  test('default tab is Letters when no tab param', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/artifacts');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: 'Letters' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Drafts', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  // P1545: Drafts / Published / Inbox tabs became Letters | Canvases tabs, with Drafts · Sent · Received lists.
  test('tab switching updates URL param', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/artifacts');
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: 'Canvases' }).click();
    await expect(page).toHaveURL(/[?&]tab=canvases/);

    await page.getByRole('tab', { name: 'Letters' }).click();
    await expect(page).toHaveURL(/[?&]tab=letters/);

    // The list chips are written to the URL too
    await page.getByRole('button', { name: /^Sent/ }).click();
    await expect(page).toHaveURL(/[?&]list=sent/);
  });

  test('both tabs render content areas', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/artifacts');
    await page.waitForLoadState('networkidle');

    // Letters panel should be visible by default
    await expect(page.getByRole('tabpanel')).toBeVisible();

    // Switch to Canvases — panel should update
    await page.getByRole('tab', { name: 'Canvases' }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });

  test('/docs redirects to Artifacts > Letters > Drafts', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/docs');
    await page.waitForLoadState('networkidle');

    // P1545: the old Letters list is now the Artifacts page (Letters tab, Drafts list)
    await expect(page).toHaveURL(/\/artifacts\?tab=letters&list=drafts/);
    await expect(page.getByRole('tab', { name: 'Letters' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Drafts', exact: true })).toHaveAttribute('aria-pressed', 'true');
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

  // P1364 (founder-approved scope): tab clicks REPLACE, as on /feed and /stake, so browser
  // Back leaves the page in one step instead of walking back through the tabs. P1545 keeps this
  // for the Artifacts page (tabs and chips both replace).
  test('tab clicks add no Back steps: browser back leaves /artifacts, and forward returns to the last tab', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/feed');
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');

    // Navigate to Canvases
    await page.getByRole('tab', { name: 'Canvases' }).click();
    await expect(page).toHaveURL(/[?&]tab=canvases/);

    // One Back leaves the page
    await page.goBack();
    await expect(page).toHaveURL(/\/feed(\?|$)/);

    // Forward returns to the tab the reader left on
    await page.goForward();
    await expect(page).toHaveURL(/[?&]tab=canvases/);
  });
});
