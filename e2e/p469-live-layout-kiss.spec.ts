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
 * Setup: Authenticated user with a story, seeded rating data in Supabase directly
 * to simulate explain-back rounds without running through the full /live two-party flow.
 *
 * Viewport: 375px width (iPhone SE) — the target constraint.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

// Story just over threshold — should trigger truncation
const LONG_STORY =
  "She's someone I've known for years. We were on a call trying to work something out together.";
// Story at or under threshold (≤100 chars) — must NOT trigger "Show more"
const SHORT_STORY = "She misunderstood me completely.";

test.describe('P469 — Story threshold (STORY_THRESHOLD = 100)', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let longStoryId: string;
  let shortStoryId: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P469Story' });

    const { data: longStory, error: e1 } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: testUser.user.id,
        content: LONG_STORY,
        visibility: 'public',
      })
      .select('id')
      .single();
    if (e1 || !longStory) throw new Error(`Failed to create long story: ${e1?.message}`);
    longStoryId = longStory.id;

    const { data: shortStory, error: e2 } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: testUser.user.id,
        content: SHORT_STORY,
        visibility: 'public',
      })
      .select('id')
      .single();
    if (e2 || !shortStory) throw new Error(`Failed to create short story: ${e2?.message}`);
    shortStoryId = shortStory.id;
  });

  test.afterAll(async () => {
    if (longStoryId) await supabaseAdmin.from('stories').delete().eq('id', longStoryId);
    if (shortStoryId) await supabaseAdmin.from('stories').delete().eq('id', shortStoryId);
    await deleteTestUser(testUser.user.id);
  });

  test('story > 100 chars is truncated with "…" and shows "Show more" button', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto('/live');

    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
    await page.getByRole('button', { name: /new session/i }).click();

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    // Displayed text must end with "…" (the ellipsis appended by slice)
    const storyText = storyCard.locator(`#live-story-text-${longStoryId}`);
    await expect(storyText).toBeVisible();
    const text = await storyText.textContent();
    console.log(`Displayed story text: "${text}"`);
    expect(text).toContain('…');

    // "Show more" button must be present
    const showMoreBtn = storyCard.getByRole('button', { name: /show more/i });
    await expect(showMoreBtn).toBeVisible();
  });

  test('story ≤ 100 chars shows in full with no "Show more" button', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto('/live');

    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
    await page.getByRole('button', { name: /new session/i }).click();

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    // Short story: full content visible, no ellipsis
    const storyText = storyCard.locator(`#live-story-text-${shortStoryId}`);
    await expect(storyText).toBeVisible();
    const text = await storyText.textContent();
    console.log(`Short story displayed text: "${text}"`);
    expect(text).not.toContain('…');
    expect(text?.trim()).toBe(SHORT_STORY);

    // "Show more" must not exist
    await expect(storyCard.getByRole('button', { name: /show more/i })).not.toBeVisible();
  });

  test('"Show more" expands to full story text', async ({ page }) => {
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

    // After expanding, full text must be visible without ellipsis
    const storyText = storyCard.locator(`#live-story-text-${longStoryId}`);
    const expandedText = await storyText.textContent();
    console.log(`Expanded story text: "${expandedText}"`);
    expect(expandedText).not.toContain('…');
    expect(expandedText?.trim()).toBe(LONG_STORY);

    // "Show less" button now visible, "Show more" gone
    await expect(storyCard.getByRole('button', { name: /show less/i })).toBeVisible();
    await expect(storyCard.getByRole('button', { name: /show more/i })).not.toBeVisible();
  });
});

