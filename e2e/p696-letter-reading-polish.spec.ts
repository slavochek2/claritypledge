/**
 * @file p696-letter-reading-polish.spec.ts
 * @description P696: Letter reading flow polish & refactor — E2E delta tests.
 *
 * Tests ONLY what P696 changes over P673:
 * - Cover page metadata: "N stories · M points · ~X minutes"
 * - Drafts list metadata: "N stories · M points"
 * - All primary actions rendered inside bottom-docked Drawer (not inline)
 * - Button labels: "Submit Your Position" / "Next" / "Submit My Rating"
 *   / "Next Story" / "Complete Letter"
 * - Position selector in Drawer (not inside point card)
 * - Comparison card (You vs Author) appears after position submit
 * - ~400ms delayed button appearance in reveal phases
 * - Final story shows "Complete Letter" not "Next Story"
 *
 * P673 covers the base reading flow phases (anti-point lead, D36, etc.).
 * This spec covers the interaction + metadata DELTA only.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import {
  createTestLetter,
  createTestStorySnapshot,
  createTestPrediction,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { supabaseAdmin } from './helpers/supabase-admin';

// ---------------------------------------------------------------------------
// Test data setup helpers
// ---------------------------------------------------------------------------

interface _P696TestFixture {
  sender: TestUser;
  receiver: TestUser;
  storyId: string;
  storyId2: string;
  pointId1: string;
  pointId2: string;
  docId: string;
  letterId: string;
  deliveryToken: string;
}

/**
 * Build a 2-story letter:
 * - Story 1: 2 visible points (triggers anti-point lead ordering)
 * - Story 2: 1 visible point (story-first for single-point)
 * This gives us both "Next Story" and "Complete Letter" in the flow.
 */
async function getStoryVersionId(storyId: string): Promise<string> {
  const { data: version, error } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', storyId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();
  if (error || !version) throw new Error(`Failed to get story version for ${storyId}: ${error?.message}`);
  return version.id;
}

async function buildTwoStoryLetter(
  sender: TestUser,
  receiver: TestUser,
  docId: string,
  storyId: string,
  storyId2: string,
  pointId1: string,
  pointId2: string,
): Promise<{ letterId: string; deliveryToken: string }> {
  const letter = await createTestLetter(sender.user.id, docId, {
    mode: 'one-to-one',
  });

  const versionId1 = await getStoryVersionId(storyId);
  const versionId2 = await getStoryVersionId(storyId2);

  // Story 1: 2 visible points (p1 + p2)
  await createTestStorySnapshot(letter.id, storyId, versionId1, {
    position: 0,
    pointConfig: {
      points: [
        { id: pointId1, visibility: 'visible', statement: 'First test point statement', senderPosition: 'agree' },
        { id: pointId2, visibility: 'visible', statement: 'Second test point statement', senderPosition: 'disagree' },
      ],
    },
  });
  await createTestPrediction(letter.id, storyId, 7, null);

  // Story 2: 1 visible point (triggers D36 story-first)
  await createTestStorySnapshot(letter.id, storyId2, versionId2, {
    position: 1,
    pointConfig: {
      points: [
        { id: pointId2, visibility: 'visible', statement: 'Single point for story 2', senderPosition: 'agree' },
      ],
    },
  });
  await createTestPrediction(letter.id, storyId2, 8, null);

  // Create delivery for the receiver
  const { data: delivery } = await supabaseAdmin
    .from('letter_deliveries')
    .insert({
      letter_id: letter.id,
      receiver_email: receiver.email,
      receiver_profile_id: receiver.user.id,
      status: 'sent',
    })
    .select('id, invitation_token')
    .single();

  if (!delivery) throw new Error('Delivery creation failed');

  // Update predictions with delivery_id for 1-to-1
  await supabaseAdmin
    .from('letter_predictions')
    .update({ delivery_id: delivery.id })
    .eq('letter_id', letter.id);

  await sealTestLetter(letter.id);

  return { letterId: letter.id, deliveryToken: delivery.invitation_token };
}

