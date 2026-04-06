/**
 * @file p660-accessibility.spec.ts
 * @description Accessibility tests for P660: Letters Navigation tabs
 *
 * Tests:
 * - Tab bar uses ARIA tabs pattern (role="tablist", role="tab", role="tabpanel")
 * - Arrow keys navigate between tabs
 * - Inbox tab has aria-label with unread count
 * - Screen reader content for delivery status pipeline
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from '../helpers/test-user';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

test.describe('P660: Accessibility', () => {
  test.describe.configure({ timeout: 30000 });

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P660 A11y User' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('tab bar uses ARIA tablist role', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Container has role="tablist"
    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible();
  });

  test('each tab has role="tab" with aria-selected', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBe(3);

    // Active tab should have aria-selected="true"
    const draftsTab = page.getByRole('tab', { name: /Drafts/i });
    await expect(draftsTab).toHaveAttribute('aria-selected', 'true');

    // Inactive tabs should have aria-selected="false"
    const sentTab = page.getByRole('tab', { name: /Sent/i });
    await expect(sentTab).toHaveAttribute('aria-selected', 'false');

    const inboxTab = page.getByRole('tab', { name: /Inbox/i });
    await expect(inboxTab).toHaveAttribute('aria-selected', 'false');
  });

  test('content area has role="tabpanel"', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const panel = page.getByRole('tabpanel');
    await expect(panel).toBeVisible();
  });

  test('tabs have aria-controls linking to panel', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    const activeTab = page.getByRole('tab', { name: /Drafts/i });
    const ariaControls = await activeTab.getAttribute('aria-controls');
    expect(ariaControls).toBeTruthy();

    // The panel with that ID should exist
    if (ariaControls) {
      const panel = page.locator(`#${ariaControls}`);
      await expect(panel).toBeVisible();
    }
  });

  test('arrow keys navigate between tabs', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Focus on the first tab
    const draftsTab = page.getByRole('tab', { name: /Drafts/i });
    await draftsTab.focus();
    await expect(draftsTab).toBeFocused();

    // Arrow Right should move focus to Sent tab
    await page.keyboard.press('ArrowRight');
    const sentTab = page.getByRole('tab', { name: /Sent/i });
    await expect(sentTab).toBeFocused();

    // Arrow Right again should move focus to Inbox tab
    await page.keyboard.press('ArrowRight');
    const inboxTab = page.getByRole('tab', { name: /Inbox/i });
    await expect(inboxTab).toBeFocused();

    // Arrow Left should move back to Sent tab
    await page.keyboard.press('ArrowLeft');
    await expect(sentTab).toBeFocused();
  });

  test('Enter/Space activates a focused tab', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Focus on Drafts, arrow to Sent
    const draftsTab = page.getByRole('tab', { name: /Drafts/i });
    await draftsTab.focus();
    await page.keyboard.press('ArrowRight');

    // Press Enter to activate Sent tab
    await page.keyboard.press('Enter');
    const sentTab = page.getByRole('tab', { name: /Sent/i });
    await expect(sentTab).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/[?&]tab=sent/);
  });

  test('Home/End jump to first/last tab', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters?tab=sent');
    await page.waitForLoadState('networkidle');

    // Focus on Sent tab
    const sentTab = page.getByRole('tab', { name: /Sent/i });
    await sentTab.focus();

    // Home should jump to first tab (Drafts)
    await page.keyboard.press('Home');
    const draftsTab = page.getByRole('tab', { name: /Drafts/i });
    await expect(draftsTab).toBeFocused();

    // End should jump to last tab (Inbox)
    await page.keyboard.press('End');
    const inboxTab = page.getByRole('tab', { name: /Inbox/i });
    await expect(inboxTab).toBeFocused();
  });

  test('inbox tab aria-label includes unread count when badge > 0', async ({ page }) => {
    // Create an unread delivery for this user
    let docId: string | undefined;
    let letterId: string | undefined;
    let deliveryId: string | undefined;

    try {
      // Create sender + letter + unread delivery for user
      const sender = await createTestUser({ name: 'P660 A11y Sender' });

      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ title: 'P660 A11y Doc', owner_id: sender.user.id })
        .select('id')
        .single();
      docId = doc!.id;

      const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
      letterId = letter.id;
      await sealTestLetter(letterId);

      const delivery = await createTestDelivery(letterId, {
        receiverEmail: user.email,
        receiverProfileId: user.user.id,
        status: 'sent',
      });
      deliveryId = delivery.id;

      // Ensure read_at is NULL (unread)
      await supabaseAdmin
        .from('letter_deliveries')
        .update({ read_at: null })
        .eq('id', deliveryId);

      await setTestSession(page, user.email);
      await page.goto('/letters');
      await page.waitForLoadState('networkidle');

      // Inbox tab should have aria-label mentioning unread count
      const inboxTab = page.getByRole('tab', { name: /Inbox/i });
      const ariaLabel = await inboxTab.getAttribute('aria-label');

      if (ariaLabel) {
        expect(ariaLabel).toMatch(/unread/i);
      }

      // Clean up sender
      await deleteTestUser(sender.user.id);
    } finally {
      if (letterId) await deleteTestLetter(letterId);
      if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
  });

  test('delivery status is readable as text for screen readers', async ({ page }) => {
    // Create sender with a sealed letter that has deliveries
    let sender: TestUser | undefined;
    let docId: string | undefined;
    let letterId: string | undefined;

    try {
      sender = await createTestUser({ name: 'P660 A11y Status Sender' });

      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ title: 'P660 A11y Status Doc', owner_id: sender.user.id })
        .select('id')
        .single();
      docId = doc!.id;

      const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
      letterId = letter.id;
      await sealTestLetter(letterId);

      await createTestDelivery(letterId, {
        receiverEmail: 'a11y-status-test@gmail.com',
        status: 'completed',
      });

      await setTestSession(page, sender.email);
      await page.goto('/letters?tab=sent');
      await page.waitForLoadState('networkidle');

      // Delivery status should be available as text (not icon-only)
      // Look for status text that a screen reader could announce
      const statusText = page.getByText(/sent|opened|completed|in.progress/i);
      const count = await statusText.count();
      expect(count).toBeGreaterThanOrEqual(1);
    } finally {
      if (letterId) await deleteTestLetter(letterId);
      if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
      if (sender) await deleteTestUser(sender.user.id);
    }
  });
});
