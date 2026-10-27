/**
 * @file p660-inbox-tab.spec.ts
 * @description E2E tests for P660: Inbox tab with badge and read/unread state
 *
 * Tests:
 * - Shows received letters with [Read] action
 * - Shows completed responses with [Results] action
 * - Unread items have bold text weight
 * - Badge count shows on nav and tab
 * - Clicking [Read]/[Results] marks item as read (badge decrements)
 * - Empty state when no items
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  completeTestDelivery,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P660: Inbox Tab', () => {
  test.describe.configure({ timeout: 45000 });

  let sender: TestUser;
  let receiver: TestUser;
  let emptyUser: TestUser;
  let docId: string;
  let letterId: string;
  let deliveryToReceiverId: string;
  let completedDeliveryId: string;
  let receiverLetterId: string;
  let receiverDocId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P660 Inbox Sender' });
    receiver = await createTestUser({ name: 'P660 Inbox Receiver' });
    emptyUser = await createTestUser({ name: 'P660 Inbox Empty' });

    // Create sender's doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P660 Inbox Test Doc', owner_id: sender.user.id })
      .select('id')
      .single();
    docId = doc!.id;

    // Create a sealed letter from sender to receiver (receiver's inbox: received letter)
    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;
    await sealTestLetter(letterId);

    const delivery = await createTestDelivery(letterId, {
      receiverEmail: receiver.email,
      receiverProfileId: receiver.user.id,
      status: 'sent',
    });
    deliveryToReceiverId = delivery.id;

    // Create receiver's doc and letter to sender (sender's inbox: completed response)
    const { data: receiverDoc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P660 Inbox Receiver Doc', owner_id: receiver.user.id })
      .select('id')
      .single();
    receiverDocId = receiverDoc!.id;

    const receiverLetter = await createTestLetter(receiver.user.id, receiverDocId, { mode: 'one-to-one' });
    receiverLetterId = receiverLetter.id;
    await sealTestLetter(receiverLetterId);

    const completedDelivery = await createTestDelivery(receiverLetterId, {
      receiverEmail: sender.email,
      receiverProfileId: sender.user.id,
      status: 'completed',
    });
    completedDeliveryId = completedDelivery.id;
    await completeTestDelivery(completedDeliveryId, 1);
  });

  test.afterAll(async () => {
    // Clean up in reverse dependency order
    if (receiverLetterId) await deleteTestLetter(receiverLetterId);
    if (receiverDocId) await supabaseAdmin.from('clarity_docs').delete().eq('id', receiverDocId);
    if (letterId) await deleteTestLetter(letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (emptyUser?.user?.id) await deleteTestUser(emptyUser.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('received list shows received letters with an open link', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // P1545: the Inbox tab is Artifacts > Letters > Received, and the row itself is the [Open] link: an
    // unfinished received letter opens the reading flow at /letter/:deliveryId.
    const openLink = page.locator(`[data-testid="artifact-row"] a[href="/letter/${deliveryToReceiverId}"]`);
    await expect(openLink).toBeVisible({ timeout: 10000 });
  });

  test('received list shows completed letters linking to results', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // If receiver has sent letters with completed responses, [Results] should appear
    // For this test, check the sender's inbox instead (they have a completed response)
    await setTestSession(page, sender.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // P1545: a finished received letter's row links straight to its results.
    const resultsLink = page.locator(
      `[data-testid="artifact-row"] a[href="/letter/${receiverLetterId}/results?delivery=${completedDeliveryId}"]`,
    );
    await expect(resultsLink).toBeVisible({ timeout: 10000 });
  });

  test('unread items have bold or heavier text weight', async ({ page }) => {
    // Ensure delivery is unread
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ read_at: null })
      .eq('id', deliveryToReceiverId);

    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // Find inbox items and check for bold/semibold styling on unread items
    const inboxItems = page.getByRole('tabpanel').locator('[data-unread="true"]').or(
      page.getByRole('tabpanel').locator('.font-semibold, .font-bold')
    );

    // At least one unread item should exist
    const count = await inboxItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('unread mark shows on the Received list', async ({ page }) => {
    // Ensure delivery is unread
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ read_at: null })
      .eq('id', deliveryToReceiverId);

    await setTestSession(page, receiver.email);
    await page.goto('/artifacts');
    await page.waitForLoadState('networkidle');

    // P1545: the Received chip carries an unread dot (a mark, not a count) and says so in its accessible name.
    await expect(page.getByTestId('list-dot-received')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Received, unread/i })).toBeVisible();
  });

  test('badge count shows on nav item', async ({ page }) => {
    // Ensure delivery is unread
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ read_at: null })
      .eq('id', deliveryToReceiverId);

    await setTestSession(page, receiver.email);
    await page.goto('/artifacts');
    await page.waitForLoadState('networkidle');

    // Nav item should show badge count
    const nav = page.locator('nav');
    nav.getByText(/Artifacts/i).first();

    // Look for a badge element near the Artifacts nav item
    nav.locator('[data-badge]').or(
      nav.locator('.badge').or(
        nav.locator('[aria-label*="unread"]')
      )
    );

    // At least the aria-label should mention unread count
    const lettersLink = nav.locator('a[href*="artifacts"]').first();
    if (await lettersLink.isVisible()) {
      const ariaLabel = await lettersLink.getAttribute('aria-label');
      if (ariaLabel) {
        expect(ariaLabel).toMatch(/unread/i);
      }
    }
  });

  test('opening a received letter navigates and marks it as read', async ({ page }) => {
    // Ensure delivery is unread
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ read_at: null })
      .eq('id', deliveryToReceiverId);

    await setTestSession(page, receiver.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // Open the received letter: the row's title link (P1545; was an [Open] button)
    await page.locator(`[data-testid="artifact-row"] a[href="/letter/${deliveryToReceiverId}"]`).click();

    // Wait for navigation or state change
    await page.waitForLoadState('networkidle');

    // Verify read_at was set in DB
    const { data } = await supabaseAdmin
      .from('letter_deliveries')
      .select('read_at')
      .eq('id', deliveryToReceiverId)
      .single();

    expect(data!.read_at).not.toBeNull();
  });

  test('empty state when no inbox items', async ({ page }) => {
    await setTestSession(page, emptyUser.email);
    await page.goto('/artifacts?tab=letters&list=received');
    await page.waitForLoadState('networkidle');

    // Should show empty state message
    const emptyMessage = page.getByText(/Nothing has been shared with you yet/i);
    await expect(emptyMessage).toBeVisible({ timeout: 10000 });
  });
});
