/**
 * @file p846-letter-chrome-cleanup.spec.ts
 * @description P846 canary tests — two independent chrome defects on /letter/* routes.
 *
 * Test 1 (p846-1): LegalFooter must NOT appear on /letter/* routes.
 *   Before fix: FAILS (footer IS in DOM — layout has no isLetterPage guard).
 *   After fix:  PASSES (footer suppressed for /letter/* in ClarityLandingLayoutInner).
 *
 * Test 2 (p846-2): LetterProgressBar must have sticky positioning during reading.
 *   Before fix: FAILS (no sticky ancestor — bar scrolls out of viewport).
 *   After fix:  PASSES (sticky wrapper added in letter-flow-content.tsx).
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import {
  createTestLetter,
  createTestStorySnapshot,
  createTestPrediction,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P846: Letter chrome cleanup', () => {
  test.describe.configure({ timeout: 60000 });

  // ---------------------------------------------------------------------------
  // Bug 1: LegalFooter renders on /letter/* routes
  // Root cause: ClarityLandingLayoutInner has no isLetterPage guard (line 86-90).
  // ---------------------------------------------------------------------------

  test('p846-1: LegalFooter must not appear on /letter/* routes', async ({ page }) => {
    // Navigate to any /letter/ URL — layout renders even for non-existent letters
    await page.goto('/letter/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('load');

    // Wait for React layout to hydrate (SimpleNavigation is always rendered on letter routes)
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // LegalFooter renders this copyright text exclusively — if attached to DOM, bug exists
    // Before fix: FAILS — footer IS in the DOM
    // After fix:  PASSES — footer is not rendered on /letter/* routes
    await expect(page.getByText('© 2026 The Clarity Pledge')).not.toBeAttached();
  });

  // ---------------------------------------------------------------------------
  // Bug 2: LetterProgressBar has no sticky positioning
  // Root cause: LetterProgressBar rendered inline in letter-flow-content.tsx:181
  // with no sticky container, so it scrolls out of view mid-letter.
  // ---------------------------------------------------------------------------

  test.describe('p846-2: progress bar sticky positioning', () => {
    let sender: TestUser;
    let receiver: TestUser;
    let storyId: string;
    let pointId: string;
    let docId: string;
    let letterId: string;
    let deliveryToken: string;

    test.beforeAll(async () => {
      sender = await createTestUser({ name: 'P846 Sender' });
      receiver = await createTestUser({ name: 'P846 Receiver' });

      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ owner_id: sender.user.id, title: 'P846 Test Doc', visibility: 'public' })
        .select('id')
        .single();
      if (!doc) throw new Error('Failed to create test doc');
      docId = doc.id;

      const story = await createTestStory(sender.user.id, { title: 'P846 Test Story' });
      storyId = story.id;

      const point = await createTestPoint(sender.user.id, {
        statement: 'P846 test point for sticky bar verification',
      });
      pointId = point.id;

      const { data: version } = await supabaseAdmin
        .from('story_versions')
        .select('id')
        .eq('story_id', storyId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();
      if (!version) throw new Error('No story version found for storyId: ' + storyId);

      const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
      letterId = letter.id;

      await createTestStorySnapshot(letterId, storyId, version.id, {
        position: 0,
        pointConfig: {
          points: [{ id: pointId, visibility: 'visible', statement: 'P846 test point', senderPosition: 'agree' }],
        },
      });

      const delivery = await createTestDelivery(letterId, {
        receiverEmail: receiver.email,
        receiverProfileId: receiver.user.id,
      });

      await createTestPrediction(letterId, storyId, 7, delivery.id);
      deliveryToken = delivery.invitationToken;
      await sealTestLetter(letterId);
    });

    test.afterAll(async () => {
      // Cleanup may fail if test setup did not complete — ignore errors here.
      try { await deleteTestLetter(letterId); } catch { /* noop */ }
      try { await deleteTestPoint(pointId); } catch { /* noop */ }
      try { await deleteTestStory(storyId); } catch { /* noop */ }
      try { await supabaseAdmin.from('clarity_docs').delete().eq('id', docId); } catch { /* noop */ }
      try { await deleteTestUser(receiver.user.id); } catch { /* noop */ }
      try { await deleteTestUser(sender.user.id); } catch { /* noop */ }
    });

    test('progress bar must have sticky positioning during letter reading', async ({ page }) => {
      // Authenticate the receiver before navigating — this avoids the anonymous
      // create-and-open-letter edge function path (which can fail with
      // "Unsupported terms version" in the test environment).
      await setTestSession(page, receiver.email);
      await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
      await page.waitForLoadState('networkidle');

      // Accept cover / start reading if present
      const startBtn = page.getByRole('button', { name: /start reading|begin|open.*letter/i });
      if (await startBtn.isVisible({ timeout: 5000 })) {
        await startBtn.click();
        await page.waitForLoadState('networkidle');
      }

      // Progress bar renders inside LetterFlowContent once reading begins
      const progressBar = page.getByRole('progressbar');
      await expect(progressBar).toBeVisible({ timeout: 10000 });

      // Walk the DOM tree from progressbar upward — any sticky/fixed ancestor keeps it in view.
      // Without a sticky ancestor, the bar scrolls out of viewport as the reader advances.
      const isStickyPositioned = await progressBar.evaluate(el => {
        let current: Element | null = el;
        while (current && current !== document.body) {
          const pos = window.getComputedStyle(current).position;
          if (pos === 'sticky' || pos === 'fixed') return true;
          current = current.parentElement;
        }
        return false;
      });

      // Before fix: false — no sticky ancestor, bar scrolls away → test FAILS
      // After fix:  true — sticky wrapper present, bar stays in view → test PASSES
      expect(isStickyPositioned).toBe(true);
    });
  });
});