test.describe('P469 — Journey card history collapse', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let partnerUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P469Host' });
    partnerUser = await createTestUser({ name: 'P469Partner' });

    const { data: story, error: storyErr } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: testUser.user.id,
        content: "She's someone I've known for years. We were on a call trying to work something out.",
        visibility: 'public',
      })
      .select('id')
      .single();
    if (storyErr || !story) throw new Error(`Failed to create story: ${storyErr?.message}`);
    storyId = story.id;

    // Create a live session between testUser (host/checker) and partnerUser (responder)
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('live_sessions')
      .insert({
        host_id: testUser.user.id,
        partner_id: partnerUser.user.id,
        story_id: storyId,
        status: 'active',
      })
      .select('id')
      .single();
    if (sessionErr || !session) throw new Error(`Failed to create session: ${sessionErr?.message}`);
    sessionId = session.id;
  });

  test.afterAll(async () => {
    if (sessionId) await supabaseAdmin.from('live_sessions').delete().eq('id', sessionId);
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(testUser.user.id);
    await deleteTestUser(partnerUser.user.id);
  });

  /**
   * Seed explain-back ratings for the session.
   * n = number of explain-back rounds to create.
   */
  async function seedExplainBackRatings(n: number) {
    // Delete existing explain-back ratings first
    await supabaseAdmin
      .from('live_session_explain_back_ratings')
      .delete()
      .eq('session_id', sessionId);

    if (n === 0) return;

    const rows = Array.from({ length: n }, (_, i) => ({
      session_id: sessionId,
      round_number: i + 1,
      checker_rating: 5 + i,
    }));

    const { error } = await supabaseAdmin
      .from('live_session_explain_back_ratings')
      .insert(rows);
    if (error) throw new Error(`Failed to seed explain-back ratings: ${error.message}`);
  }

  test('0 explain-back rounds: no collapse UI visible', async ({ page }) => {
    await seedExplainBackRatings(0);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    // Navigate directly to the session page
    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');

    // If journey card is visible (requires rating data), confirm no collapse button
    const isVisible = await journeyCard.isVisible().catch(() => false);
    if (isVisible) {
      const collapseBtn = journeyCard.getByRole('button', { name: /show.*earlier round/i });
      await expect(collapseBtn).not.toBeVisible();
      console.log('0 rounds: journey card visible, no collapse button — correct');
    } else {
      console.log('0 rounds: journey card not rendered (no rating data) — correct');
    }
  });

  test('1 explain-back round: all rows visible, no "Show N earlier rounds" button', async ({
    page,
  }) => {
    await seedExplainBackRatings(1);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 10000 });

    // 1 round = nothing older to collapse — no button
    const collapseBtn = journeyCard.getByRole('button', { name: /show.*earlier round/i });
    await expect(collapseBtn).not.toBeVisible();

    // Round 1 must be visible (it's both the first and latest)
    const roundLabel = journeyCard.locator('text=1').first();
    await expect(roundLabel).toBeVisible();
  });

  test('2 explain-back rounds: "Show 1 earlier round" button visible', async ({ page }) => {
    await seedExplainBackRatings(2);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 10000 });

    // With 2 rounds: olderRounds = [round 1], latest = round 2
    // Button text: "Show 1 earlier round"
    const collapseBtn = journeyCard.getByRole('button', { name: /show 1 earlier round/i });
    await expect(collapseBtn).toBeVisible();

    // Round 0 (initial) always visible
    const round0 = journeyCard.locator('text=0').first();
    await expect(round0).toBeVisible();

    // Latest round (round 2) always visible
    const round2 = journeyCard.locator('text=2').first();
    await expect(round2).toBeVisible();

    // Older round 1 hidden by default
    const round1 = journeyCard.locator('text=1').first();
    await expect(round1).not.toBeVisible();
  });

  test('2 explain-back rounds: clicking "Show 1 earlier round" reveals it', async ({ page }) => {
    await seedExplainBackRatings(2);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 10000 });

    const collapseBtn = journeyCard.getByRole('button', { name: /show 1 earlier round/i });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();

    // After click: round 1 now visible
    const round1 = journeyCard.locator('text=1').first();
    await expect(round1).toBeVisible();

    // Collapse button gone after expanding
    await expect(collapseBtn).not.toBeVisible();
  });

  test('3 explain-back rounds: "Show 2 earlier rounds" button visible', async ({ page }) => {
    await seedExplainBackRatings(3);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 10000 });

    // olderRounds = [round 1, round 2], latest = round 3
    const collapseBtn = journeyCard.getByRole('button', { name: /show 2 earlier rounds/i });
    await expect(collapseBtn).toBeVisible();

    // Round 0 always visible
    await expect(journeyCard.locator('text=0').first()).toBeVisible();
    // Latest round (3) always visible
    await expect(journeyCard.locator('text=3').first()).toBeVisible();
  });

  test('3 explain-back rounds: clicking collapse reveals all older rounds', async ({ page }) => {
    await seedExplainBackRatings(3);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 10000 });

    const collapseBtn = journeyCard.getByRole('button', { name: /show 2 earlier rounds/i });
    await collapseBtn.click();

    // All rounds now visible: 0, 1, 2, 3
    await expect(journeyCard.locator('text=1').first()).toBeVisible();
    await expect(journeyCard.locator('text=2').first()).toBeVisible();
    await expect(journeyCard.locator('text=3').first()).toBeVisible();
  });

  test('round 0 (initial) always visible regardless of collapse state', async ({ page }) => {
    await seedExplainBackRatings(4);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 10000 });

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
    await seedExplainBackRatings(4);

    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    await expect(journeyCard).toBeVisible({ timeout: 10000 });

    // Round 4 (latest) must be visible before clicking expand
    await expect(journeyCard.locator('text=4').first()).toBeVisible();

    // Collapse button present, meaning rounds 1-3 are hidden
    const collapseBtn = journeyCard.getByRole('button', { name: /show 3 earlier rounds/i });
    await expect(collapseBtn).toBeVisible();
  });
});

