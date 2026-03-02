/**
 * @file p455-live-mobile-layout.spec.ts
 * @description P455: Live Mobile Layout — Compact Story + Reorder
 *
 * Tests:
 * - Story card appears above Check CTA in DOM/visual order (owner view)
 * - Journey card appears above CTA when history exists (P469: reverted P455 reorder)
 * - Story text is truncated at ~100 chars with ellipsis when collapsed (P469: STORY_THRESHOLD=100)
 * - Ellipsis removed and full text shown after "Show more" click (P469: character-slice only, no line-clamp-2)
 * - "Speak freely" button is positioned immediately after CTA
 *
 * Setup: Uses direct clarity_sessions injection + ?insights=off to bypass mic check.
 * Same pattern as P469 tests — no two-party UI flow needed.
 *
 * Viewport: 375px width (iPhone SE) — the target constraint.
 */

import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, deleteClaritySession } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

const LONG_STORY =
  "She's someone I've known for years. We were on a call trying to work something out. I paraphrased her position back to her. She said yes, that's right, you understood me. A few days later she told me she felt unheard. I was confused — I literally repeated her words back. But repeating words isn't the same as understanding the weight behind them.";

function genCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function makeLiveState(options: {
  storyId: string;
  storyContent: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  checkerName: string;
  checkerRating?: number;
  responderRating?: number;
}) {
  const { storyId, storyContent, authorId, authorName, authorSlug, checkerName, checkerRating, responderRating } =
    options;
  return {
    ratingPhase: 'idle' as const,
    selectedStoryId: storyId,
    selectedStoryData: {
      id: storyId,
      content: storyContent,
      authorId,
      authorName,
      authorSlug,
      points: [],
    },
    checkerName,
    checkerRating,
    responderRating,
    explainBackRatings: [] as number[],
  };
}

async function createTestSession(options: {
  creatorName: string;
  creatorProfileId: string;
  liveState: object;
}): Promise<string> {
  const code = genCode();
  const { error } = await supabaseAdmin.from('clarity_sessions').insert({
    code,
    creator_name: options.creatorName,
    creator_profile_id: options.creatorProfileId,
    joiner_name: 'TestPartner',
    state: {},
    live_state: options.liveState,
    is_private: true,
  });
  if (error) throw new Error(`Failed to create test session: ${error.message}`);
  return code;
}

function injectSessionStorage(page: Page, code: string, userName: string) {
  page.context().addInitScript(
    ({ keys }: { keys: Record<string, string> }) => {
      for (const [k, v] of Object.entries(keys)) {
        sessionStorage.setItem(k, v);
      }
    },
    {
      keys: {
        clarity_live_session_code: code,
        clarity_live_user_name: userName,
        clarity_live_is_creator: 'true',
      },
    },
  );
}

test.describe('P455 — Live mobile layout (story selected, idle screen)', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionCode: string;
  let sessionCodeWithHistory: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P455Layout' });

    // Create a story for the test user with enough text to trigger truncation
    const { data: story, error } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: testUser.user.id,
        content: LONG_STORY,
        visibility: 'public',
      })
      .select('id')
      .single();

    if (error || !story) throw new Error(`Failed to create story: ${error?.message}`);
    storyId = story.id;

    // Session without history (for layout + truncation tests)
    sessionCode = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        checkerName: testUser.name,
      }),
    });

    // Session WITH rating history (for journey card visibility test)
    sessionCodeWithHistory = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        checkerName: testUser.name,
        checkerRating: 6,
        responderRating: 8,
      }),
    });
  });

  test.afterAll(async () => {
    if (sessionCode) await deleteClaritySession(sessionCode);
    if (sessionCodeWithHistory) await deleteClaritySession(sessionCodeWithHistory);
    if (storyId) {
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
    await deleteTestUser(testUser.user.id);
  });

  test('story card appears above Check button (visual order)', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

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

  test('story text is truncated at ~100 chars with ellipsis by default', async ({ page }) => {
    // P469: STORY_THRESHOLD lowered 180→100. No line-clamp-2 — character-slice only.
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    // ASSERTION: story text is truncated with ellipsis (character-slice at 100 chars)
    const storyText = storyCard.locator('p').filter({ hasText: /she.*someone/i });
    await expect(storyText).toBeVisible();

    const textContent = await storyText.textContent();
    console.log(`Story text content: ${textContent}`);
    expect(textContent).toContain('…');

    // ASSERTION: "Show more" button is visible (truncation triggered)
    await expect(storyCard.getByRole('button', { name: /show more/i })).toBeVisible();
  });

  test('ellipsis removed and full text shown after "Show more" click', async ({ page }) => {
    // P469: no line-clamp-2 — expand removes character-slice truncation (ellipsis disappears)
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    const showMoreBtn = storyCard.getByRole('button', { name: /show more/i });
    await expect(showMoreBtn).toBeVisible();
    await showMoreBtn.click();

    // ASSERTION: ellipsis gone after expand
    const storyText = storyCard.locator('p').filter({ hasText: /she.*someone/i });
    const textContent = await storyText.textContent();
    console.log(`Story text content after expand: ${textContent}`);
    expect(textContent).not.toContain('…');

    // ASSERTION: "Show less" button now visible
    await expect(storyCard.getByRole('button', { name: /show less/i })).toBeVisible();
  });

  test('journey card appears above Check button when history exists', async ({ page }) => {
    // P469: P455 reorder reverted. Journey is at the top when hasRatingData — above story and CTA.
    // This session has checkerRating + responderRating set → hasRatingData = true → journey renders.
    injectSessionStorage(page, sessionCodeWithHistory, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const checkBtn = page.locator('[data-testid="start-check"]');
    await expect(checkBtn).toBeVisible({ timeout: 15000 });

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 10000 });

    const checkBox = await checkBtn.boundingBox();
    const journeyBox = await journeyCard.boundingBox();

    expect(checkBox).not.toBeNull();
    expect(journeyBox).not.toBeNull();

    console.log(`Journey card top: ${journeyBox!.y}, Check button top: ${checkBox!.y}`);
    // Journey card top should be ABOVE Check button (P469: original order restored)
    expect(journeyBox!.y).toBeLessThan(checkBox!.y);
  });

  test('Speak freely button appears immediately below Check button', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

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
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

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
