/**
 * @file p469-live-layout-kiss.spec.ts
 * @description P469: /live Layout — Revert P455 Reorder, KISS Space Savings
 *
 * Tests:
 * - Story threshold at 100 chars: long stories truncated with "…" + "Show more" button
 * - Story text ≤ 100 chars shown in full with no "Show more"
 * - "Show more" expands to full text
 * - Journey card history collapse: 0, 1, 2, 3+ explain-back rounds
 * - Round 0 always visible regardless of collapse state
 * - Latest round always visible regardless of collapse state
 * - "Show N earlier rounds" click reveals older rounds
 * - Component order: journey card above story card when rating data exists
 * - Story card above CTA button
 * - ActionArea icon container has class w-12 (not w-20)
 *
 * Setup pattern (clarity_sessions DB injection):
 *   1. Create clarity_sessions directly via supabaseAdmin with:
 *      - is_private: true     (no recording check)
 *      - joiner_name: 'TestPartner' (triggers pendingLiveTransition on restore, not setView('waiting'))
 *      - live_state: pre-seeded with desired session state
 *   2. Inject sessionStorage keys via page.context().addInitScript() BEFORE setTestSession,
 *      so they survive the '/' navigation that setTestSession triggers.
 *   3. setTestSession sets Supabase auth token.
 *   4. page.goto('/live?insights=off') — ?insights=off sets isPrivate=true in component state
 *      → gateMicAndGoLive() immediately calls setView('live') without mic permission check.
 *
 * explainBackRatings is number[] — each element is checker rating per round.
 * Round labels: olderRounds[i] shows as index+1, latestRound shows as latestRoundIndex+1.
 * Collapse triggers when explainBackRatings.length > 1.
 *
 * Viewport: 375px width (iPhone SE) — the target constraint.
 */

import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, deleteClaritySession } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

// Story over threshold (105 chars) — must trigger truncation at STORY_THRESHOLD=100
const LONG_STORY =
  "She's someone I've known for years. We were on a call together and we were trying so hard to work it out.";

// Story under threshold (31 chars) — must NOT trigger "Show more"
const SHORT_STORY = "She misunderstood me completely.";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Minimal live_state for idle phase with a story selected and optional rating data. */
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
      points: [],
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