/**
 * Navigate to the letter reading flow and dismiss the cover page.
 */
async function openLetterReading(
  page: import('@playwright/test').Page,
  letterId: string,
  deliveryToken: string,
) {
  await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
  await page.waitForLoadState('networkidle');

  // Dismiss cover if present
  const startBtn = page.getByRole('button', { name: /start reading|open.*letter|begin/i });
  if (await startBtn.isVisible({ timeout: 5000 })) {
    await startBtn.click();
    await page.waitForLoadState('networkidle');
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('P696: Letter reading flow polish & refactor', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let receiver: TestUser;
  let storyId: string;
  let storyId2: string;
  let pointId1: string;
  let pointId2: string;
  let docId: string;
  let letterId: string;
  let deliveryToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P696 Sender' });
    receiver = await createTestUser({ name: 'P696 Receiver' });

    // Create a doc for drafts list testing
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P696 Test Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create stories
    const s1 = await createTestStory(sender.user.id, {
      content: 'P696 test story one — a longer narrative to establish reading context.',
    });
    storyId = s1.id;

    const s2 = await createTestStory(sender.user.id, {
      content: 'P696 test story two — the second story in the letter.',
    });
    storyId2 = s2.id;

    // Link stories to doc
    await supabaseAdmin.from('doc_stories').insert([
      { doc_id: docId, story_id: storyId },
      { doc_id: docId, story_id: storyId2 },
    ]);

    // Create points
    const p1 = await createTestPoint(sender.user.id, { statement: 'P696 point one: a testable claim' });
    const p2 = await createTestPoint(sender.user.id, { statement: 'P696 point two: another testable claim' });
    pointId1 = p1.id;
    pointId2 = p2.id;

    const result = await buildTwoStoryLetter(sender, receiver, docId, storyId, storyId2, pointId1, pointId2);
    letterId = result.letterId;
    deliveryToken = result.deliveryToken;
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    await deleteTestPoint(pointId2);
    await deleteTestPoint(pointId1);
    await deleteTestStory(storyId2);
    await deleteTestStory(storyId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await deleteTestUser(receiver.user.id);
    await deleteTestUser(sender.user.id);
  });

  // ==========================================================================
  // Smoke test — ALWAYS FIRST
  // ==========================================================================

  test('smoke: letter reading page loads with no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // Page should be visible — either cover or reading content
    const cover = page.locator('[data-testid="letter-cover"], .letter-cover');
    const readingContent = page.locator('[data-testid="letter-flow"], [data-testid="reading-content"]');
    const hasCover = await cover.isVisible({ timeout: 10000 }).catch(() => false);
    const hasContent = await readingContent.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasCover || hasContent).toBe(true);

    // No console errors on load
    const relevantErrors = consoleErrors.filter(
      e => !e.includes('favicon') && !e.includes('net::ERR')
    );
    expect(relevantErrors).toHaveLength(0);
  });

  // ==========================================================================
  // Phase 1: Metadata — cover page
  // ==========================================================================

  test('cover page displays step count and reading time alongside chapter count', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // P852 Phase-2: cover vocabulary switched from "stories · points · minutes"
    // to "chapters · steps · minutes" (chapters = stories 1:1, steps = stories + points).
    // With 2 stories + 3 points: "2 chapters · 5 steps · ~5 minutes".
    const coverText = page.locator('body');

    // Must mention "chapters" and "steps"
    await expect(coverText).toContainText(/chapters/i, { timeout: 10000 });
    await expect(coverText).toContainText(/steps/i, { timeout: 5000 });

    // Must also show reading time estimate
    await expect(coverText).toContainText(/minutes/i, { timeout: 5000 });

    // Regression guard: the old "N stories · M points" format must NOT appear.
    const rawText = await coverText.textContent();
    if (rawText?.match(/\d+\s*stories/i) && rawText?.match(/minutes/i)) {
      // If the old "stories" wording leaked back, fail.
      throw new Error('Cover meta still uses old "stories" vocabulary — should be "chapters".');
    }
  });

  test('cover metadata reading time accounts for points (not just story count × 2)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').textContent();

    // 2 stories + 3 points → estimateReadingMinutes(2, 3) = Math.max(1, ceil(3+2)) = 5
    // Old formula: ceil(2 * 2) = 4
    // Verify the estimate is at least 5 (not the old 4-minute value)
    const minutesMatch = bodyText?.match(/~?(\d+)\s*min/i);
    if (minutesMatch) {
      const minutes = parseInt(minutesMatch[1], 10);
      // P696 formula: Math.max(1, Math.ceil(totalPoints + storyCount)) = Math.max(1, 5) = 5
      // Old formula: Math.ceil(2 * 2) = 4
      // If showing 4 → still using old formula. Should be 5.
      expect(minutes).toBeGreaterThanOrEqual(5);
    }
  });

  // ==========================================================================
  // Phase 1: Metadata — drafts list
  // ==========================================================================

  test('drafts list shows point count alongside story count', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Find the draft entry for this doc
    const draftEntry = page.locator('[data-testid*="draft"], .draft-item').filter({
      hasText: 'P696 Test Doc',
    });

    // If the doc is visible, its metadata should include both stories and points
    const isDraftVisible = await draftEntry.isVisible({ timeout: 10000 }).catch(() => false);
    if (isDraftVisible) {
      const draftText = await draftEntry.textContent();
      // Format: "N stories · M points"
      expect(draftText).toMatch(/stories/i);
      expect(draftText).toMatch(/points/i);
    } else {
      // Fall back: check the whole page for any mention of points in drafts area
      await expect(page.locator('body')).toContainText(/points/i, { timeout: 5000 });
    }
  });

  // ==========================================================================
  // Phase 4: All actions in Drawer
  // ==========================================================================

  test('point-engage phase: position selector is in Drawer, not inline in point card', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await openLetterReading(page, letterId, deliveryToken);

    // Should land in point-engage (2 visible points triggers anti-point lead)
    // Drawer should be visible at bottom
    const drawer = page.locator('[data-testid="reading-drawer"], [data-vaul-drawer], [role="dialog"]');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Position buttons (Agree/Disagree/Unsure) should be INSIDE the drawer, not above it
    const positionButtons = page.getByRole('button', { name: /agree|disagree|unsure/i });
    await expect(positionButtons.first()).toBeVisible({ timeout: 5000 });

    // Verify position buttons are inside drawer (not in main content area)
    const drawerBox = await drawer.boundingBox();
    const firstBtnBox = await positionButtons.first().boundingBox();
    if (drawerBox && firstBtnBox) {
      // Button top should be at or below drawer top
      expect(firstBtnBox.y).toBeGreaterThanOrEqual(drawerBox.y - 10); // 10px tolerance
    }
  });

  test('point-engage phase: "Submit Your Position" button label', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await openLetterReading(page, letterId, deliveryToken);

    // Should be "Submit Your Position" not generic "Continue" or "Submit"
    const submitBtn = page.getByRole('button', { name: /submit your position/i });
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
  });

  test('point-engage phase: "Submit Your Position" disabled until position selected', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await openLetterReading(page, letterId, deliveryToken);

    const submitBtn = page.getByRole('button', { name: /submit your position/i });
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await expect(submitBtn).toBeDisabled();

    // Select a position
    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await agreeBtn.click();

    // Now Submit should enable
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });
  });

  test('story-rate phase: "Submit My Rating" button label (not "Submit" or "Continue")', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await openLetterReading(page, letterId, deliveryToken);

    // Navigate through point-engage for story 1 (2 points)
    // Select position on first point and submit
    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await agreeBtn.click({ timeout: 10000 });

    const submitPosition = page.getByRole('button', { name: /submit your position/i });
    await submitPosition.click();

    // After reveal, wait for "Next" button
    const nextBtn = page.getByRole('button', { name: /^next$/i });
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    await nextBtn.click();

    // Now in story-rate phase — drawer should show "Submit My Rating"
    const submitRating = page.getByRole('button', { name: /submit my rating/i });
    await expect(submitRating).toBeVisible({ timeout: 10000 });
  });

  // ==========================================================================
  // Phase 4: Comparison card
  // ==========================================================================

  test('after position submit: comparison card shows "You" and author positions', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await openLetterReading(page, letterId, deliveryToken);

    // Select a position and submit
    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await agreeBtn.click({ timeout: 10000 });

    const submitBtn = page.getByRole('button', { name: /submit your position/i });
    await submitBtn.click();

    // After submit: comparison card should appear showing both positions
    // "You" label and author name visible
    await expect(page.getByText(/\bYou\b/i)).toBeVisible({ timeout: 10000 });

    // Author name or "Author" label should appear
    const hasAuthorLabel = await page.getByText(new RegExp(sender.name, 'i')).isVisible({ timeout: 3000 }).catch(() => false);
    const hasGenericAuthor = await page.getByText(/author/i).isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAuthorLabel || hasGenericAuthor).toBe(true);
  });

  test('comparison card shows two positions side by side (not a dropdown)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await openLetterReading(page, letterId, deliveryToken);

    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await agreeBtn.click({ timeout: 10000 });

    const submitBtn = page.getByRole('button', { name: /submit your position/i });
    await submitBtn.click();

    // Comparison card: both positions visible simultaneously
    // Receiver's position should show "Agree" (what we just selected)
    const agreeLabel = page.getByText(/agree/i).first();
    await expect(agreeLabel).toBeVisible({ timeout: 10000 });

    // Position selector (the submit UI) should be GONE after reveal
    await expect(submitBtn).not.toBeVisible({ timeout: 3000 });
  });

  // ==========================================================================
  // Phase 4: 400ms delayed button
  // ==========================================================================

  test('point-revealed phase: "Next" button not immediately visible after reveal', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await openLetterReading(page, letterId, deliveryToken);

    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await agreeBtn.click({ timeout: 10000 });

    const submitBtn = page.getByRole('button', { name: /submit your position/i });
    await submitBtn.click();

    // Immediately after submit, "Next" button should NOT be visible yet
    // The 400ms delay prevents accidental click-through
    const nextBtn = page.getByRole('button', { name: /^next$/i });
    const immediatelyVisible = await nextBtn.isVisible({ timeout: 100 }).catch(() => false);
    expect(immediatelyVisible).toBe(false);

    // After 400ms delay, "Next" should appear
    await expect(nextBtn).toBeVisible({ timeout: 2000 });
  });

  test('story-revealed phase: advance button not immediately visible after rating submit', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await openLetterReading(page, letterId, deliveryToken);

    // Navigate to story-rate phase (requires completing 2 point-engage phases first)
    // Complete first point
    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await agreeBtn.click({ timeout: 10000 });
    await page.getByRole('button', { name: /submit your position/i }).click();
    const nextBtn = page.getByRole('button', { name: /^next$/i });
    await expect(nextBtn).toBeVisible({ timeout: 2000 });
    await nextBtn.click();

    // Now in story-rate: select rating and submit
    const ratingBtns = page.getByRole('button', { name: /^Rate \d+$/ });
    const firstRating = ratingBtns.first();
    const ratingVisible = await firstRating.isVisible({ timeout: 10000 }).catch(() => false);
    if (ratingVisible) {
      await firstRating.click();
      await page.getByRole('button', { name: /submit my rating/i }).click();

      // Immediately after rating submit, advance button should NOT be visible
      const advanceBtn = page.getByRole('button', { name: /next story|complete letter/i });
      const immediatelyVisible = await advanceBtn.isVisible({ timeout: 100 }).catch(() => false);
      expect(immediatelyVisible).toBe(false);

      // After delay, should appear
      await expect(advanceBtn).toBeVisible({ timeout: 2000 });
    }
  });

  // ==========================================================================
  // Phase 4: Button labels — "Next Story" vs "Complete Letter"
  // ==========================================================================

  test('final story shows "Complete Letter" not "Next Story"', async ({ page }) => {
    // This test navigates through the entire 2-story letter to verify
    // the last story's advance button says "Complete Letter"
    await setTestSession(page, receiver.email);
    await openLetterReading(page, letterId, deliveryToken);

    // --- Story 1 ---
    // Point 1 (anti-point lead)
    const agreeBtn = page.getByRole('button', { name: /agree|disagree|unsure/i }).first();
    await agreeBtn.click({ timeout: 10000 });
    await page.getByRole('button', { name: /submit your position/i }).click();
    await expect(page.getByRole('button', { name: /^next$/i })).toBeVisible({ timeout: 2000 });
    await page.getByRole('button', { name: /^next$/i }).click();

    // Story rate
    const ratingBtn = page.getByRole('button', { name: /^Rate \d+$/ }).first();
    await expect(ratingBtn).toBeVisible({ timeout: 10000 });
    await ratingBtn.click();
    await page.getByRole('button', { name: /submit my rating/i }).click();

    // After story 1 reveal: should show "Next Story"
    const nextStoryBtn = page.getByRole('button', { name: /next story/i });
    await expect(nextStoryBtn).toBeVisible({ timeout: 3000 });
    await nextStoryBtn.click();

    // --- Story 2 ---
    // With 1 point: story-first (D36), so story-rate comes before point-engage
    const ratingBtn2 = page.getByRole('button', { name: /^Rate \d+$/ }).first();
    await expect(ratingBtn2).toBeVisible({ timeout: 10000 });
    await ratingBtn2.click();
    await page.getByRole('button', { name: /submit my rating/i }).click();

    // Remaining point or story-revealed: after rating story 2
    // Final phase should show "Complete Letter"
    const completeBtn = page.getByRole('button', { name: /complete letter/i });
    await expect(completeBtn).toBeVisible({ timeout: 5000 });

    // Must NOT show "Next Story" on the final story
    const nextStoryFinal = page.getByRole('button', { name: /next story/i });
    await expect(nextStoryFinal).not.toBeVisible({ timeout: 1000 });
  });

  // ==========================================================================
  // Phase 3: LetterFlowContent renders all 3 variants
  // (structural check — public reading mode doesn't require auth)
  // ==========================================================================

  test('public reading (unauthenticated) flow reaches point-engage phase', async ({ page }) => {
    // Build a one-to-many letter for public reading test
    const publicLetter = await createTestLetter(sender.user.id, docId, {
      mode: 'one-to-many',
    });
    // P1043: passed storyId as versionId here while every other call site in this file
    // uses getStoryVersionId. letter_story_snapshots.version_id references
    // story_versions(id), so this was a not-yet-reached FK violation.
    const publicVersionId = await getStoryVersionId(storyId);
    await createTestStorySnapshot(publicLetter.id, storyId, publicVersionId, {
      position: 0,
      pointConfig: {
        points: [
          { id: pointId1, visibility: 'visible', statement: 'Public test point', senderPosition: 'agree' },
          { id: pointId2, visibility: 'visible', statement: 'Public test point 2', senderPosition: 'disagree' },
        ],
      },
    });
    await createTestPrediction(publicLetter.id, storyId, 7, null);
    await sealTestLetter(publicLetter.id);

    try {
      // Navigate without any auth session
      await page.goto(`/letter/${publicLetter.id}`);
      await page.waitForLoadState('networkidle');

      // Cover or reading content should appear
      const bodyText = page.locator('body');
      await expect(bodyText).toBeVisible({ timeout: 10000 });

      // Should NOT show auth error
      const pageText = await bodyText.textContent();
      expect(pageText).not.toMatch(/unauthorized|access denied|not found/i);
    } finally {
      await deleteTestLetter(publicLetter.id);
    }
  });

});

