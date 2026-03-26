/**
 * @file p588-live-layout-sticky-cta.spec.ts
 * @description P588: /live Layout — Sticky CTA, Accordion Story, Peek Points
 *
 * Tests:
 * - BottomNav hidden on /live route
 * - End Session button is red filled (bg-red-500)
 * - CTA buttons (ActionArea) are always visible (sticky bar)
 * - CTA buttons remain visible when points are expanded
 * - CTA buttons remain visible after scrolling
 * - Calibration banner appears between journey card and story card
 * - Accordion: expanding points auto-collapses story text
 * - Accordion: expanding story text collapses points
 * - Peek mode: 2-line preview when points expanded
 * - Peek mode: only one point fully expanded at a time
 * - Peek mode: PositionButtons visible on expanded point
 * - Regression: free-form idle unchanged
 *
 * Setup pattern: Same as P469 — clarity_sessions DB injection with pre-seeded
 * live_state, sessionStorage injection, setTestSession for auth, ?insights=off
 * to skip mic permission check.
 *
 * Viewport: 375x667 (iPhone SE) — the target constraint.
 */

import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, deleteClaritySession } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

// Story over threshold — triggers truncation
const LONG_STORY =
  "I had fourteen co-founders. Nine separations. None of us wanted them. Most of the friction was unnecessary and avoidable.";

// Points to attach to the story for peek/accordion tests
const POINT_POSITIONS = [
  { content: "If someone can't just trust you, no amount of process will fix that. Trust is the foundation of everything.", stance: 'disagree' },
  { content: "This resonates with my experience. Building trust takes time but the payoff is exponential for team velocity.", stance: 'agree' },
  { content: "I see both sides of this argument. Context matters more than any universal rule about co-founder dynamics.", stance: 'neutral' },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Minimal live_state for idle phase with a story and optional rating/points data. */
function makeLiveState(options: {
  storyId: string;
  storyContent: string;
  authorId: string;
  authorName: string;
  authorSlug: string;
  checkerRating?: number;
  responderRating?: number;
  explainBackRatings?: number[];
  ratingPhase?: string;
  checkerName?: string;
  explainBackDone?: boolean;
  points?: Array<{
    id: string;
    content: string;
    authorId: string;
    authorName: string;
    stance: string;
  }>;
}) {
  return {
    ratingPhase: options.ratingPhase ?? 'idle',
    selectedStoryId: options.storyId,
    selectedStoryData: {
      id: options.storyId,
      content: options.storyContent,
      authorId: options.authorId,
      authorName: options.authorName,
      authorSlug: options.authorSlug,
      authorAvatarColor: '#4A90E2',
      authorHasPledged: false,
      visibility: 'public',
      points: options.points ?? [],
    },
    checkerRating: options.checkerRating,
    responderRating: options.responderRating,
    explainBackRatings: options.explainBackRatings ?? [],
    checkerSubmitted: options.checkerRating !== undefined,
    responderSubmitted: options.responderRating !== undefined,
    checkerName: options.checkerName,
    explainBackDone: options.explainBackDone ?? false,
    speakerSawExplainBackDone: false,
    sessionEnded: false,
  };
}

/** Creates a clarity_sessions record for testing. Returns the session code. */
async function createTestSession(options: {
  creatorName: string;
  creatorProfileId: string;
  liveState: Record<string, unknown>;
}): Promise<string> {
  const code = genCode();
  const { error } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
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

/**
 * Injects live session keys into sessionStorage via addInitScript.
 * Must be called BEFORE setTestSession so keys survive the '/' navigation.
 */
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
    }
  );
}

