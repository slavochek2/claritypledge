/**
 * @file p885-partners-nav.spec.ts
 * @description E2E tests for P885: "Partners" navigation item with invitation badge.
 *
 * Coverage:
 * - smoke: browse page loads for a logged-in user with the bottom nav visible
 * - Mobile bottom nav shows 5 items in order: Home, Feed, Groups, Letters, Me (P1512; was Home,
 *   Letters, Partners, Events, My Profile — Partners now lives in the Me sheet)
 * - Opening Me and tapping Partners opens /p/{slug}/partners with active state
 * - Badge shows seeded incoming-invitation count (on the Me tab and the sheet's Partners row);
 *   partners page section matches (parity)
 * - Badge hidden when count is 0
 * - 320px: all 5 tabs fit without horizontal overflow, touch targets >= 40px
 * - Desktop sidebar (P1512; was the top nav) shows a Partners entry for logged-in users
 *
 * Rules:
 * - Smoke check is the FIRST test in this file (tests.md convention)
 * - Auth coverage via setTestSession (auth E2E coverage rule)
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';
import { supabaseAdmin } from './helpers/supabase-admin';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const NARROW_VIEWPORT = { width: 320, height: 650 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe('P885 — Partners nav item with invitation badge', () => {
  test.setTimeout(60000);

  let invitee: TestUser;
  let creator: TestUser;
  const agreementIds: string[] = [];

  test.beforeAll(async () => {
    invitee = await createTestUser({ name: 'P885 Invitee' });
    creator = await createTestUser({ name: 'P885 Creator' });
    // P880 transition shim: while the P880 trust-column guard is in flight, main's
    // createTestUser cannot self-verify via upsert_my_profile (the test-DB guard
    // strips is_verified). Service-role write is the server-controlled path and
    // sticks both before and after P880 ships; once P880's helper fix (verify via
    // mark_self_verified) lands on main, this is a harmless no-op re-set.
    const { error: verifyError } = await supabaseAdmin
      .from('profiles')
      .update({ is_verified: true })
      .in('id', [invitee.user.id, creator.user.id]);
    if (verifyError) throw new Error(`P880 shim failed to verify test users: ${verifyError.message}`);
  });

  test.afterAll(async () => {
    for (const id of agreementIds) await deleteTestAgreement(id);
    if (invitee?.user?.id) await deleteTestUser(invitee.user.id);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  test.describe('mobile bottom nav', () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test('smoke: browse page loads logged-in with bottom nav and no console errors', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await setTestSession(page, invitee.email);
      await page.goto('/feed');

      const nav = page.locator('[data-nav="bottom"]');
      await expect(nav).toBeVisible({ timeout: 10000 });
      expect(consoleErrors).toEqual([]);
    });

    test('shows 5 items in order: Home, Feed, Groups, Letters, Me', async ({ page }) => {
      await setTestSession(page, invitee.email);
      await page.goto('/feed');

      const nav = page.locator('[data-nav="bottom"]');
      await expect(nav).toBeVisible({ timeout: 10000 });
      // The Me tab holds its slot while the profile loads (P1421); wait for the real one.
      await expect(page.getByTestId('bottom-nav-me')).toBeVisible({ timeout: 10000 });
      const labels = await nav.locator('a span.text-xs, button[data-testid="bottom-nav-me"] span.text-xs').allTextContents();
      // span.text-xs is the label element on each tab
      expect(labels.filter((l) => l.trim().length > 0)).toEqual([
        'Home',
        'Feed',
        'Groups',
        'Letters',
        'Me',
      ]);
    });

    test('tapping Me then Partners opens /p/{slug}/partners with active state; badge hidden at 0', async ({ page }) => {
      await setTestSession(page, invitee.email);
      await page.goto('/feed');

      const meTab = page.getByTestId('bottom-nav-me');
      await expect(meTab).toBeVisible({ timeout: 10000 });
      await meTab.click();
      const partnersRow = page.getByTestId('me-sheet').getByRole('link', { name: 'Partners' });
      await expect(partnersRow).toBeVisible({ timeout: 10000 });

      // No pending invitations yet → no badge, on the sheet row or the Me tab
      await expect(partnersRow.locator('[data-badge]')).toHaveCount(0);
      await expect(meTab.locator('[data-badge]')).toHaveCount(0);

      await partnersRow.click();
      await expect(page).toHaveURL(`/p/${invitee.slug}/partners`);

      // Active state: the sheet closed on arrival; reopening it shows Partners as the current page
      await page.getByTestId('bottom-nav-me').click();
      await expect(page.getByTestId('me-sheet').getByRole('link', { name: 'Partners' })).toHaveAttribute('aria-current', 'page');
    });

    test('badge shows incoming invitation count and matches the partners page section', async ({ page }) => {
      // Seed: creator invites the invitee (pending, unaccepted, non-expired)
      const agreement = await createTestAgreement(creator.user.id, invitee.email);
      agreementIds.push(agreement.id);

      await setTestSession(page, invitee.email);
      await page.goto('/feed');

      // Partners lives behind Me, so its pending-invite count rides on the Me tab
      const meTab = page.getByTestId('bottom-nav-me');
      const tabBadge = meTab.locator('[data-badge]');
      await expect(tabBadge).toBeVisible({ timeout: 10000 });
      await expect(tabBadge).toHaveText('1');
      await expect(meTab).toHaveAttribute('aria-label', 'Me, 1 pending invitation');

      // …and on the Partners row inside the sheet
      await meTab.click();
      const partnersRow = page.getByTestId('me-sheet').getByRole('link', { name: /Partners/ });
      const badge = partnersRow.locator('[data-badge]');
      await expect(badge).toBeVisible({ timeout: 10000 });
      await expect(badge).toHaveText('1');

      // Parity: the page's "Invited to sign" section shows the same count
      await partnersRow.click();
      await expect(page).toHaveURL(`/p/${invitee.slug}/partners`);
      await expect(page.getByText('Invited to sign (1)')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('320px narrow viewport', () => {
    test.use({ viewport: NARROW_VIEWPORT });

    test('all 5 tabs fit without horizontal overflow and keep >= 40px touch targets', async ({ page }) => {
      await setTestSession(page, invitee.email);
      await page.goto('/feed');

      const nav = page.locator('[data-nav="bottom"]');
      await expect(nav).toBeVisible({ timeout: 10000 });

      // Four tab links plus the Me button (P1512)
      const tabs = nav.locator('a, button[data-testid="bottom-nav-me"]');
      await expect(tabs).toHaveCount(5);

      // No horizontal overflow: every tab's box stays inside the viewport
      for (let i = 0; i < 5; i++) {
        const box = await tabs.nth(i).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(NARROW_VIEWPORT.width + 1);
        // Touch target height >= 40px
        expect(box!.height).toBeGreaterThanOrEqual(40);
      }

      // The nav itself does not scroll horizontally
      const overflow = await nav.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });

  test.describe('desktop nav', () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test('logged-in desktop sidebar shows a Partners entry linking to the partners page', async ({ page }) => {
      await setTestSession(page, invitee.email);
      await page.goto('/feed');

      // P1512: the signed-in desktop navigation is the sidebar; the top nav is gone for signed-in people.
      const desktopPartners = page.locator('[data-nav="sidebar"]').getByRole('link', { name: 'Partners' });
      await expect(desktopPartners).toBeVisible({ timeout: 10000 });
      await expect(desktopPartners).toHaveAttribute('href', `/p/${invitee.slug}/partners`);
    });

    test('logged-out desktop nav has no Partners entry (Pledgers stays untouched)', async ({ page }) => {
      await page.goto('/feed');
      const mainNav = page.locator('[data-nav="main"]');
      await expect(mainNav).toBeVisible({ timeout: 10000 });
      await expect(mainNav.getByRole('link', { name: 'Partners', exact: true })).toHaveCount(0);
    });
  });
});