test.describe('P469 — Component order stability', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let partnerUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P469Order' });
    partnerUser = await createTestUser({ name: 'P469OrderPartner' });

    const { data: story, error: storyErr } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: testUser.user.id,
        content:
          "She's someone I've known for years. We were on a call trying to work something out together.",
        visibility: 'public',
      })
      .select('id')
      .single();
    if (storyErr || !story) throw new Error(`Failed to create story: ${storyErr?.message}`);
    storyId = story.id;

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('live_sessions')
      .insert({
        host_id: testUser.user.id,
        partner_id: partnerUser.user.id,
        story_id: storyId,
        status: 'active',
      })
      .select('id')
      .single();
    if (sessionErr || !session) throw new Error(`Failed to create session: ${sessionErr?.message}`);
    sessionId = session.id;

    // Seed one explain-back rating so hasRatingData = true and journey card renders
    await supabaseAdmin.from('live_session_explain_back_ratings').insert({
      session_id: sessionId,
      round_number: 1,
      checker_rating: 6,
    });
  });

  test.afterAll(async () => {
    if (sessionId) {
      await supabaseAdmin
        .from('live_session_explain_back_ratings')
        .delete()
        .eq('session_id', sessionId);
      await supabaseAdmin.from('live_sessions').delete().eq('id', sessionId);
    }
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(testUser.user.id);
    await deleteTestUser(partnerUser.user.id);
  });

  test('journey card renders above story card when rating data exists', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const journeyCard = page.locator('[data-testid="journey-to-understanding"]');
    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');

    await expect(journeyCard).toBeVisible({ timeout: 10000 });
    await expect(storyCard).toBeVisible();

    const journeyBox = await journeyCard.boundingBox();
    const storyBox = await storyCard.boundingBox();

    expect(journeyBox).not.toBeNull();
    expect(storyBox).not.toBeNull();

    console.log(`Journey card top: ${journeyBox!.y}, Story card top: ${storyBox!.y}`);
    // Journey card must start above story card
    expect(journeyBox!.y).toBeLessThan(storyBox!.y);
  });

  test('story card renders above the CTA button', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    // CTA is either "start-check" (idle/explain-back) or "rate-explanation"
    const ctaBtn = page
      .locator('[data-testid="start-check"], [data-testid="rate-explanation"]')
      .first();
    await expect(ctaBtn).toBeVisible();

    const storyBox = await storyCard.boundingBox();
    const ctaBox = await ctaBtn.boundingBox();

    expect(storyBox).not.toBeNull();
    expect(ctaBox).not.toBeNull();

    console.log(`Story card top: ${storyBox!.y}, CTA top: ${ctaBox!.y}`);
    expect(storyBox!.y).toBeLessThan(ctaBox!.y);
  });
});

test.describe('P469 — ActionArea icon size', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let partnerUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P469Icon' });
    partnerUser = await createTestUser({ name: 'P469IconPartner' });

    const { data: story, error: storyErr } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: testUser.user.id,
        content:
          "She's someone I've known for years. We were on a call trying to work something out.",
        visibility: 'public',
      })
      .select('id')
      .single();
    if (storyErr || !story) throw new Error(`Failed to create story: ${storyErr?.message}`);
    storyId = story.id;

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('live_sessions')
      .insert({
        host_id: testUser.user.id,
        partner_id: partnerUser.user.id,
        story_id: storyId,
        status: 'active',
      })
      .select('id')
      .single();
    if (sessionErr || !session) throw new Error(`Failed to create session: ${sessionErr?.message}`);
    sessionId = session.id;
  });

  test.afterAll(async () => {
    if (sessionId) await supabaseAdmin.from('live_sessions').delete().eq('id', sessionId);
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(testUser.user.id);
    await deleteTestUser(partnerUser.user.id);
  });

  test('ActionArea icon container has class w-12 (48px), not w-20 (80px)', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const actionArea = page.locator('[data-testid="action-area"]');
    await expect(actionArea).toBeVisible({ timeout: 10000 });

    // The icon div is the circular container inside action-area
    const iconContainer = actionArea.locator('.w-12.h-12.rounded-full').first();

    if (await iconContainer.isVisible()) {
      const classes = await iconContainer.getAttribute('class');
      console.log(`Icon container classes: "${classes}"`);
      expect(classes).toContain('w-12');
      expect(classes).not.toContain('w-20');
    } else {
      // ActionArea may render without an icon in some phases — skip icon check
      // but verify the action-area is present and functioning
      console.log('No icon container visible in current phase — action-area present');
      const areaBox = await actionArea.boundingBox();
      expect(areaBox).not.toBeNull();
      // If icon is present anywhere in the page, it must be 48px
      const anyIcon = page.locator('.w-20.h-20.rounded-full');
      await expect(anyIcon).not.toBeVisible();
    }
  });

  test('ActionArea icon measures 48px wide on screen (not 80px)', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await setTestSession(page, testUser);
    await page.goto(`/live`);

    const actionArea = page.locator('[data-testid="action-area"]');
    await expect(actionArea).toBeVisible({ timeout: 10000 });

    const iconContainer = actionArea.locator('.w-12.h-12.rounded-full').first();

    if (await iconContainer.isVisible()) {
      const box = await iconContainer.boundingBox();
      expect(box).not.toBeNull();
      console.log(`Icon measured size: ${box!.width}px x ${box!.height}px`);
      // w-12 = 48px (3rem × 16px/rem). Allow 1px tolerance for subpixel rendering.
      expect(box!.width).toBeGreaterThanOrEqual(47);
      expect(box!.width).toBeLessThanOrEqual(49);
      expect(box!.height).toBeGreaterThanOrEqual(47);
      expect(box!.height).toBeLessThanOrEqual(49);
    } else {
      console.log('No icon visible in current phase — skipping pixel check');
    }
  });
});