/** Updates live_state for an existing session (used to seed different round counts). */
async function updateLiveState(code: string, liveState: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from('clarity_sessions')
    .update({ live_state: liveState })
    .eq('code', code);
  if (error) throw new Error(`Failed to update live_state: ${error.message}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1: Story threshold
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P469 — Story threshold (STORY_THRESHOLD = 100)', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let longStoryId: string;
  let shortStoryId: string;
  const sessionCodes: string[] = [];

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P469Story' });

    const { data: ls, error: e1 } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: testUser.user.id, content: LONG_STORY, visibility: 'public' })
      .select('id')
      .single();
    if (e1 || !ls) throw new Error(`Failed to create long story: ${e1?.message}`);
    longStoryId = ls.id;

    const { data: ss, error: e2 } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: testUser.user.id, content: SHORT_STORY, visibility: 'public' })
      .select('id')
      .single();
    if (e2 || !ss) throw new Error(`Failed to create short story: ${e2?.message}`);
    shortStoryId = ss.id;
  });

  test.afterAll(async () => {
    for (const code of sessionCodes) await deleteClaritySession(code);
    if (longStoryId) await supabaseAdmin.from('stories').delete().eq('id', longStoryId);
    if (shortStoryId) await supabaseAdmin.from('stories').delete().eq('id', shortStoryId);
    await deleteTestUser(testUser.user.id);
  });

  test('story > 100 chars is truncated with "…" and shows "Show more" button', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId: longStoryId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
      }),
    });
    sessionCodes.push(code);

    injectSessionStorage(page, code, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    const storyText = storyCard.locator('p').first();
    await expect(storyText).toBeVisible();

    const text = await storyText.textContent();
    console.log(`Story text (truncated): "${text}"`);
    expect(text).toContain('…');
    await expect(storyCard.getByRole('button', { name: /show more/i })).toBeVisible();
  });

  test('story ≤ 100 chars shows in full with no "Show more" button', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId: shortStoryId,
        storyContent: SHORT_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
      }),
    });
    sessionCodes.push(code);

    injectSessionStorage(page, code, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    const storyText = storyCard.locator('p').first();
    await expect(storyText).toBeVisible();

    const text = await storyText.textContent();
    console.log(`Story text (full): "${text}"`);
    expect(text).not.toContain('…');
    expect(text?.trim()).toBe(SHORT_STORY);
    await expect(storyCard.getByRole('button', { name: /show more/i })).not.toBeVisible();
  });

  test('"Show more" expands to full story text', async ({ page }) => {
    const code = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId: longStoryId,
        storyContent: LONG_STORY,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
      }),
    });
    sessionCodes.push(code);

    injectSessionStorage(page, code, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    const showMoreBtn = storyCard.getByRole('button', { name: /show more/i });
    await expect(showMoreBtn).toBeVisible();
    await showMoreBtn.click();

    const storyText = storyCard.locator('p').first();
    const expandedText = await storyText.textContent();
    console.log(`Story text (expanded): "${expandedText}"`);
    expect(expandedText).not.toContain('…');
    expect(expandedText?.trim()).toBe(LONG_STORY);
    await expect(storyCard.getByRole('button', { name: /show less/i })).toBeVisible();
    await expect(storyCard.getByRole('button', { name: /show more/i })).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2: Journey card history collapse
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P469 — Journey card history collapse', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionCode: string;
  const STORY_CONTENT = "She's someone I've known for years. We were on a call trying to work something out.";

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P469Journey' });

    const { data: story, error } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: testUser.user.id, content: STORY_CONTENT, visibility: 'public' })
      .select('id')
      .single();
    if (error || !story) throw new Error(`Failed to create story: ${error?.message}`);
    storyId = story.id;

    // Session with checkerRating + responderRating so hasRatingData=true (journey card renders)
    sessionCode = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: STORY_CONTENT,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        checkerRating: 8,
        responderRating: 6,
        explainBackRatings: [],
      }),
    });
  });

  test.afterAll(async () => {
    if (sessionCode) await deleteClaritySession(sessionCode);
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(testUser.user.id);
  });

  async function setRounds(n: number) {
    const ratings = Array.from({ length: n }, (_, i) => 7 + (i % 3)); // [7,8,9,7,8...]
    await updateLiveState(sessionCode, makeLiveState({
      storyId,
      storyContent: STORY_CONTENT,
      authorId: testUser.user.id,
      authorName: testUser.name,
      authorSlug: testUser.slug,
      checkerRating: 8,
      responderRating: 6,
      explainBackRatings: ratings,
    }));
  }

  test('0 explain-back rounds: no collapse UI visible', async ({ page }) => {
    await setRounds(0);

    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 15000 });

    const collapseBtn = journeyCard.getByRole('button', { name: /show.*earlier round/i });
    await expect(collapseBtn).not.toBeVisible();
    console.log('0 rounds: no collapse button — correct');
  });

  test('1 explain-back round: all rows visible, no "Show N earlier rounds" button', async ({ page }) => {
    await setRounds(1);

    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 15000 });

    // 1 round → no collapse (hasOlderRounds = explainBackRatings.length > 1 = false)
    const collapseBtn = journeyCard.getByRole('button', { name: /show.*earlier round/i });
    await expect(collapseBtn).not.toBeVisible();

    // Latest (and only) round: latestRoundIndex + 1 = 1 → label "1"
    await expect(journeyCard.locator('text=1').first()).toBeVisible();
  });

  test('2 explain-back rounds: "Show 1 earlier round" button visible', async ({ page }) => {
    await setRounds(2);

    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 15000 });

    // olderRounds = [7], latest = 8 at index 1 → label "2"
    const collapseBtn = journeyCard.getByRole('button', { name: /show 1 earlier round/i });
    await expect(collapseBtn).toBeVisible();

    // Round 0 (initial) always visible
    await expect(journeyCard.locator('text=0').first()).toBeVisible();

    // Latest round (round 2) always visible
    await expect(journeyCard.locator('text=2').first()).toBeVisible();

    // Older round 1 hidden by default (use exact match to avoid matching "Show 1 earlier round" button)
    await expect(journeyCard.locator(':text-is("1")')).not.toBeVisible();
  });

  test('2 explain-back rounds: clicking "Show 1 earlier round" reveals it', async ({ page }) => {
    await setRounds(2);

    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 15000 });

    const collapseBtn = journeyCard.getByRole('button', { name: /show 1 earlier round/i });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();

    // After click: round 1 now visible
    await expect(journeyCard.locator('text=1').first()).toBeVisible();

    // Collapse button gone after expanding
    await expect(collapseBtn).not.toBeVisible();
  });

  test('3 explain-back rounds: "Show 2 earlier rounds" button visible', async ({ page }) => {
    await setRounds(3);

    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 15000 });

    // olderRounds = [7, 8], latest = 9 at index 2 → label "3"
    const collapseBtn = journeyCard.getByRole('button', { name: /show 2 earlier rounds/i });
    await expect(collapseBtn).toBeVisible();

    // Round 0 always visible
    await expect(journeyCard.locator('text=0').first()).toBeVisible();
    // Latest round (round 3) always visible
    await expect(journeyCard.locator('text=3').first()).toBeVisible();
  });

  test('3 explain-back rounds: clicking collapse reveals all older rounds', async ({ page }) => {
    await setRounds(3);

    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 15000 });

    const collapseBtn = journeyCard.getByRole('button', { name: /show 2 earlier rounds/i });
    await collapseBtn.click();

    // After expand: rounds 1 and 2 now visible (plus 3 was always visible)
    await expect(journeyCard.locator('text=1').first()).toBeVisible();
    await expect(journeyCard.locator('text=2').first()).toBeVisible();
    await expect(journeyCard.locator('text=3').first()).toBeVisible();
  });

  test('round 0 (initial) always visible regardless of collapse state', async ({ page }) => {
    await setRounds(4);

    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 15000 });

    // Confirm collapse button exists (4 rounds → 3 older rounds)
    const collapseBtn = journeyCard.getByRole('button', { name: /show 3 earlier rounds/i });
    await expect(collapseBtn).toBeVisible();

    // Round 0 visible before expand
    await expect(journeyCard.locator('text=0').first()).toBeVisible();

    // Round 0 still visible after expand
    await collapseBtn.click();
    await expect(journeyCard.locator('text=0').first()).toBeVisible();
  });

  test('latest round always visible in collapsed state', async ({ page }) => {
    await setRounds(4);

    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 15000 });

    // Round 4 (latest) must be visible before clicking expand
    await expect(journeyCard.locator('text=4').first()).toBeVisible();

    // Collapse button present, meaning rounds 1-3 are hidden
    const collapseBtn = journeyCard.getByRole('button', { name: /show 3 earlier rounds/i });
    await expect(collapseBtn).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3: Component order stability
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P469 — Component order stability', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionCode: string;
  const STORY_CONTENT =
    "She's someone I've known for years. We were on a call trying to work something out together.";

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P469Order' });

    const { data: story, error } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: testUser.user.id, content: STORY_CONTENT, visibility: 'public' })
      .select('id')
      .single();
    if (error || !story) throw new Error(`Failed to create story: ${error?.message}`);
    storyId = story.id;

    // Session with hasRatingData=true (journey card renders on idle screen)
    sessionCode = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: STORY_CONTENT,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        checkerRating: 8,
        responderRating: 6,
        explainBackRatings: [7],
      }),
    });
  });

  test.afterAll(async () => {
    if (sessionCode) await deleteClaritySession(sessionCode);
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(testUser.user.id);
  });

  test('journey card renders above story card when rating data exists', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');

    await expect(journeyCard).toBeVisible({ timeout: 15000 });
    await expect(storyCard).toBeVisible();

    const journeyBox = await journeyCard.boundingBox();
    const storyBox = await storyCard.boundingBox();

    expect(journeyBox).not.toBeNull();
    expect(storyBox).not.toBeNull();

    console.log(`Journey card top: ${journeyBox!.y}, Story card top: ${storyBox!.y}`);
    expect(journeyBox!.y).toBeLessThan(storyBox!.y);
  });

  test('story card renders above the CTA button', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 15000 });

    const ctaBtn = page.locator('[data-testid="start-check"]');
    await expect(ctaBtn).toBeVisible();

    const storyBox = await storyCard.boundingBox();
    const ctaBox = await ctaBtn.boundingBox();

    expect(storyBox).not.toBeNull();
    expect(ctaBox).not.toBeNull();

    console.log(`Story card top: ${storyBox!.y}, CTA top: ${ctaBox!.y}`);
    expect(storyBox!.y).toBeLessThan(ctaBox!.y);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4: ActionArea icon size
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P469 — ActionArea icon size', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionCode: string;
  const STORY_CONTENT =
    "She's someone I've known for years. We were on a call trying to work something out.";

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P469Icon' });

    const { data: story, error } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: testUser.user.id, content: STORY_CONTENT, visibility: 'public' })
      .select('id')
      .single();
    if (error || !story) throw new Error(`Failed to create story: ${error?.message}`);
    storyId = story.id;

    // Session in explain-back phase, checker (speaker) view:
    //   ratingPhase: 'explain-back'  → phase = 'explain-back' in live-mode-view
    //   checkerName === testUser.name → isChecker = true
    //   explainBackDone: false        → listenerDone = false
    //   → renders ActionArea icon="👂" with w-12 h-12 circle
    sessionCode = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeLiveState({
        storyId,
        storyContent: STORY_CONTENT,
        authorId: testUser.user.id,
        authorName: testUser.name,
        authorSlug: testUser.slug,
        ratingPhase: 'explain-back',
        checkerName: testUser.name,
        checkerRating: 8,
        responderRating: 6,
        explainBackRatings: [7],
        explainBackDone: false,
      }),
    });
  });

  test.afterAll(async () => {
    if (sessionCode) await deleteClaritySession(sessionCode);
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(testUser.user.id);
  });

  test('ActionArea icon container has class w-12 (48px), not w-20 (80px)', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const actionArea = page.locator('[data-testid="action-area"]');
    await expect(actionArea).toBeVisible({ timeout: 15000 });

    // The icon div is the circular container inside action-area
    const iconContainer = actionArea.locator('.w-12.h-12.rounded-full').first();
    await expect(iconContainer).toBeVisible();

    const classes = await iconContainer.getAttribute('class');
    console.log(`Icon container classes: "${classes}"`);
    expect(classes).toContain('w-12');
    expect(classes).not.toContain('w-20');
  });

  test('ActionArea icon measures 48px wide on screen (not 80px)', async ({ page }) => {
    injectSessionStorage(page, sessionCode, testUser.name);
    await setTestSession(page, testUser.email);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/live?insights=off');

    const actionArea = page.locator('[data-testid="action-area"]');
    await expect(actionArea).toBeVisible({ timeout: 15000 });

    const iconContainer = actionArea.locator('.w-12.h-12.rounded-full').first();
    await expect(iconContainer).toBeVisible();

    const box = await iconContainer.boundingBox();
    expect(box).not.toBeNull();
    console.log(`Icon measured size: ${box!.width}px x ${box!.height}px`);
    // w-12 = 48px (3rem × 16px/rem). Allow 1px tolerance for subpixel rendering.
    expect(box!.width).toBeGreaterThanOrEqual(47);
    expect(box!.width).toBeLessThanOrEqual(49);
    expect(box!.height).toBeGreaterThanOrEqual(47);
    expect(box!.height).toBeLessThanOrEqual(49);
  });
});
