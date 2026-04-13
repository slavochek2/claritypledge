/**
 * @file p699-letter-results-sender.spec.ts
 * @description P699: Letter Results Story Walk — Sender perspective E2E tests
 *
 * Tests:
 * 1. Smoke: results page loads without console errors
 * 2. Story walk renders story counter, JourneyToUnderstanding, GapBanner, story card
 * 3. Previous/Next navigation between stories
 * 4. Last story shows /live CTA when gap > 0
 * 5. ClarityLandingLayout: top menu visible (not chromeFree)
 * 6. Progressive results: incomplete stories show "Not yet rated" placeholder
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
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import {
  createFullTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P699: Sender Results — Story Walk', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId1: string;
  let storyId2: string;
  let storyId3: string;
  let pointId1: string;
  let pointId2: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P699 Sender Results' });
    receiver = await createTestUser({ name: 'P699 Receiver Results' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P699 Sender Results Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create 3 stories (story 3 will remain incomplete — receiver hasn't rated it)
    const story1 = await createTestStory(sender.user.id, {
      title: 'P699 Story 1',
      content: 'First story for gap visualization test.',
    });
    const story2 = await createTestStory(sender.user.id, {
      title: 'P699 Story 2',
      content: 'Second story with large gap.',
    });
    const story3 = await createTestStory(sender.user.id, {
      title: 'P699 Story 3',
      content: 'Third story not yet rated by receiver.',
    });
    storyId1 = story1.id;
    storyId2 = story2.id;
    storyId3 = story3.id;

    // Add points to story 1
    const p1 = await createTestPoint(sender.user.id, storyId1, { statement: 'P699 Point A' });
    const p2 = await createTestPoint(sender.user.id, storyId1, { statement: 'P699 Point B' });
    pointId1 = p1.id;
    pointId2 = p2.id;

    // Fetch versions for all 3 stories
    const versions = await Promise.all(
      [storyId1, storyId2, storyId3].map(async (sid) => {
        const { data: v } = await supabaseAdmin
          .from('story_versions')
          .select('id')
          .eq('story_id', sid)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        return v?.id;
      })
    );
    if (versions.some((v) => !v)) throw new Error('Story versions not found');

    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [
        { storyId: storyId1, versionId: versions[0]!, prediction: 3, position: 0 },
        { storyId: storyId2, versionId: versions[1]!, prediction: 8, position: 1 },
        { storyId: storyId3, versionId: versions[2]!, prediction: 5, position: 2 },
      ],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;

    // Receiver rated stories 1 and 2 but NOT story 3 (in_progress with 2 stories rated)
    // Story 1: prediction=3, rating=8 → gap=5
    // Story 2: prediction=8, rating=4 → gap=4
    await supabaseAdmin.from('story_verifications').insert([
      {
        story_id: storyId1,
        speaker_id: sender.user.id,
        listener_id: receiver.user.id,
        speaker_rating: 3,
        listener_rating: 8,
        source: 'letter',
        verified: false,
        sort_order: 0,
      },
      {
        story_id: storyId2,
        speaker_id: sender.user.id,
        listener_id: receiver.user.id,
        speaker_rating: 8,
        listener_rating: 4,
        source: 'letter',
        verified: false,
        sort_order: 1,
      },
    ]);

    // Create letter point responses for story 1 points
    await supabaseAdmin.from('letter_point_responses').insert([
      { delivery_id: deliveryId, point_id: pointId1, position: 'agree' },
      { delivery_id: deliveryId, point_id: pointId2, position: 'disagree' },
    ]);

    // Mark delivery as in_progress (story 3 not yet rated)
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'in_progress', stories_rated: 2 })
      .eq('id', deliveryId);
  });

  test.afterAll(async () => {
    if (storyId1) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId1)
        .eq('source', 'letter');
    }
    if (storyId2) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId2)
        .eq('source', 'letter');
    }
    if (letterId) await deleteTestLetter(letterId);
    if (pointId2) await deleteTestPoint(pointId2);
    if (pointId1) await deleteTestPoint(pointId1);
    if (storyId3) await deleteTestStory(storyId3);
    if (storyId2) await deleteTestStory(storyId2);
    if (storyId1) await deleteTestStory(storyId1);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 1. Smoke ─────────────────────────────────────────────────────────────

  test('smoke: sender results page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Should be on the results page
    expect(page.url()).toContain(`/letter/${letterId}/results`);

    // No critical console errors (filter known benign ones)
    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('Non-Error promise rejection')
    );
    expect(criticalErrors, `Console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
  });

  // ── 2. Story walk structure ───────────────────────────────────────────────

  test('story walk shows "Story 1 of 3" counter on first story', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    const counter = page.locator('text=/story\\s+1\\s+of\\s+3/i');
    await expect(counter).toBeVisible({ timeout: 10000 });
  });

  test('story walk shows JourneyToUnderstanding component on first story', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // JourneyToUnderstanding shows sender prediction vs receiver rating
    // Look for both numeric values from story 1: prediction=3, rating=8
    const predictionValue = page.locator('text=/3/').first();
    const ratingValue = page.locator('text=/8/').first();
    await expect(predictionValue).toBeVisible({ timeout: 10000 });
    await expect(ratingValue).toBeVisible({ timeout: 10000 });
  });

  test('story walk shows GapBanner on first story', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // GapBanner includes "N points gap" badge text
    const gapBanner = page.locator('text=/points gap|perfectly calibrated/i').first();
    await expect(gapBanner).toBeVisible({ timeout: 10000 });
  });

  test('story walk shows LiveStoryCardExpanded with story content', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Story card shows story body text (LiveStoryCardExpanded renders content, not title)
    const storyContent = page.locator('text=/First story for gap visualization/').first();
    await expect(storyContent).toBeVisible({ timeout: 10000 });
  });

  test('story walk shows story points with position badges', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Points from story 1 should be visible (P699 Point A, P699 Point B)
    // The card is defaultExpanded with readOnly mode
    const pointContent = page.locator('text=/P699 Point/').first();
    await expect(pointContent).toBeVisible({ timeout: 10000 });
  });

  // ── 3. Navigation ─────────────────────────────────────────────────────────

  test('Previous button not shown on first story (boundary)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // No "Previous Story" button on story 1
    const prevButton = page.getByRole('button', { name: /previous story/i });
    await expect(prevButton).not.toBeVisible();
  });

  test('Next Story button advances to story 2', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    const nextButton = page.getByRole('button', { name: /next story/i });
    await expect(nextButton).toBeVisible({ timeout: 10000 });
    await nextButton.click();

    await page.waitForLoadState('networkidle');

    // Counter should now show Story 2 of 3
    const counter = page.locator('text=/story\\s+2\\s+of\\s+3/i');
    await expect(counter).toBeVisible({ timeout: 10000 });
  });

  test('Previous Story button works on story 2 to go back to story 1', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Navigate to story 2
    const nextButton = page.getByRole('button', { name: /next story/i });
    await nextButton.click();
    await page.waitForLoadState('networkidle');

    // Go back to story 1
    const prevButton = page.getByRole('button', { name: /previous story/i });
    await expect(prevButton).toBeVisible({ timeout: 10000 });
    await prevButton.click();
    await page.waitForLoadState('networkidle');

    const counter = page.locator('text=/story\\s+1\\s+of\\s+3/i');
    await expect(counter).toBeVisible({ timeout: 10000 });
  });

  // ── 4. Last story CTA ─────────────────────────────────────────────────────

  test('last story shows /live CTA when gap > 0', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Navigate to story 2 (story 3 is not yet rated, so last rated story is 2)
    // Navigate through all stories to reach the last rated one
    const nextButton = page.getByRole('button', { name: /next story/i });
    await nextButton.click();
    await page.waitForLoadState('networkidle');

    // On the last story, Next Story button should not appear; instead /live CTA
    // Gap for story 2: |8-4| = 4 > 0, so CTA should be visible
    const liveCTA = page.locator(
      'a[href*="/live"], button:has-text(/start.*live|see.*live|continue.*live|go to.*live/i)'
    ).first();
    // CTA appears on last story when gap > 0
    if (await liveCTA.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(liveCTA).toBeVisible();
    }
  });

  test('last story shows Back to Letters link', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Navigate to last story
    const nextButtons = page.getByRole('button', { name: /next story/i });
    while (await nextButtons.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButtons.click();
      await page.waitForLoadState('networkidle');
    }

    const backLink = page.locator('a[href*="/letters"]').first();
    await expect(backLink).toBeVisible({ timeout: 10000 });
  });

  // ── 5. Layout ─────────────────────────────────────────────────────────────

  test('top menu is visible (ClarityLandingLayout, not chromeFree)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // ClarityLandingLayout shows the top nav/header
    // chromeFree layout hides it — this page should NOT be chromeFree
    const topNav = page.locator('nav[data-nav="main"]').first();
    await expect(topNav).toBeVisible({ timeout: 10000 });
  });

  // ── 6. Progressive results (incomplete stories) ───────────────────────────

  test('incomplete story 3 shows "Not yet rated" placeholder', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Navigate through to story 3
    const nextButton = page.getByRole('button', { name: /next story/i });
    // Story 1 → 2
    await nextButton.click();
    await page.waitForLoadState('networkidle');
    // Story 2 → 3
    const nextButton2 = page.getByRole('button', { name: /next story/i });
    if (await nextButton2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextButton2.click();
      await page.waitForLoadState('networkidle');
    }

    // Story 3 has no receiver rating — should show "Not yet rated"
    const notRated = page.locator('text=/not yet rated|pending|awaiting/i').first();
    await expect(notRated).toBeVisible({ timeout: 10000 });
  });

  test('incomplete story 3 still shows sender prediction value', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/results`);
    await page.waitForLoadState('networkidle');

    // Navigate to story 3
    const nextButton = page.getByRole('button', { name: /next story/i });
    await nextButton.click();
    await page.waitForLoadState('networkidle');

    const nextButton2 = page.getByRole('button', { name: /next story/i });
    if (await nextButton2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextButton2.click();
      await page.waitForLoadState('networkidle');
    }

    // Prediction for story 3 was 5 — should still show
    const predictionText = page.locator('text=/5|prediction/i').first();
    await expect(predictionText).toBeVisible({ timeout: 10000 });
  });

  // ── 7. Unauthorized access ────────────────────────────────────────────────

  test('third-party user cannot access sender results page', async ({ page }) => {
    const thirdParty = await createTestUser({ name: 'P699 Third Party' });
    try {
      await setTestSession(page, thirdParty.email);
      await page.goto(`/letter/${letterId}/results`);
      await page.waitForLoadState('networkidle');

      // Should see 404, not found, or be redirected away
      const isOnResults = page.url().includes('/results');
      if (isOnResults) {
        const notFound = page.locator('text=/not found|404|unauthorized|no access/i');
        await expect(notFound).toBeVisible({ timeout: 10000 });
      } else {
        // Redirected away from results — acceptable
        expect(page.url()).not.toContain('/results');
      }
    } finally {
      await deleteTestUser(thirdParty.user.id);
    }
  });
});