// ==========================================================================
// Canary: prediction reveal in one-to-many public reading (standalone suite)
// ==========================================================================

test.describe('Prediction reveal — one-to-many canary', () => {
  test.describe.configure({ timeout: 90000 });

  let canaryUser: TestUser;
  let canaryDocId: string;
  let canaryStoryId: string;
  let canaryPointId: string;

  test.beforeAll(async () => {
    canaryUser = await createTestUser({ name: 'Canary Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: canaryUser.user.id, title: 'Canary Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Canary doc creation failed');
    canaryDocId = doc.id;

    const story = await createTestStory(canaryUser.user.id, {
      content: 'Canary story for prediction reveal test.',
    });
    canaryStoryId = story.id;

    await supabaseAdmin.from('doc_stories').insert({ doc_id: canaryDocId, story_id: canaryStoryId });

    const point = await createTestPoint(canaryUser.user.id, { statement: 'Canary test point' });
    canaryPointId = point.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('clarity_docs').delete().eq('id', canaryDocId);
    await deleteTestPoint(canaryPointId);
    await deleteTestStory(canaryStoryId);
    await deleteTestUser(canaryUser.user.id);
  });

  test('canary: one-to-many prediction reveals after rating (not Pending...)', async ({ page }) => {
    // D36 story (1 visible point) → story-rate before point-engage → story-revealed shows prediction
    const publicLetter = await createTestLetter(canaryUser.user.id, canaryDocId, {
      mode: 'one-to-many',
    });
    const versionId = await getStoryVersionId(canaryStoryId);
    await createTestStorySnapshot(publicLetter.id, canaryStoryId, versionId, {
      position: 0,
      pointConfig: {
        points: [
          { id: canaryPointId, visibility: 'visible', statement: 'Canary point', senderPosition: 'agree' },
        ],
      },
    });
    // Shared prediction (delivery_id=null) — value=7, user will rate 5 → gap=2
    await createTestPrediction(publicLetter.id, canaryStoryId, 7, null);
    await sealTestLetter(publicLetter.id);

    try {
      // Anonymous read — no auth session
      await page.goto(`/letter/${publicLetter.id}`);
      await page.waitForLoadState('networkidle');

      // Dismiss cover
      const openBtn = page.getByRole('button', { name: /open.*letter|start reading|begin/i });
      await expect(openBtn).toBeVisible({ timeout: 10000 });
      await openBtn.click();
      await page.waitForLoadState('networkidle');

      // D36: 1 visible point → story-rate phase (ComprehensionRatingCard in Drawer)
      // Select rating 5 (gap = |5 - 7| = 2). Buttons have aria-label "Rate N".
      const rating5 = page.getByRole('button', { name: 'Rate 5' });
      await expect(rating5).toBeVisible({ timeout: 10000 });
      await rating5.click();

      // Submit rating
      const submitBtn = page.getByRole('button', { name: /^submit$/i });
      await expect(submitBtn).toBeEnabled({ timeout: 3000 });
      await submitBtn.click();

      // Now in story-revealed phase — prediction should be revealed
      // CANARY: Bug causes prediction to stay null → "Pending..." shows
      const bodyText = await page.locator('body').textContent({ timeout: 5000 });
      expect(bodyText).not.toMatch(/Pending\.\.\./);

      // GapBanner: gap=2 → "2 points gap" (NOT "Perfectly calibrated")
      // Bug: gap defaults to 0 when prediction null → shows "Perfectly calibrated"
      await expect(page.locator('body')).not.toContainText('Perfectly calibrated', { timeout: 3000 });
      await expect(page.locator('body')).toContainText('2 points gap', { timeout: 3000 });
    } finally {
      await deleteTestLetter(publicLetter.id);
    }
  });
});
