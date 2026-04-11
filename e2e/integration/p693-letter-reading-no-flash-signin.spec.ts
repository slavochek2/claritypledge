/**
 * @file p693-letter-reading-no-flash-signin.spec.ts
 * @description P693: Regression — "Sign in to continue" must never flash during one-to-one letter open.
 *
 * Root cause: after verifyOtp resolves, setViewState('reading') fires while currentUser is
 * still null (AuthContext Effect 2 profile fetch pending). isAuthenticated={!!currentUser}
 * briefly hits the signed-out branch, flashing "Sign in to continue" before the profile arrives.
 *
 * Fix: use isAuthenticated={!!session} instead — session is set synchronously by Effect 1.
 *
 * Canary strategy:
 * - Install a MutationObserver via addInitScript (runs before page JS) to record if
 *   "Sign in to continue" ever appears in the DOM at any point during the flow.
 * - Click "Open the Letter" as an unauthenticated user (triggers edge function → verifyOtp → setViewState).
 * - Wait for rating UI to confirm we reached the reading phase.
 * - Assert the flag was never set.
 *
 * BEFORE fix: test FAILS (flash detected).
 * AFTER fix: test PASSES (session-based auth prevents flash).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import {
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

test.describe('P693: No flash of "Sign in to continue" during one-to-one letter open', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let invitationToken: string;

  // Unique per test run so cleanup is deterministic
  const receiverEmail = `p693-canary-${Date.now()}@claritypledge-test.example.com`;

  test.beforeAll(async () => {
    // 1. Sender
    sender = await createTestUser({ name: 'P693 Flash Sender' });

    // 2. Doc
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P693 Flash Doc' })
      .select('id')
      .single();
    if (docErr || !doc) throw new Error(`Doc creation failed: ${docErr?.message}`);
    docId = doc.id;

    // 3. Story
    const story = await createTestStory(sender.user.id, {
      title: 'P693 Flash Story',
      content: 'Regression story for flash-signin canary test.',
    });
    storyId = story.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    // 4. Letter
    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    // 5. Snapshot — resolve latest story version
    const { data: version, error: vErr } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (vErr || !version) throw new Error(`Story version not found: ${vErr?.message}`);

    await supabaseAdmin.from('letter_story_snapshots').insert({
      letter_id: letterId,
      story_id: storyId,
      version_id: version.id,
      position: 0,
      visibility: 'public',
      point_config: {
        storyText: 'Regression story for flash-signin canary test.',
        storyTitle: 'P693 Flash Story',
        points: [],
      },
    });

    // 6. Delivery (anonymous receiver — edge function will create the auth user)
    const delivery = await createTestDelivery(letterId, { receiverEmail });
    invitationToken = delivery.invitationToken;

    // 7. Prediction (delivery-specific for one-to-one)
    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      delivery_id: delivery.id,
      story_id: storyId,
      prediction: 7,
    });

    // 8. Seal
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    // Clean up auth user created by the edge function during the test
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const edgeFnUser = listData?.users?.find((u) => u.email === receiverEmail);
    if (edgeFnUser) {
      await supabaseAdmin.auth.admin.deleteUser(edgeFnUser.id);
    }

    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test(
    'P693 canary: "Sign in to continue" never appears during one-to-one letter open with token',
    async ({ page }) => {
      // Install DOM watcher BEFORE the page JS loads.
      // MutationObserver records whether "Sign in to continue" ever entered the DOM.
      await page.addInitScript(() => {
        (window as unknown as Record<string, unknown>)['__p693_signInFlashDetected'] = false;

        const checkNode = (node: Node) => {
          if (node.textContent?.includes('Sign in to continue')) {
            (window as unknown as Record<string, unknown>)['__p693_signInFlashDetected'] = true;
          }
        };

        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            m.addedNodes.forEach(checkNode);
            if (m.type === 'characterData') checkNode(m.target);
          }
        });

        const startObserver = () => {
          const root = document.body ?? document.documentElement;
          observer.observe(root, { childList: true, subtree: true, characterData: true });
          // Also check existing content in case the element is already rendered
          checkNode(root);
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', startObserver);
        } else {
          startObserver();
        }
      });

      // Navigate as unauthenticated user
      await page.goto(`/letter/${letterId}?token=${invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Cover must be visible
      await expect(page.locator('text=/A Clarity Letter/i')).toBeVisible({ timeout: 10000 });

      // Click "Open the Letter" — triggers handleOneToOneOpen:
      //   edge function → verifyOtp → session set (Effect 1) → setViewState('reading')
      //   (AuthContext Effect 2 profile fetch still pending at this point)
      const openButton = page.getByRole('button', { name: /Open the Letter/i });
      await expect(openButton).toBeEnabled({ timeout: 5000 });
      await openButton.click();

      // Wait for rating UI — proves we reached viewState='reading' with isAuthenticated=true
      // Timeout is generous because the edge function does network work (account creation).
      await expect(
        page.getByText(/How well do you believe you understand this story/i)
      ).toBeVisible({ timeout: 40000 });

      // Check the canary flag: was "Sign in to continue" ever in the DOM?
      const flashDetected = await page.evaluate(
        () => (window as unknown as Record<string, unknown>)['__p693_signInFlashDetected'] as boolean
      );

      expect(
        flashDetected,
        '"Sign in to continue" was detected in the DOM — P693 flash regression is present. ' +
        'Fix: use isAuthenticated={!!session} instead of {!!currentUser} in letter-reading-page.tsx:474.'
      ).toBe(false);
    }
  );
});
