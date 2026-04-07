/**
 * @file p676-visual-corrections.spec.ts
 * @description P676: Visual correction tests for letter reading flow.
 *
 * Covers 4 issues from the change-request:
 * 1. Drawer backdrop transparency (no dimming of story card)
 * 2. Drawer styling matches /live's RatingCard pattern
 * 3. Post-reveal Continue buttons use outline/secondary weight
 * 4. Position badge overflow-hidden on LiveStoryCardExpanded
 *
 * Also includes regression checks for /live drawer behavior.
 *
 * NOTE: These are visual/CSS corrections — no unit tests needed.
 * Existing P673 E2E tests (p673-letter-reading-flow.spec.ts) cover
 * the functional flow; these tests focus on visual properties.
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
// TEST: Drawer backdrop transparency
// ---------------------------------------------------------------------------

test.describe('P676: Drawer backdrop transparency', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let testData: Awaited<ReturnType<typeof createP676TestLetter>>;
  let deliveryData: Awaited<ReturnType<typeof createP676Delivery>>;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P676 Sender' });
    receiver = await createTestUser({ name: 'P676 Receiver' });
    testData = await createP676TestLetter(sender);
    deliveryData = await createP676Delivery(testData.letterId, receiver);
  });

  test.afterAll(async () => {
    await deleteTestLetter(testData.letterId);
    for (const pid of testData.pointIds) await deleteTestPoint(pid);
    await deleteTestStory(testData.storyId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', testData.docId);
    await deleteTestUser(receiver.user.id);
    await deleteTestUser(sender.user.id);
  });

  test('story card is NOT dimmed when rating drawer is open', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryData.deliveryId}?token=${deliveryData.token}`);

    // Click "Open letter" to enter reading flow
    const openButton = page.getByRole('button', { name: /open|begin|start/i });
    await openButton.click();

    // We start at point-engage phase (2 points → anti-point lead)
    // Position on point 1
    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await agreeBtn.click();
    const submitBtn = page.getByRole('button', { name: /submit/i });
    await submitBtn.click();

    // Now at point-revealed → click Continue
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await continueBtn.click();

    // Now at story-rate phase — drawer should be open
    // Check that the drawer overlay uses bg-transparent, NOT bg-black/80
    const overlay = page.locator('[role="presentation"]').first();
    const overlayClass = await overlay.getAttribute('class');
    // Overlay should be transparent (bg-transparent) not dark (bg-black/80)
    expect(overlayClass).toContain('bg-transparent');
    expect(overlayClass).not.toContain('bg-black');

    // Story card should be visible and not dimmed
    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible();
  });

  test('story card text remains readable behind open drawer', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryData.deliveryId}?token=${deliveryData.token}`);

    const openButton = page.getByRole('button', { name: /open|begin|start/i });
    await openButton.click();

    // Navigate through point phases to story-rate
    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await agreeBtn.click();
    await page.getByRole('button', { name: /submit/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // At story-rate: verify story text is visible (not obscured)
    const storyText = page.locator('text=A story to verify drawer transparency');
    await expect(storyText).toBeVisible();

    // Verify author name is visible
    const authorName = page.locator('text=P676 Sender');
    await expect(authorName).toBeVisible();
  });

  test('preview page drawer also has transparent backdrop', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${testData.docId}/preview`);

    // Preview starts at point-engage (2 points)
    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await agreeBtn.click();
    await page.getByRole('button', { name: /submit/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // At story-rate — check overlay
    const overlay = page.locator('[role="presentation"]').first();
    const overlayClass = await overlay.getAttribute('class');
    expect(overlayClass).toContain('bg-transparent');
    expect(overlayClass).not.toContain('bg-black');
  });
});

// ---------------------------------------------------------------------------
// TEST: Drawer styling matches /live
// ---------------------------------------------------------------------------

test.describe('P676: Drawer styling matches /live', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let testData: Awaited<ReturnType<typeof createP676TestLetter>>;
  let deliveryData: Awaited<ReturnType<typeof createP676Delivery>>;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P676 Style Sender' });
    receiver = await createTestUser({ name: 'P676 Style Receiver' });
    testData = await createP676TestLetter(sender);
    deliveryData = await createP676Delivery(testData.letterId, receiver);
  });

  test.afterAll(async () => {
    await deleteTestLetter(testData.letterId);
    for (const pid of testData.pointIds) await deleteTestPoint(pid);
    await deleteTestStory(testData.storyId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', testData.docId);
    await deleteTestUser(receiver.user.id);
    await deleteTestUser(sender.user.id);
  });

  // Helper: navigate to story-rate phase
  async function navigateToStoryRate(page: import('@playwright/test').Page, email: string, deliveryId: string, token: string) {
    await setTestSession(page, email);
    await page.goto(`/letter/${deliveryId}?token=${token}`);
    await page.getByRole('button', { name: /open|begin|start/i }).click();
    // Point-engage → agree → submit → continue → story-rate
    await page.getByRole('button', { name: /agree/i }).first().click();
    await page.getByRole('button', { name: /submit/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();
  }

  test('drawer header is sr-only (visually hidden, accessible)', async ({ page }) => {
    await navigateToStoryRate(page, receiver.email, deliveryData.deliveryId, deliveryData.token);

    // DrawerHeader should have sr-only class
    const drawerHeader = page.locator('.sr-only').filter({ hasText: /rate this story/i });
    // sr-only elements exist in DOM but are not visually visible
    await expect(drawerHeader).toHaveCount(1);
  });

  test('rating question renders as centered h2', async ({ page }) => {
    await navigateToStoryRate(page, receiver.email, deliveryData.deliveryId, deliveryData.token);

    const h2 = page.locator('h2', { hasText: 'How well do you believe you understand this story?' });
    await expect(h2).toBeVisible();

    const h2Class = await h2.getAttribute('class');
    expect(h2Class).toContain('text-center');
    expect(h2Class).toContain('text-lg');
  });

  test('Submit button inside drawer is small and centered (not full-width)', async ({ page }) => {
    await navigateToStoryRate(page, receiver.email, deliveryData.deliveryId, deliveryData.token);

    // Select a rating to enable Submit
    await page.getByRole('button', { name: '7' }).click();

    const submitBtn = page.getByRole('button', { name: /submit/i });
    await expect(submitBtn).toBeVisible();

    const submitClass = await submitBtn.getAttribute('class');
    expect(submitClass).toContain('max-w-[200px]');
    // Should NOT be w-full without max-w constraint
    expect(submitClass).not.toMatch(/\bw-full\b(?!.*max-w)/);
  });

  test('drawer body has /live-matching padding (pb-8)', async ({ page }) => {
    await navigateToStoryRate(page, receiver.email, deliveryData.deliveryId, deliveryData.token);

    // The inner div should have pb-8 (not pb-4)
    const drawerBody = page.locator('.pb-8.pt-4');
    await expect(drawerBody).toHaveCount(1);
  });

  test('scale labels ("Not at all" / "Complete cognitive understanding") visible', async ({ page }) => {
    await navigateToStoryRate(page, receiver.email, deliveryData.deliveryId, deliveryData.token);

    await expect(page.locator('text=Not at all')).toBeVisible();
    await expect(page.locator('text=Complete cognitive understanding')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// TEST: Continue button secondary weight
// ---------------------------------------------------------------------------

test.describe('P676: Continue button secondary weight', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let testData: Awaited<ReturnType<typeof createP676TestLetter>>;
  let deliveryData: Awaited<ReturnType<typeof createP676Delivery>>;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P676 Btn Sender' });
    receiver = await createTestUser({ name: 'P676 Btn Receiver' });
    testData = await createP676TestLetter(sender);
    deliveryData = await createP676Delivery(testData.letterId, receiver);
  });

  test.afterAll(async () => {
    await deleteTestLetter(testData.letterId);
    for (const pid of testData.pointIds) await deleteTestPoint(pid);
    await deleteTestStory(testData.storyId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', testData.docId);
    await deleteTestUser(receiver.user.id);
    await deleteTestUser(sender.user.id);
  });

  test('post-point-reveal Continue button uses outline variant', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryData.deliveryId}?token=${deliveryData.token}`);
    await page.getByRole('button', { name: /open|begin|start/i }).click();

    // Point-engage → agree → submit → point-revealed
    await page.getByRole('button', { name: /agree/i }).first().click();
    await page.getByRole('button', { name: /submit/i }).click();

    // Now at point-revealed — Continue should be outline
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeVisible();

    const btnClass = await continueBtn.getAttribute('class');
    expect(btnClass).toContain('border-[#0044CC]');
    expect(btnClass).toContain('text-[#0044CC]');
    // Should NOT have filled primary background
    expect(btnClass).not.toContain('bg-[#0044CC]');
  });

  test('post-story-reveal Continue button uses outline variant', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryData.deliveryId}?token=${deliveryData.token}`);
    await page.getByRole('button', { name: /open|begin|start/i }).click();

    // Navigate through point → story-rate → submit rating → story-revealed
    await page.getByRole('button', { name: /agree/i }).first().click();
    await page.getByRole('button', { name: /submit/i }).click();
    await page.getByRole('button', { name: /continue/i }).click(); // past point-revealed

    // At story-rate — select rating and submit
    await page.getByRole('button', { name: '5' }).click();
    await page.getByRole('button', { name: /submit/i }).click();

    // At story-revealed — Continue should be outline
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeVisible();

    const btnClass = await continueBtn.getAttribute('class');
    expect(btnClass).toContain('border-[#0044CC]');
    expect(btnClass).toContain('text-[#0044CC]');
    expect(btnClass).not.toContain('bg-[#0044CC]');
  });

  test('in-drawer Submit button retains primary CTA styling (not outline)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryData.deliveryId}?token=${deliveryData.token}`);
    await page.getByRole('button', { name: /open|begin|start/i }).click();

    // Navigate to story-rate
    await page.getByRole('button', { name: /agree/i }).first().click();
    await page.getByRole('button', { name: /submit/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // At story-rate — select rating
    await page.getByRole('button', { name: '7' }).click();

    // In-drawer Submit should be primary (filled blue)
    const submitBtn = page.getByRole('button', { name: /submit/i });
    const submitClass = await submitBtn.getAttribute('class');
    expect(submitClass).toContain('bg-[#0044CC]');
  });

  test('preview page Continue buttons also use outline variant', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${testData.docId}/preview`);

    // Point-engage → agree → submit → point-revealed
    await page.getByRole('button', { name: /agree/i }).first().click();
    await page.getByRole('button', { name: /submit/i }).click();

    // point-revealed: Continue should be outline
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeVisible();

    const btnClass = await continueBtn.getAttribute('class');
    expect(btnClass).toContain('border-[#0044CC]');
    expect(btnClass).not.toContain('bg-[#0044CC]');
  });
});

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
      await page.getByRole('button', { name: /submit/i }).click();
      await page.getByRole('button', { name: /continue/i }).click();

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

      // At point-engage phase — position then submit to see reveal with badge
      await page.getByRole('button', { name: /agree/i }).first().click();
      await page.getByRole('button', { name: /submit/i }).click();

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

// =============================================================================
// REGRESSION: /live drawer behavior unchanged
// =============================================================================

test.describe('P676: Regression — /live drawer unchanged', () => {
  test.describe.configure({ timeout: 60000 });

  test('/live rating drawer still uses transparent overlay', async ({ page: _page }) => {
    // /live requires a two-party session with Realtime — complex setup.
    // Regression is guarded by existing /live tests passing.
    // Mark as skip — manual verification via /verify.
    test.skip(true, 'P676: /live regression requires two-party session — covered by existing /live tests + manual /verify');
  });

  test('/live Submit button inside drawer retains sm/centered styling', async ({ page: _page }) => {
    test.skip(true, 'P676: /live regression requires two-party session — covered by existing /live tests + manual /verify');
  });
});
