/**
 * @file p884-add-recipient-ui.spec.ts
 * @description P884: UI-driven success path for add-recipient email scoping.
 *
 * The integration canary (e2e/integration/p884-reproduce.spec.ts) proves the
 * edge-function contract with direct fetches. This spec closes the UI gap:
 * p688-add-recipient-flow.spec.ts never completes a SUCCESSFUL submit (its only
 * submit test forces an RPC failure), so the real chain
 *   button click → addRecipientToSealed → invokeLetterEmails (session JWT)
 * was otherwise unexercised end-to-end.
 *
 * Asserts, after a real modal submit by a signed-in sender:
 *   1. Success toast appears
 *   2. The NEW delivery gets notified_at stamped (the function accepted the
 *      session-authenticated invoke and processed the new recipient)
 *   3. The prior recipient's notified_at is unchanged (not re-emailed)
 *   4. No console errors during the flow (AC: compose → seal → add-recipient)
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

async function getNotifiedAt(deliveryId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('letter_deliveries')
    .select('notified_at')
    .eq('id', deliveryId)
    .single();
  if (error) throw new Error(`notified_at lookup failed: ${error.message}`);
  return data.notified_at as string | null;
}

test.describe('P884: add-recipient UI submit — only the new recipient is emailed', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let docId: string;
  let letterId: string;
  let deliveryAId: string;
  let aNotifiedAt: string;
  let storyId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P884 UI Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P884 UI Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P884 UI Story',
      content: 'Test story for P884 UI flow.',
    });
    storyId = story.id;
    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;
    await createTestStorySnapshot(letterId, storyId, version?.id ?? storyId);

    // Prior recipient A — already emailed (stamped), as the P884 backfill
    // guarantees for every pre-existing delivery in prod.
    const deliveryA = await createTestDelivery(letterId, {
      receiverEmail: `p884-ui-a-${Date.now()}@example.com`,
    });
    deliveryAId = deliveryA.id;
    const stamped = new Date().toISOString();
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ notified_at: stamped })
      .eq('id', deliveryAId);
    aNotifiedAt = (await getNotifiedAt(deliveryAId))!;

    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (storyId) await deleteTestStory(storyId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('successful submit emails only the new recipient, no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await setTestSession(page, sender.email);
    await page.goto('/letters?tab=sent');
    await page.waitForLoadState('networkidle');

    // Open the ⋯ dropdown → "Add recipient(s)" (same path as p688)
    const moreBtn = page.getByRole('button', { name: /actions for/i }).first();
    await expect(moreBtn).toBeVisible({ timeout: 10000 });
    await moreBtn.click();
    await page.getByRole('menuitem', { name: /add recipient\(s\)/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 8000 });

    // Fill recipient B and submit — the REAL success path.
    const bEmail = `p884-ui-b-${Date.now()}@example.com`;
    await dialog.locator('input[type="email"]').first().fill(bEmail);
    await dialog.locator('input[placeholder="Full name"]').first().fill('P884 New Person');
    await dialog.getByRole('button', { name: 'Send Invitation' }).click();

    // 1. Success toast
    await expect(page.locator(`text=Invitation sent to ${bEmail}`)).toBeVisible({ timeout: 10000 });

    // 2. The new delivery exists and gets stamped by the session-authenticated
    //    invoke (fire-and-forget — poll until the edge function lands).
    const { data: bRows } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', letterId)
      .eq('receiver_email', bEmail);
    expect(bRows?.length, 'delivery row for B must exist after submit').toBe(1);
    const deliveryBId = bRows![0].id as string;

    await expect
      .poll(() => getNotifiedAt(deliveryBId), {
        message: 'delivery B must be stamped notified_at by the UI-triggered invoke',
        timeout: 20000,
      })
      .not.toBeNull();

    // 3. Prior recipient A untouched — not re-emailed, magic link not regenerated.
    expect(
      await getNotifiedAt(deliveryAId),
      'delivery A notified_at must be unchanged by the add-recipient submit'
    ).toBe(aNotifiedAt);

    // 4. AC: no console errors during the flow (would catch a 401/403 from the
    //    edge function surfacing via [letter-emails] console.error).
    expect(consoleErrors, `console errors during flow: ${consoleErrors.join(' | ')}`).toEqual([]);
  });
});