/** Helper: navigate to /live with auth and mobile viewport. */
async function goToLive(page: Page, code: string, testUser: { name: string; email: string }) {
  injectSessionStorage(page, code, testUser.name);
  await setTestSession(page, testUser.email);
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto('/live?insights=off');
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P588: /live layout redesign', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  const pointIds: string[] = [];
  const sessionCodes: string[] = [];

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P588Layout' });

    // Create a story with enough text to trigger truncation
    const { data: story, error: storyErr } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: testUser.user.id, content: LONG_STORY, visibility: 'public' })
      .select('id')
      .single();
    if (storyErr || !story) throw new Error(`Failed to create story: ${storyErr?.message}`);
    storyId = story.id;

    // Create points linked to the story
    // TODO: Verify the points table schema — columns may be named differently
    // (e.g., story_id, author_id, position_text, stance). Adjust insert if needed.
    for (const pos of POINT_POSITIONS) {
      const { data: point, error: pointErr } = await supabaseAdmin
        .from('points')
        .insert({
          story_id: storyId,
          author_id: testUser.user.id,
          position: pos.content,
          stance: pos.stance,
          visibility: 'public',
        })
        .select('id')
        .single();
      if (pointErr || !point) throw new Error(`Failed to create point: ${pointErr?.message}`);
      pointIds.push(point.id);
    }
  });

  test.afterAll(async () => {
    for (const code of sessionCodes) await deleteClaritySession(code);
    for (const pid of pointIds) await supabaseAdmin.from('points').delete().eq('id', pid);
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(testUser.user.id);
  });

  /** Build points array for live_state from DB point IDs. */
  function makePointsForLiveState() {
    return pointIds.map((id, i) => ({
      id,
      content: POINT_POSITIONS[i].content,
      authorId: testUser.user.id,
      authorName: testUser.name,
      stance: POINT_POSITIONS[i].stance,
    }));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Change 1 — BottomNav hidden
  // ───────────────────────────────────────────────────────────────────────

  test('BottomNav is not visible on /live route', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    // Wait for the live view to render
    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    // BottomNav should not be in the DOM or should be hidden on /live
    // The bottom-nav component uses <nav> with navigation links (Home, Explore, etc.)
    // After P588, /live is in focusRoutes so BottomNav returns null
    const bottomNav = page.locator('nav').filter({ hasText: /Home|Explore|Profile/ });
    await expect(bottomNav).not.toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Change 1 — Red End Session
  // ───────────────────────────────────────────────────────────────────────

  test('End Session button is red filled', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const endSessionBtn = page.getByRole('button', { name: /end session/i });
    await expect(endSessionBtn).toBeVisible({ timeout: 15000 });

    // Verify red filled styling — bg-red-500 should result in red background
    const bgColor = await endSessionBtn.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    console.log(`End Session button background color: ${bgColor}`);
    // bg-red-500 = rgb(239, 68, 68) in Tailwind
    expect(bgColor).toMatch(/rgb\(239,\s*68,\s*68\)/);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Change 2 — Sticky CTA
  // ───────────────────────────────────────────────────────────────────────

  test('CTA buttons are visible without scrolling on 375px viewport', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const actionArea = page.locator('[data-testid="action-area"]');
    await expect(actionArea).toBeVisible({ timeout: 15000 });

    // Verify ActionArea is within the viewport (sticky at bottom)
    const box = await actionArea.boundingBox();
    expect(box).not.toBeNull();
    console.log(`ActionArea position: top=${box!.y}, bottom=${box!.y + box!.height}`);

    // The bottom of ActionArea must be within the viewport height
    expect(box!.y + box!.height).toBeLessThanOrEqual(MOBILE_VIEWPORT.height + 1); // +1 for rounding
    // The top of ActionArea must be within the viewport (visible, not cut off)
    expect(box!.y).toBeGreaterThanOrEqual(0);
  });

  test('CTA buttons remain visible when points are expanded', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        points: makePointsForLiveState(),
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    // Expand points — click the "N points" toggle
    const pointsToggle = storyCard.getByRole('button', { name: /\d+ points?/i });
    await expect(pointsToggle).toBeVisible();
    await pointsToggle.click();

    // Wait for points to render
    await page.waitForTimeout(300);

    // ActionArea must still be visible (sticky)
    const actionArea = page.locator('[data-testid="action-area"]');
    await expect(actionArea).toBeVisible();

    const box = await actionArea.boundingBox();
    expect(box).not.toBeNull();
    console.log(`ActionArea after points expand: top=${box!.y}, bottom=${box!.y + box!.height}`);
    expect(box!.y + box!.height).toBeLessThanOrEqual(MOBILE_VIEWPORT.height + 1);
    expect(box!.y).toBeGreaterThanOrEqual(0);
  });

  test('CTA buttons remain visible after scrolling content', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        checkerRating: 8,
        responderRating: 6,
        explainBackRatings: [7, 8, 9],
        points: makePointsForLiveState(),
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const actionArea = page.locator('[data-testid="action-area"]');
    await expect(actionArea).toBeVisible({ timeout: 15000 });

    // Scroll the content area down
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(200);

    // ActionArea must still be visible after scroll (sticky positioning)
    await expect(actionArea).toBeVisible();
    const box = await actionArea.boundingBox();
    expect(box).not.toBeNull();
    console.log(`ActionArea after scroll: top=${box!.y}, bottom=${box!.y + box!.height}`);
    expect(box!.y + box!.height).toBeLessThanOrEqual(MOBILE_VIEWPORT.height + 1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Change 3 — Calibration banner position
  // ───────────────────────────────────────────────────────────────────────

  test('calibration banner appears between journey card and story card', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        checkerRating: 8,
        responderRating: 6,
        explainBackRatings: [7],
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');

    await expect(journeyCard).toBeVisible({ timeout: 15000 });
    await expect(storyCard).toBeVisible();

    // Calibration banner — look for the gap/calibrated badge text
    // It may be a badge with "point gap" or "Perfectly calibrated" text
    const calibrationBanner = page.locator('text=/point gap|Perfectly calibrated/i').first();
    await expect(calibrationBanner).toBeVisible();

    const journeyBox = await journeyCard.boundingBox();
    const calibrationBox = await calibrationBanner.boundingBox();
    const storyBox = await storyCard.boundingBox();

    expect(journeyBox).not.toBeNull();
    expect(calibrationBox).not.toBeNull();
    expect(storyBox).not.toBeNull();

    // DOM order: journey → calibration → story (top positions ascending)
    console.log(`Journey top: ${journeyBox!.y}, Calibration top: ${calibrationBox!.y}, Story top: ${storyBox!.y}`);
    expect(journeyBox!.y).toBeLessThan(calibrationBox!.y);
    expect(calibrationBox!.y).toBeLessThan(storyBox!.y);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Change 4 — Accordion
  // ───────────────────────────────────────────────────────────────────────

  test('expanding points auto-collapses story text', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        points: makePointsForLiveState(),
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    // First expand the story text via "Show more"
    const showMoreBtn = storyCard.getByRole('button', { name: /show more/i });
    await expect(showMoreBtn).toBeVisible();
    await showMoreBtn.click();

    // Verify story is expanded (full text, "Show less" visible)
    await expect(storyCard.getByRole('button', { name: /show less/i })).toBeVisible();

    // Now expand points — this should auto-collapse the story text
    const pointsToggle = storyCard.getByRole('button', { name: /\d+ points?/i });
    await expect(pointsToggle).toBeVisible();
    await pointsToggle.click();

    // Wait for accordion to settle
    await page.waitForTimeout(200);

    // Story text should be truncated again (accordion behavior)
    const storyText = storyCard.locator('p').first();
    const text = await storyText.textContent();
    console.log(`Story text after points expand: "${text}"`);
    expect(text).toContain('…');

    // "Show more" should be visible again (story collapsed back)
    await expect(storyCard.getByRole('button', { name: /show more/i })).toBeVisible();
    await expect(storyCard.getByRole('button', { name: /show less/i })).not.toBeVisible();
  });

  test('expanding story text collapses points', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        points: makePointsForLiveState(),
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    // First expand points
    const pointsToggle = storyCard.getByRole('button', { name: /\d+ points?/i });
    await expect(pointsToggle).toBeVisible();
    await pointsToggle.click();
    await page.waitForTimeout(200);

    // Verify points are expanded — peek previews should be visible
    // Look for point author names or position text snippets
    await expect(storyCard.locator('text=/trust|resonates|both sides/i').first()).toBeVisible();

    // Now tap "Show more" to expand story — points should collapse
    const showMoreBtn = storyCard.getByRole('button', { name: /show more/i });
    await expect(showMoreBtn).toBeVisible();
    await showMoreBtn.click();

    await page.waitForTimeout(200);

    // Story text should be fully expanded
    await expect(storyCard.getByRole('button', { name: /show less/i })).toBeVisible();

    // Points should be collapsed — peek previews should not be visible
    // The "N points" summary should show as collapsed (chevron right, not down)
    await expect(storyCard.locator('text=/trust|resonates|both sides/i').first()).not.toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Change 5 — Peek mode
  // ───────────────────────────────────────────────────────────────────────

  test('points show 2-line preview when expanded', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        points: makePointsForLiveState(),
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    // Expand points
    const pointsToggle = storyCard.getByRole('button', { name: /\d+ points?/i });
    await pointsToggle.click();
    await page.waitForTimeout(300);

    // Each point should show a truncated preview (not full text)
    // The first point's full text is 112 chars — it should be truncated
    const firstPointText = storyCard.locator('text=/If someone can.t just/i').first();
    await expect(firstPointText).toBeVisible();

    // Verify the text is truncated (contains ellipsis or is clipped via CSS)
    const textContent = await firstPointText.textContent();
    console.log(`First point peek text: "${textContent}"`);
    // In peek mode, the full text should NOT be visible — it should be truncated
    // The full text includes "foundation of everything" — this should be hidden in peek
    const fullTextVisible = await storyCard.locator('text=/foundation of everything/i').isVisible();
    expect(fullTextVisible).toBe(false);
  });

  test('only one point can be fully expanded at a time', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        points: makePointsForLiveState(),
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    // Expand points list
    const pointsToggle = storyCard.getByRole('button', { name: /\d+ points?/i });
    await pointsToggle.click();
    await page.waitForTimeout(300);

    // Click first point peek to fully expand it
    const firstPointPeek = storyCard.locator('text=/If someone can.t just/i').first();
    await firstPointPeek.click();
    await page.waitForTimeout(200);

    // First point should now show full text
    await expect(storyCard.locator('text=/foundation of everything/i')).toBeVisible();

    // Click second point peek to expand it
    const secondPointPeek = storyCard.locator('text=/resonates/i').first();
    await secondPointPeek.click();
    await page.waitForTimeout(200);

    // Second point should now show its full text
    await expect(storyCard.locator('text=/exponential for team velocity/i')).toBeVisible();

    // First point should be collapsed back to peek (its full text hidden)
    const firstFullStillVisible = await storyCard.locator('text=/foundation of everything/i').isVisible();
    expect(firstFullStillVisible).toBe(false);
  });

  test('PositionButtons visible on expanded point', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        points: makePointsForLiveState(),
      }),
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    // Expand points list
    const pointsToggle = storyCard.getByRole('button', { name: /\d+ points?/i });
    await pointsToggle.click();
    await page.waitForTimeout(300);

    // Click first point to fully expand it
    const firstPointPeek = storyCard.locator('text=/If someone can.t just/i').first();
    await firstPointPeek.click();
    await page.waitForTimeout(200);

    // PositionButtons should be visible on the expanded point
    // These are the stance buttons (Agree, Disagree, Neutral, etc.)
    // TODO: Verify the exact data-testid or button text for PositionButtons
    // They may render as disabled buttons in /live context (view-only)
    const positionButtons = storyCard.locator('text=/Agree|Disagree|Neutral/i');
    const buttonCount = await positionButtons.count();
    console.log(`PositionButtons count on expanded point: ${buttonCount}`);
    expect(buttonCount).toBeGreaterThanOrEqual(1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Regression
  // ───────────────────────────────────────────────────────────────────────

  test('free-form idle (no story) is unchanged', async ({ page }) => {
    // Session with no story selected — free-form idle screen
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: {
        ratingPhase: 'idle',
        selectedStoryId: null,
        selectedStoryData: null,
        checkerRating: undefined,
        responderRating: undefined,
        explainBackRatings: [],
        checkerSubmitted: false,
        responderSubmitted: false,
        checkerName: undefined,
        explainBackDone: false,
        speakerSawExplainBackDone: false,
        sessionEnded: false,
      },
    });
    sessionCodes.push(code);

    await goToLive(page, code, testUser);

    // Wait for the page to render
    await page.waitForTimeout(2000);

    // Free-form idle should NOT have a sticky CTA bar
    // ActionArea should be inline (not sticky-positioned)
    // There should be no story card, no journey card, no accordion
    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).not.toBeVisible();

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).not.toBeVisible();

    // CTA buttons should still be present but inline (not sticky)
    // On free-form idle, the CTAs are simple centered buttons
    // Verify there's no points toggle or accordion elements
    const pointsToggle = page.getByRole('button', { name: /\d+ points?/i });
    await expect(pointsToggle).not.toBeVisible();
  });
});
