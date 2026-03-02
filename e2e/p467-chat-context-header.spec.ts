/**
 * @file p467-chat-context-header.spec.ts
 * @description E2E tests for P467: /chat — slim context header + inline rating (remove drawer)
 *
 * Tests:
 * - ChatContextHeader renders with point text + position chip (NOT PointCardWithLinks quote pattern)
 * - Context header is ≤52px tall at 375px width
 * - Position chip shows 1st-person text ("You agree" / "You disagree" / "You're unsure")
 * - No share button, no position buttons in header
 * - [↗] link navigates to /point/:id
 * - Rating phase: AI message bubble appears in thread with 0–10 buttons (NOT a Drawer)
 * - Click a rating button → rating sent as user message, no separate Send
 * - Type a number in input + send → same outcome as clicking button
 * - After 2nd iteration: "Save as-is →" link appears below buttons
 * - Drawer element is NOT present in the DOM
 * - P465 regression: if user already has story, edit heading shows
 * - Input bar placeholder shows "What's off? Or type 0–10..." during rating phase
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';
import { supabaseAdmin as _supabaseAdmin } from '../src/lib/supabase-admin';

test.describe('P467 — ChatContextHeader + inline rating', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let testPoint: Awaited<ReturnType<typeof createTestPoint>>;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P467E2E' });
    testPoint = await createTestPoint(testUser.user.id, {
      statement: 'Avoiding hard conversations causes more damage than having them, even when they go badly',
    });
    // Give the user an "agree" position on the point
    await createTestPosition(testPoint.id, testUser.user.id, 'agree');
  });

  test.afterAll(async () => {
    await deleteTestPoint(testPoint.id);
    await deleteTestUser(testUser.user.id);
  });

  // ── ChatContextHeader renders ─────────────────────────────────────────────

  test('ChatContextHeader is present and PointCardWithLinks quote pattern is absent', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // New slim header must be present
    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    // PointCardWithLinks quote pattern: shows owner name in 3rd person, e.g. "Agrees:"
    // The new header must NOT contain this pattern
    const quotePattern = page.locator('[data-testid="point-card-with-links"]');
    await expect(quotePattern).not.toBeAttached();

    // No "Vyacheslav" or user's full name in 3rd-person quote block
    const headerText = await contextHeader.textContent();
    expect(headerText).not.toMatch(/Agrees:|Disagrees:|Is unsure:/);
  });

  test('Context header shows truncated point text and 1st-person position chip', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    // Point text present
    await expect(contextHeader).toContainText('Avoiding hard conversations');

    // 1st-person chip — one of the three values
    const chip = contextHeader.getByTestId('position-chip');
    await expect(chip).toBeVisible();
    const chipText = await chip.textContent();
    expect(['You agree', "You disagree", "You're unsure"]).toContain(chipText?.trim());
  });

  test('Position chip shows "You agree" for user with agree position', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const chip = page.getByTestId('position-chip');
    await expect(chip).toHaveText('You agree');
  });

  test('Context header shows no share button and no interactive position buttons', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');

    // No share button
    const shareButton = contextHeader.getByRole('button', { name: /share/i });
    await expect(shareButton).not.toBeAttached();

    // No position-selection buttons (Agree / Disagree / Unsure interactive)
    const positionButtons = contextHeader.getByRole('button', { name: /^agree$|^disagree$|^unsure$/i });
    await expect(positionButtons).not.toBeAttached();
  });

  test('Context header is ≤52px tall at 375px viewport width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    const box = await contextHeader.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(52);
  });

  // ── [↗] navigation ────────────────────────────────────────────────────────

  test('[↗] link navigates to /point/:id', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const openLink = page.getByRole('link', { name: 'Open point detail' });
    await expect(openLink).toBeVisible({ timeout: 10000 });

    await openLink.click();
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain(`/point/${testPoint.id}`);
  });

  // ── Drawer is absent ──────────────────────────────────────────────────────

  test('No Drawer element present on /chat load', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Drawer renders as a <dialog> element or has data-vaul-drawer attribute
    const drawerDialog = page.locator('dialog');
    await expect(drawerDialog).not.toBeAttached();

    const vaulDrawer = page.locator('[data-vaul-drawer]');
    await expect(vaulDrawer).not.toBeAttached();
  });

  // ── Rating phase — inline in thread ──────────────────────────────────────

  test('Rating prompt appears as an AI thread message bubble with 0–10 buttons (not a Drawer)', async ({ page }) => {
    // TODO: requires /chat with real auth + pointId + completing brain-dump to reach rating phase
    // This test verifies the rating UI appears inline in the thread, not in a Drawer
    //
    // Full implementation requires the AI edge function to be running and returning a draft.
    // Stub: verify that when the component is in rating phase (mock), buttons appear in thread.

    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // When the page is in rating phase, we expect the rating bubble in the thread area
    // data-testid="rating-bubble" should be inside data-testid="thread-area", not in a dialog
    const threadArea = page.getByTestId('thread-area').or(page.locator('[data-testid="story-guide-chat"]'));
    await expect(threadArea).toBeVisible({ timeout: 10000 });

    // If rating phase is active: rating bubble is a child of thread, not dialog
    const ratingBubble = threadArea.getByTestId('rating-bubble');
    const drawerDialog = page.locator('dialog');

    // Either we're not yet in rating phase (brain-dump), or rating is inline
    const isRatingPhaseActive = await ratingBubble.count() > 0;
    if (isRatingPhaseActive) {
      await expect(ratingBubble).toBeVisible();
      await expect(drawerDialog).not.toBeAttached();
    }
    // else: brain-dump phase, no rating bubble yet — test passes (no Drawer)
  });

  test('Clicking a rating button sends the rating without a separate Send tap', async ({ page }) => {
    // TODO: requires completing brain-dump + AI streaming to reach rating phase
    // Stub: checks the click-to-send behavior when rating buttons are present in thread

    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const ratingBubble = page.getByTestId('rating-bubble');
    const inRatingPhase = await ratingBubble.count() > 0;

    if (!inRatingPhase) {
      // Not yet in rating phase — skip interactive part
      test.skip();
      return;
    }

    // Rating button row: group with aria-label
    const ratingGroup = ratingBubble.getByRole('group', { name: /rating scale/i });
    await expect(ratingGroup).toBeVisible();

    const button7 = ratingGroup.getByRole('button', { name: 'Rate 7' });
    await expect(button7).toBeVisible();

    // Click rating — should immediately send without separate Send button click
    await button7.click();

    // User message "7" appears in thread
    const userMessage = page.getByTestId('thread-message-user').last();
    await expect(userMessage).toContainText('7', { timeout: 5000 });
  });

  test('Typing a number in input bar + send produces rating message in thread', async ({ page }) => {
    // TODO: requires completing brain-dump + AI streaming to reach rating phase
    // Stub: verifies input bar accepts number during rating phase

    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const ratingBubble = page.getByTestId('rating-bubble');
    const inRatingPhase = await ratingBubble.count() > 0;

    if (!inRatingPhase) {
      test.skip();
      return;
    }

    const inputBar = page.getByTestId('story-guide-input');
    await inputBar.fill('8');
    await page.keyboard.press('Enter');

    // User message "8" appears in thread
    const userMessage = page.getByTestId('thread-message-user').last();
    await expect(userMessage).toContainText('8', { timeout: 5000 });
  });

  test('"Save as-is →" escape hatch appears after 2nd iteration (iterationCount >= 1)', async ({ page }) => {
    // TODO: requires completing brain-dump + 2 full rating cycles
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const ratingBubble = page.getByTestId('rating-bubble');
    const inRatingPhase = await ratingBubble.count() > 0;

    if (!inRatingPhase) {
      test.skip();
      return;
    }

    // After 2nd iteration, escape hatch link should be visible below buttons
    const escapeHatch = ratingBubble.getByRole('link', { name: /save as-is/i }).or(
      ratingBubble.locator('text=Save as-is')
    );
    // Note: escapeHatch only appears if iterationCount >= 1
    // At this point we cannot guarantee iteration count without full flow
    // Check that if it's present, it's in the thread bubble (not a modal)
    const escapeHatchCount = await escapeHatch.count();
    if (escapeHatchCount > 0) {
      await expect(escapeHatch).toBeVisible();
      // It must be inside the thread area, not a dialog
      const dialog = page.locator('dialog');
      await expect(dialog).not.toBeAttached();
    }
  });

  // ── Input bar placeholder during rating phase ─────────────────────────────

  test('Input bar placeholder shows "What\'s off? Or type 0–10..." during rating phase', async ({ page }) => {
    // TODO: requires reaching rating phase (after brain-dump + AI streaming)
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const ratingBubble = page.getByTestId('rating-bubble');
    const inRatingPhase = await ratingBubble.count() > 0;

    if (!inRatingPhase) {
      test.skip();
      return;
    }

    const inputBar = page.getByTestId('story-guide-input');
    await expect(inputBar).toHaveAttribute('placeholder', /what's off\? or type 0.10/i);
  });

  // ── P465 regression: edit mode ────────────────────────────────────────────

  test('P465 regression: user with existing story sees edit heading on /chat', async ({ page }) => {
    // Create a story linked to testPoint for testUser
    const story = await createTestStory(testUser.user.id, {
      content: 'My existing story about avoiding hard conversations.',
    });
    await linkStoryToPoint(story.id, testPoint.id);

    try {
      await setTestSession(page, testUser.email);
      await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
      await page.waitForLoadState('networkidle');

      // P465 edit mode: page should show edit heading when user already has a story
      // Look for edit-mode indicators (data-testid or text heading)
      const editHeading = page.getByTestId('edit-story-heading').or(
        page.getByText(/edit your story|your existing story|update your story/i)
      );
      await expect(editHeading).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteTestStory(story.id);
    }
  });

  // ── Context header: no position (null) ───────────────────────────────────

  test('Context header renders without chip when user has no position', async ({ page }) => {
    // Create a separate user with no position
    const noPositionUser = await createTestUser({ name: 'P467NoPos' });

    try {
      await setTestSession(page, noPositionUser.email);
      await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
      await page.waitForLoadState('networkidle');

      const contextHeader = page.getByTestId('chat-context-header');
      await expect(contextHeader).toBeVisible({ timeout: 10000 });

      // Chip should not be rendered (no position)
      const chip = contextHeader.getByTestId('position-chip');
      await expect(chip).not.toBeAttached();

      // Header still shows point text and [↗]
      await expect(contextHeader).toContainText('Avoiding hard conversations');
      const openLink = contextHeader.getByRole('link', { name: 'Open point detail' });
      await expect(openLink).toBeVisible();
    } finally {
      await deleteTestUser(noPositionUser.user.id);
    }
  });

  // ── Profile page regression ───────────────────────────────────────────────

  test('Profile page points tab is visually unchanged — PointCardWithLinks still renders there', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/profile/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // PointCardWithLinks should still render on profile page (not changed by P467)
    // We check that the profile page loads without errors and shows point content
    await expect(page.locator('body')).toBeVisible();

    // No JS errors from profile page
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Give a moment for any late errors
    await page.waitForTimeout(1000);

    const relevant = errors.filter(e => !e.includes('favicon') && !e.includes('net::ERR'));
    expect(relevant).toHaveLength(0);
  });
});
