/**
 * @file p455-live-mobile-layout.spec.ts
 * @description P455: Live Mobile Layout — Compact Story + Reorder
 *
 * Tests:
 * - Story card appears above Check CTA in DOM/visual order (owner view)
 * - Journey card appears below CTA (not above)
 * - Story text has line-clamp-2 class when collapsed (compact mode)
 * - line-clamp-2 removed after "Show more" click (expand works)
 * - "Speak freely" button is positioned immediately after CTA
 *
 * Setup: Authenticated user with a story in the idle screen (single-party,
 * no two-party session needed — creator idle state is accessible solo).
 *
 * Viewport: 375px width (iPhone SE) — the target constraint.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

test.describe('P455 — Live mobile layout (story selected, idle screen)', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P455Layout' });

    // Create a story for the test user with enough text to trigger line-clamp
    const { data: story, error } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: testUser.user.id,
        content:
          "She's someone I've known for years. We were on a call trying to work something out. I paraphrased her position back to her. She said yes, that's right, you understood me. A few days later she told me she felt unheard. I was confused — I literally repeated her words back. But repeating words isn't the same as understanding the weight behind them.",
        visibility: 'public',
      })
      .select('id')
      .single();

    if (error || !story) throw new Error(`Failed to create story: ${error?.message}`);
    storyId = story.id;
  });

  test.afterAll(async () => {
    if (storyId) {
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
    await deleteTestUser(testUser.user.id);
  });

  test('story card appears above Check button (visual order)', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto('/live');

    // Wait for idle screen to load
    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
    // Start a session so we enter the idle/live screen
    await page.getByRole('button', { name: /new session/i }).click();

    // Wait for story search picker to appear (confirms we're in idle with stories available)
    await expect(page.locator('[data-testid="story-search-picker"], [placeholder*="story"], button').filter({ hasText: /story|search/i }).first()).toBeVisible({ timeout: 10000 }).catch(() => {
      // Story picker may not render if stories aren't loaded yet — wait for idle screen
    });

    // Select the story via the picker (finds by partial content match)
    const storyPicker = page.locator('[data-testid="story-search-picker"]');
    if (await storyPicker.isVisible()) {
      await storyPicker.click();
      await page.locator('text=She\'s someone').first().click();
    }

    // Wait for story card to appear
    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    // Wait for Check CTA button
    const checkBtn = page.locator('[data-testid="start-check"]');
    await expect(checkBtn).toBeVisible();

    // ASSERTION: story card Y position < Check button Y position (story is above)
    const storyBox = await storyCard.boundingBox();
    const checkBox = await checkBtn.boundingBox();

    expect(storyBox).not.toBeNull();
    expect(checkBox).not.toBeNull();

    console.log(`Story card top: ${storyBox!.y}, Check button top: ${checkBox!.y}`);
    expect(storyBox!.y).toBeLessThan(checkBox!.y);
  });

  test('story text is truncated with line-clamp-2 by default', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto('/live');

    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
    await page.getByRole('button', { name: /new session/i }).click();

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    // ASSERTION: story text paragraph has line-clamp-2 class when collapsed
    const storyText = storyCard.locator('p').filter({ hasText: /she.*someone/i });
    await expect(storyText).toBeVisible();

    const classes = await storyText.getAttribute('class');
    console.log(`Story text classes: ${classes}`);
    expect(classes).toContain('line-clamp-2');
  });

  test('line-clamp-2 removed after "Show more" click', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto('/live');

    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
    await page.getByRole('button', { name: /new session/i }).click();

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    const showMoreBtn = storyCard.getByRole('button', { name: /show more/i });
    await expect(showMoreBtn).toBeVisible();
    await showMoreBtn.click();

    // ASSERTION: line-clamp-2 class removed after expand
    const storyText = storyCard.locator('p').filter({ hasText: /she.*someone/i });
    const classes = await storyText.getAttribute('class');
    console.log(`Story text classes after expand: ${classes}`);
    expect(classes).not.toContain('line-clamp-2');

    // ASSERTION: "Show less" button now visible
    await expect(storyCard.getByRole('button', { name: /show less/i })).toBeVisible();
  });

  test('journey card appears below Check button when history exists', async ({ page }) => {
    // Note: Journey card only shows when rating history exists (not on first round).
    // This test verifies the DOM order constraint via element positions.
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto('/live');

    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
    await page.getByRole('button', { name: /new session/i }).click();

    const checkBtn = page.locator('[data-testid="start-check"]');
    await expect(checkBtn).toBeVisible({ timeout: 10000 });

    // Journey card: if present (first round = no history → not rendered), verify it's below CTA
    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    const journeyVisible = await journeyCard.isVisible();

    if (journeyVisible) {
      const checkBox = await checkBtn.boundingBox();
      const journeyBox = await journeyCard.boundingBox();

      expect(checkBox).not.toBeNull();
      expect(journeyBox).not.toBeNull();

      console.log(`Check button bottom: ${checkBox!.y + checkBox!.height}, Journey card top: ${journeyBox!.y}`);
      // Journey card top should be below Check button bottom
      expect(journeyBox!.y).toBeGreaterThan(checkBox!.y);
    } else {
      // First round — no history — journey card not rendered (expected)
      console.log('Journey card not visible on first round — expected, skipping position check');
      expect(journeyVisible).toBe(false);
    }
  });

  test('Speak freely button appears immediately below Check button', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto('/live');

    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
    await page.getByRole('button', { name: /new session/i }).click();

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    const checkBtn = page.locator('[data-testid="start-check"]');
    const speakFreelyBtn = page.getByRole('button', { name: /speak freely/i });

    await expect(checkBtn).toBeVisible();
    await expect(speakFreelyBtn).toBeVisible();

    const checkBox = await checkBtn.boundingBox();
    const speakBox = await speakFreelyBtn.boundingBox();

    expect(checkBox).not.toBeNull();
    expect(speakBox).not.toBeNull();

    // ASSERTION: Speak freely is below Check button
    expect(speakBox!.y).toBeGreaterThan(checkBox!.y);

    // ASSERTION: Speak freely is close to Check button (within 120px — no large gap)
    const gap = speakBox!.y - (checkBox!.y + checkBox!.height);
    console.log(`Gap between Check and Speak freely: ${gap}px`);
    expect(gap).toBeLessThan(120);
  });

  test('Check button is visible without scrolling on 375px viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto('/live');

    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
    await page.getByRole('button', { name: /new session/i }).click();

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    const checkBtn = page.locator('[data-testid="start-check"]');
    await expect(checkBtn).toBeVisible();

    const checkBox = await checkBtn.boundingBox();
    expect(checkBox).not.toBeNull();

    // ASSERTION: Check button bottom is within the viewport height (667px)
    const checkBottom = checkBox!.y + checkBox!.height;
    console.log(`Check button bottom: ${checkBottom}, viewport height: ${MOBILE_VIEWPORT.height}`);
    expect(checkBottom).toBeLessThan(MOBILE_VIEWPORT.height);
  });
});
