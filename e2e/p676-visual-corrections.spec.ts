/**
 * @file p676-visual-corrections.spec.ts
 * @description What survives of P676 (Letter Reading Visual Corrections).
 *
 * P1217 RETIREMENT NOTE (2026-09-01): P676 is status: rejected, superseded_by p696,
 * and the letter flow was rebuilt again after that (P852 Round-H). Six of the seven
 * issues assert UI that no longer exists:
 *   - The letter flow no longer renders a Radix Drawer at all. Its primary action is
 *     LetterPrimaryCta (src/app/components/letters/letter-primary-cta.tsx), a pill in a
 *     pinned bottom bar measured by ResizeObserver in letter-flow-content.tsx. So the
 *     backdrop-transparency, sr-only drawer header, centered-h2, in-drawer Submit,
 *     pb-8 padding and scale-label assertions have no target.
 *   - The "Continue" rename is gone twice over: the labels are now "Lock in your
 *     position" / "Next point" / "Next chapter" / "Complete Letter"
 *     (letter-flow-content.tsx:640, 679, 850, 1028). "Submit Your Position" and
 *     "Submit My Rating", which p696 introduced, return 0 hits in src/.
 *   - "Pick your position first" survives only on story-detail-page.tsx:336, a
 *     different surface from the letter flow this file exercises.
 *   - The two /live regression tests were unconditional test.skip stubs.
 * Successor coverage: e2e/p696-letter-reading-polish.spec.ts and
 * e2e/a11y/p696-accessibility.spec.ts.
 *
 * WHAT IS KEPT, AND IT IS STALE, NOT LIVE: the position-badge overflow describe.
 * `overflow-hidden` on the LiveStoryCardExpanded container IS live
 * (live-story-card-expanded.tsx:115) and no other e2e spec asserts it. But both tests
 * still advance the flow by clicking /continue/i, which no longer matches any label,
 * so they hang. They need rewriting against the current labels — they are NOT expected
 * to pass as they stand. Listed for the rewrite pass, not deleted, because deleting
 * them drops the only guard on a fix that was made for a real visual defect.
 *
 * Existing P673 E2E tests (p673-letter-reading-flow.spec.ts) cover the functional flow.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { supabaseAdmin } from './helpers/supabase-admin';
import { deleteTestLetter } from './helpers/test-letter';

// ---------------------------------------------------------------------------
// Shared setup: create a sealed letter with 1 story + 2 points
// ---------------------------------------------------------------------------

async function createP676TestLetter(sender: TestUser) {
  // Create doc
  const { data: doc } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: sender.user.id, title: 'P676 Test Doc', visibility: 'public' })
    .select('id')
    .single();
  if (!doc) throw new Error('Doc creation failed');

  // Create story
  const story = await createTestStory(sender.user.id, {
    title: 'P676 visual test story',
    content: 'A story to verify drawer transparency, button styling, and card overflow behavior.',
  });

  // Create 2 points (triggers anti-point lead: 2+ visible → point-engage first)
  const p1 = await createTestPoint(sender.user.id, {
    statement: 'First point for visual testing.',
  });
  const p2 = await createTestPoint(sender.user.id, {
    statement: 'Second point for visual testing.',
  });

  // Link story→doc, points→story
  await supabaseAdmin.from('doc_stories').insert({ doc_id: doc.id, story_id: story.id, position: 0 });
  await supabaseAdmin.from('story_points').insert([
    { story_id: story.id, point_id: p1.id },
    { story_id: story.id, point_id: p2.id },
  ]);

  // Set sender positions
  await supabaseAdmin.from('point_positions').insert([
    { point_id: p1.id, user_id: sender.user.id, position: 'agree' },
    { point_id: p2.id, user_id: sender.user.id, position: 'disagree' },
  ]);

  // Get story version
  const { data: version } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (!version) throw new Error('Version not found');

  // Create sealed letter
  const { data: letter } = await supabaseAdmin
    .from('clarity_letters')
    .insert({
      source_doc_id: doc.id,
      sender_id: sender.user.id,
      mode: 'one-to-one',
      status: 'sealed',
      sealed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (!letter) throw new Error('Letter creation failed');

  // Create snapshot with point_config
  await supabaseAdmin.from('letter_story_snapshots').insert({
    letter_id: letter.id,
    story_id: story.id,
    version_id: version.id,
    position: 0,
    visibility: 'public',
    point_config: {
      storyText: 'A story to verify drawer transparency, button styling, and card overflow behavior.',
      storyTitle: 'P676 visual test story',
      points: [
        { id: p1.id, text: 'First point for visual testing.', authorPosition: 'agree' },
        { id: p2.id, text: 'Second point for visual testing.', authorPosition: 'disagree' },
      ],
    },
  });

  // Create prediction
  await supabaseAdmin.from('letter_predictions').insert({
    letter_id: letter.id,
    story_id: story.id,
    prediction: 7,
  });

  return { docId: doc.id, storyId: story.id, pointIds: [p1.id, p2.id], letterId: letter.id };
}

async function createP676Delivery(letterId: string, receiver: TestUser) {
  const { data: delivery } = await supabaseAdmin
    .from('letter_deliveries')
    .insert({
      letter_id: letterId,
      receiver_email: receiver.email,
      receiver_profile_id: receiver.user.id,
      invitation_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id, invitation_token')
    .single();
  if (!delivery) throw new Error('Delivery creation failed');
  return { deliveryId: delivery.id, token: delivery.invitation_token };
}

// ---------------------------------------------------------------------------
// TEST: Position badge overflow-hidden
// ---------------------------------------------------------------------------

test.describe('P676: Position badge overflow-hidden', () => {
  test.describe.configure({ timeout: 60000 });

  test('LiveStoryCardExpanded card container has overflow-hidden', async ({ page }) => {
    // Navigate to any page that renders LiveStoryCardExpanded
    // Use a public profile or /live page — simplest is the letter reading page
    // For a lightweight check, we can just verify the class exists in source
    // But for E2E, we need a rendered component

    // Use the sender's profile page if a story exists, or the letter reading page
    // Simplest: navigate to a letter and check the card
    const sender = await createTestUser({ name: 'P676 OF Sender' });
    const testData = await createP676TestLetter(sender);
    const receiver = await createTestUser({ name: 'P676 OF Receiver' });
    const deliveryData = await createP676Delivery(testData.letterId, receiver);

    try {
      await setTestSession(page, receiver.email);
      await page.goto(`/letter/${deliveryData.deliveryId}?token=${deliveryData.token}`);
      await page.getByRole('button', { name: /open|begin|start/i }).click();

      // Navigate to story-rate (where LiveStoryCardExpanded renders)
      await page.getByRole('button', { name: /agree/i }).first().click();
      await page.getByRole('button', { name: /continue/i }).click(); // point-engage
      await page.getByRole('button', { name: /continue/i }).click(); // point-revealed

      const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
      await expect(storyCard).toBeVisible();

      const cardClass = await storyCard.getAttribute('class');
      expect(cardClass).toContain('overflow-hidden');
    } finally {
      await deleteTestLetter(testData.letterId);
      for (const pid of testData.pointIds) await deleteTestPoint(pid);
      await deleteTestStory(testData.storyId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', testData.docId);
      await deleteTestUser(receiver.user.id);
      await deleteTestUser(sender.user.id);
    }
  });

  test('position badge renders inside card boundary (no visual overflow)', async ({ page }) => {
    const sender = await createTestUser({ name: 'P676 Badge Sender' });
    const testData = await createP676TestLetter(sender);
    const receiver = await createTestUser({ name: 'P676 Badge Receiver' });
    const deliveryData = await createP676Delivery(testData.letterId, receiver);

    try {
      await setTestSession(page, receiver.email);
      await page.goto(`/letter/${deliveryData.deliveryId}?token=${deliveryData.token}`);
      await page.getByRole('button', { name: /open|begin|start/i }).click();

      // At point-engage phase — position then continue to see reveal with badge
      await page.getByRole('button', { name: /agree/i }).first().click();
      await page.getByRole('button', { name: /continue/i }).click(); // point-engage

      // At point-revealed — the sender position badge should be visible
      // Check that any position badge is within its parent card
      const badge = page.locator('text=/Agrees|Disagrees/i').first();
      if (await badge.isVisible()) {
        const badgeBox = await badge.boundingBox();
        // The badge's parent card should contain the badge
        const card = badge.locator('xpath=ancestor::div[contains(@class, "rounded-lg")]').first();
        const cardBox = await card.boundingBox();
        if (badgeBox && cardBox) {
          // Badge top should be >= card top (not above card)
          expect(badgeBox.y).toBeGreaterThanOrEqual(cardBox.y);
          // Badge bottom should be <= card bottom
          expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
        }
      }
    } finally {
      await deleteTestLetter(testData.letterId);
      for (const pid of testData.pointIds) await deleteTestPoint(pid);
      await deleteTestStory(testData.storyId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', testData.docId);
      await deleteTestUser(receiver.user.id);
      await deleteTestUser(sender.user.id);
    }
  });
});


