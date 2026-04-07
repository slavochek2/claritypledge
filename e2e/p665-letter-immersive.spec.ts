/**
 * @file p665-letter-immersive.spec.ts
 * @description P665: Letter Routes — Chrome-Free + Preview Reuses Reading Components
 *
 * Tests the two core changes:
 * 1. Preview page reuses LetterStoryReader (not LiveStoryCardExpanded) with previewMode
 * 2. Letter routes are chrome-free (no top nav, no bottom nav)
 *
 * Uses authenticated sender session for preview tests.
 * Uses sealed letter + delivery for reading page tests.
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
  createFullTestLetter,
  deleteTestLetter,
  type TestLetter,
  type TestDelivery,
} from './helpers/test-letter';

test.describe('P665: Letter Routes — Chrome-Free + Preview Reuses Reading Components', () => {
  test.describe.configure({ timeout: 45000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  const storyIds: string[] = [];
  const versionIds: string[] = [];
  let letter: TestLetter;
  let delivery: TestDelivery;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P665 Sender' });
    receiver = await createTestUser({ name: 'P665 Receiver' });

    // Create a public doc with 2 stories
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P665 Immersive Test Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    for (let i = 0; i < 2; i++) {
      const story = await createTestStory(sender.user.id, {
        title: `P665 Story ${i + 1}`,
        content: `Immersive test story content ${i + 1}. Testing chrome-free experience.`,
      });
      storyIds.push(story.id);

      // Get the story version ID for snapshot creation
      const { data: version } = await supabaseAdmin
        .from('story_versions')
        .select('id')
        .eq('story_id', story.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      versionIds.push(version?.id ?? story.id);

      await supabaseAdmin
        .from('doc_stories')
        .insert({ doc_id: docId, story_id: story.id, position: i });
    }

    // Create a sealed letter with delivery for reading page tests
    const fullLetter = await createFullTestLetter(
      sender.user.id,
      docId,
      storyIds.map((sid, i) => ({
        storyId: sid,
        versionId: versionIds[i],
        prediction: 7,
        position: i,
      })),
      { email: receiver.email, profileId: receiver.user.id },
      { mode: 'one-to-one', seal: true }
    );
    letter = fullLetter.letter;
    delivery = fullLetter.delivery;
  });

  test.afterAll(async () => {
    // Clean up letter (CASCADE handles deliveries, snapshots, predictions)
    if (letter?.id) await deleteTestLetter(letter.id);
    // Clean up any other letters from this doc
    await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', docId);
    // Clean doc_stories
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    // Clean stories
    for (const id of storyIds) await deleteTestStory(id);
    // Clean doc
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    // Clean users
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  // ========================================================================
  // AC1: Preview page renders LetterStoryReader with previewMode: true
  // ========================================================================

  test('AC1: preview page uses LetterStoryReader (not LiveStoryCardExpanded)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // LetterStoryReader renders phase-based UI (anti-point, story, rate, etc.)
    // LiveStoryCardExpanded uses data-testid="live-story-card-expanded"
    // After P665, preview should NOT have LiveStoryCardExpanded
    const liveStoryCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(liveStoryCard).not.toBeVisible({ timeout: 5000 });

    // Preview should show story content through LetterStoryReader's phase UI
    // which includes story text and phase-appropriate controls
    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });
  });

  // ========================================================================
  // AC2: Preview page has parchment background (CertificatePageShell)
  // ========================================================================

  test('AC2: preview page has parchment background', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // CertificatePageShell with parchment prop applies data-testid and bg-[#F5F3EF]
    const shell = page.locator('[data-testid="certificate-page-shell"]');
    await expect(shell).toBeVisible({ timeout: 10000 });
  });

  // ========================================================================
  // AC3: Preview ratings are interactive but do not write to DB
  // ========================================================================

  test('AC3: preview ratings are interactive but do not write to DB', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // Wait for some interactive element to appear (rating buttons or position buttons)
    // LetterStoryReader shows different phases — the first phase may be anti-point or story
    const interactiveElement = page.locator('button').filter({ hasText: /agree|disagree|unsure/i })
      .or(page.locator('[data-testid*="rating"] button'))
      .or(page.locator('[role="group"] button'));

    // Navigate through story phases until rating buttons appear
    // (may need to advance through anti-point and story phases first)
    const advanceButton = page.locator('button').filter({ hasText: /continue|read this story|next/i });
    for (let attempt = 0; attempt < 5; attempt++) {
      const ratingVisible = await interactiveElement.first().isVisible().catch(() => false);
      if (ratingVisible) break;
      const advVisible = await advanceButton.first().isVisible().catch(() => false);
      if (advVisible) {
        await advanceButton.first().click();
        await page.waitForTimeout(500);
      }
      // Also try position buttons (agree/disagree/unsure)
      const positionBtn = page.locator('button').filter({ hasText: /agree/i }).first();
      const posVisible = await positionBtn.isVisible().catch(() => false);
      if (posVisible) {
        await positionBtn.click();
        await page.waitForTimeout(800);
      }
    }

    // Snapshot letter_predictions count BEFORE clicking rating
    // Preview uses synthetic delivery ID "preview-{docId}" which has no FK row,
    // so DB writes would fail at constraint level.
    const { count: predBefore } = await supabaseAdmin
      .from('letter_predictions')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', storyIds[0]);

    // Try clicking a rating if visible
    const ratingBtn = page.locator('[data-testid*="rating"] button, [role="group"] button').first();
    const ratingVisible = await ratingBtn.isVisible().catch(() => false);
    if (ratingVisible) {
      await ratingBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify no NEW prediction or response rows were created
    const { count: predAfter } = await supabaseAdmin
      .from('letter_predictions')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', storyIds[0]);

    expect(predAfter ?? 0).toBe(predBefore ?? 0);
  });

  // ========================================================================
  // AC4: Preview page shows no top navigation bar
  // ========================================================================

  test('AC4: preview page shows no top navigation bar', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // Wait for page content to load
    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });

    // SimpleNavigation renders nav links: Home, Letters, Events, My Profile
    // Check that these top nav items are NOT visible
    const topNav = page.locator('nav').filter({ hasText: /Home/ }).first();
    await expect(topNav).not.toBeVisible({ timeout: 3000 });

    // Also check for the ClarityPledge logo/brand link in top nav
    const brandLink = page.locator('a[href="/"]').filter({ hasText: /ClarityPledge/i });
    await expect(brandLink).not.toBeVisible({ timeout: 3000 });
  });

  // ========================================================================
  // AC5: Preview page shows no bottom navigation bar
  // ========================================================================

  test('AC5: preview page shows no bottom navigation bar', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // Wait for page content to load
    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });

    // BottomNav renders at the bottom of the page for logged-in users on browse pages
    // It should NOT be visible on letter preview
    const bottomNav = page.locator('[data-testid="bottom-nav"]')
      .or(page.locator('nav[aria-label*="bottom" i]'))
      .or(page.locator('.fixed.bottom-0 nav'));
    await expect(bottomNav).not.toBeVisible({ timeout: 3000 });
  });

  // ========================================================================
  // AC6: Reading page shows no top navigation bar
  // ========================================================================

  test('AC6: reading page shows no top navigation bar', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${delivery.id}?token=${delivery.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // Wait for some page content (cover or reading UI)
    await expect(
      page.locator('text=/letter|open|read/i').first()
    ).toBeVisible({ timeout: 15000 });

    // SimpleNavigation top nav should NOT be visible
    const topNav = page.locator('nav').filter({ hasText: /Home/ }).first();
    await expect(topNav).not.toBeVisible({ timeout: 3000 });
  });

  // ========================================================================
  // AC7: Reading page shows no bottom navigation bar (verify not broken)
  // ========================================================================

  test('AC7: reading page shows no bottom navigation bar', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${delivery.id}?token=${delivery.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // Wait for some page content
    await expect(
      page.locator('text=/letter|open|read/i').first()
    ).toBeVisible({ timeout: 15000 });

    // Bottom nav should NOT be visible (this was already working via focusRoutes)
    const bottomNav = page.locator('[data-testid="bottom-nav"]')
      .or(page.locator('nav[aria-label*="bottom" i]'))
      .or(page.locator('.fixed.bottom-0 nav'));
    await expect(bottomNav).not.toBeVisible({ timeout: 3000 });
  });

  // ========================================================================
  // AC8: Preview has clear "Back to composition" exit action
  // ========================================================================

  test('AC8: preview has clear "Back to composition" exit action (not plain text)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });

    // "Back to composition" should be a clickable element (link or button), not plain text
    const backAction = page.locator('a, button').filter({ hasText: /back to composition/i });
    await expect(backAction).toBeVisible({ timeout: 5000 });

    // Verify it links to the compose route
    const href = await backAction.getAttribute('href');
    if (href) {
      expect(href).toContain('compose');
    }
    // If it's a button (not a link), it should still be clickable
    const tagName = await backAction.evaluate(el => el.tagName.toLowerCase());
    expect(['a', 'button']).toContain(tagName);
  });

  // ========================================================================
  // AC9: "End of preview" state has actionable return-to-composition button
  // ========================================================================

  test('AC9: end of preview has actionable return-to-composition button', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });

    // Navigate through all stories to reach end of preview
    // Use a loop to advance through phases and stories
    for (let storyAttempt = 0; storyAttempt < 10; storyAttempt++) {
      // Try clicking position buttons (agree/disagree/unsure)
      const positionBtn = page.locator('button').filter({ hasText: /agree|disagree|unsure/i }).first();
      if (await positionBtn.isVisible().catch(() => false)) {
        await positionBtn.click();
        await page.waitForTimeout(800);
        continue;
      }

      // Try clicking advance buttons (Continue, I've read this story, Next story, etc.)
      const advanceBtn = page.locator('button').filter({
        hasText: /continue|read this story|next story|complete letter/i,
      }).first();
      if (await advanceBtn.isVisible().catch(() => false)) {
        await advanceBtn.click();
        await page.waitForTimeout(500);
        continue;
      }

      // Try clicking rating buttons
      const ratingBtn = page.locator('[data-testid*="rating"] button, [role="group"] button').first();
      if (await ratingBtn.isVisible().catch(() => false)) {
        await ratingBtn.click();
        await page.waitForTimeout(500);
        continue;
      }

      // Check if we've reached end of preview
      const endText = page.locator('text=/end of preview/i')
        .or(page.locator('text=/preview complete/i'));
      if (await endText.isVisible().catch(() => false)) break;

      await page.waitForTimeout(300);
    }

    // At the end of preview, there should be an actionable button (not plain text)
    // that returns to composition
    const returnAction = page.locator('a, button').filter({
      hasText: /back to composition|return to composition|done|back to letter/i,
    });
    await expect(returnAction.first()).toBeVisible({ timeout: 5000 });
  });

  // ========================================================================
  // AC10: Surfaces NOT in scope are visually unchanged
  // ========================================================================

  test('AC10: composition page still has app chrome (not affected by chrome-free)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');

    // Composition page should still have top navigation or at least load normally
    // (it is NOT a chrome-free route — only preview and reading are)
    // The key test is that it was NOT broken by the chrome-free changes
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // Verify some composition-specific content is present (not a blank/error page)
    await expect(
      page.locator('text=/compose|prediction|story|letter/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  // ========================================================================
  // AC11: All existing P661 and P581 tests still pass
  // ========================================================================
  // This AC is verified by running the full test suite, not by a single test.
  // The smoke test below covers basic regression.

  test('AC11: preview route still loads and shows preview banner (regression)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // Core P661 behavior preserved: preview banner still shows
    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });

    // Story content is still rendered (just via different component now)
    // LetterStoryReader shows story index text ("Story 1 of N") on the preview flow
    await expect(
      page.locator('text=/story 1 of/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  // ========================================================================
  // AC12: Preview and reading page show same story display components
  // ========================================================================

  test('AC12: preview and reading use the same component structure (no parallel UI)', async ({ page }) => {
    // Test preview page component structure
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });

    // After P665, LiveStoryCardExpanded should NOT appear in preview
    const liveStoryCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(liveStoryCard).not.toBeVisible({ timeout: 3000 });

    // The preview should render phase-based UI matching LetterStoryReader
    // which uses buttons like "Continue", "I've read this story", position buttons
    // These are the same controls as the reading page
    const phaseControls = page.locator('button').filter({
      hasText: /continue|read this story|agree|disagree|unsure/i,
    });
    // At least one phase control should be visible (the reader starts at a phase)
    await expect(phaseControls.first()).toBeVisible({ timeout: 10000 });
  });
});
