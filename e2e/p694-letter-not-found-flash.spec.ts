/**
 * @file p694-letter-not-found-flash.spec.ts
 * @description P694: Regression test — "Letter not found" must never flash on cold-load.
 *
 * Symptom: Recipients briefly see "Letter not found" (~500ms) before the letter cover
 * renders. The letter loads successfully — the error state is transient.
 *
 * Root cause: load useEffect re-fires on currentUser?.id change (auth hydration race)
 * with no cancellation, so a stale run can call setPageState('invalid') after the
 * successful run has already set 'ready'.
 *
 * This test installs a MutationObserver that throws if "Letter not found" appears at
 * any point during load — before OR after the cover is visible.
 */

import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { createTestDelivery, deleteTestLetter } from './helpers/test-letter';

test.describe('P694: No "Letter not found" flash on cold-load', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let anonReceiver: TestUser;
  let authReceiver: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;
  let anonDeliveryId: string;
  let anonToken: string;
  let authDeliveryId: string;
  let authToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P694 Sender' });
    anonReceiver = await createTestUser({ name: 'P694 Anon Receiver' });
    authReceiver = await createTestUser({ name: 'P694 Auth Receiver' });

    // Create doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P694 Test Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create story
    const story = await createTestStory(sender.user.id, {
      title: 'P694 Test Story',
      content: 'Test content for flash regression.',
    });
    storyId = story.id;

    // Create point
    const point = await createTestPoint(sender.user.id, {
      statement: 'Clarity matters more than speed.',
    });
    pointId = point.id;

    // Link story to doc and point to story
    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId, story_id: storyId, position: 0,
    });
    await supabaseAdmin.from('story_points').insert({
      story_id: storyId, point_id: pointId,
    });

    // Get story version
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Version not found');

    // Create sealed letter
    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    // Create snapshot with denormalized content
    await supabaseAdmin.from('letter_story_snapshots').insert({
      letter_id: letterId,
      story_id: storyId,
      version_id: version.id,
      position: 0,
      visibility: 'public',
      point_config: {
        storyText: 'Test content for flash regression.',
        storyTitle: 'P694 Test Story',
        points: [
          {
            id: pointId,
            text: 'Clarity matters more than speed.',
            authorPosition: 'agree',
          },
        ],
      },
    });

    // Delivery for anonymous path
    const anonDelivery = await createTestDelivery(letterId, {
      receiverEmail: anonReceiver.email,
      invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    anonDeliveryId = anonDelivery.id;
    anonToken = anonDelivery.invitationToken;

    // Prediction for anon delivery
    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      delivery_id: anonDeliveryId,
      story_id: storyId,
      prediction: 7,
    });

    // Delivery for authenticated path
    const authDelivery = await createTestDelivery(letterId, {
      receiverEmail: authReceiver.email,
      receiverProfileId: authReceiver.user.id,
      invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    authDeliveryId = authDelivery.id;
    authToken = authDelivery.invitationToken;

    // Prediction for auth delivery
    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      delivery_id: authDeliveryId,
      story_id: storyId,
      prediction: 7,
    });
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    await supabaseAdmin.from('story_points').delete().eq('story_id', storyId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (anonReceiver?.user?.id) await deleteTestUser(anonReceiver.user.id);
    if (authReceiver?.user?.id) await deleteTestUser(authReceiver.user.id);
  });

  /**
   * Registers an init script that installs a MutationObserver on every page load
   * (including navigations). The observer sets __p694_notFoundFlash=true if the
   * "Letter not found" heading ever appears — even transiently for a few hundred ms.
   *
   * Must be called BEFORE the first navigation to the letter page.
   * Uses addInitScript so the script runs before React mounts on each navigation.
   */
  async function installNotFoundGuard(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // Run after DOM is ready
      document.addEventListener('DOMContentLoaded', () => {
        (window as Record<string, unknown>).__p694_notFoundFlash = false;
        const observer = new MutationObserver(() => {
          const headings = document.querySelectorAll('h1, h2, h3, [role="heading"]');
          for (const h of headings) {
            if (h.textContent?.toLowerCase().includes('letter not found')) {
              (window as Record<string, unknown>).__p694_notFoundFlash = true;
              observer.disconnect();
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      });
    });
  }

  async function assertNoNotFoundFlash(page: Page): Promise<void> {
    const flashed = await page.evaluate(() =>
      (window as Record<string, unknown>).__p694_notFoundFlash
    );
    expect(flashed, '"Letter not found" appeared transiently during load — flash bug present').toBe(false);
  }

  // ── 1. Anonymous receiver: no flash on cold-load ─────────────────────────

  test('anonymous receiver: no "Letter not found" flash on cold-load', async ({ page }) => {
    // Install guard before any navigation — addInitScript persists across page loads
    await installNotFoundGuard(page);

    // No setTestSession — anonymous path
    // Direct navigation = cold-load (no prior session warmup)
    await page.goto(`/letter/${anonDeliveryId}?token=${anonToken}`);

    // Wait for cover to appear
    await expect(
      page.getByRole('button', { name: /open the letter/i })
    ).toBeVisible({ timeout: 15000 });

    // Assert "Letter not found" never appeared at any point during load
    await assertNoNotFoundFlash(page);

    // Also assert we're NOT currently showing the error state
    await expect(
      page.getByRole('heading', { name: /letter not found/i })
    ).not.toBeVisible();
  });

  // ── 2. Authenticated receiver: no flash on cold-load ─────────────────────

  test('authenticated receiver: no "Letter not found" flash on cold-load', async ({ page }) => {
    // Install guard before any navigation
    await installNotFoundGuard(page);

    // setTestSession navigates to '/' internally to inject the session cookie,
    // then we navigate to the letter page — this is the auth hydration race scenario
    await setTestSession(page, authReceiver.email);

    // Hard navigate to letter (cold-load with existing session = auth hydration race scenario)
    await page.goto(`/letter/${authDeliveryId}?token=${authToken}`);

    // Wait for cover to appear
    await expect(
      page.getByRole('button', { name: /open the letter/i })
    ).toBeVisible({ timeout: 15000 });

    // Wait for auth hydration to fully complete (covers the race window where
    // currentUser?.id changes after sessionChecked=true, triggering a second load run).
    await page.waitForTimeout(1000);

    // Assert "Letter not found" never appeared at any point during load
    await assertNoNotFoundFlash(page);

    // Also assert we're NOT currently showing the error state
    await expect(
      page.getByRole('heading', { name: /letter not found/i })
    ).not.toBeVisible();
  });
});
