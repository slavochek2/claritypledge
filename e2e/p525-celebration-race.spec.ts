/**
 * @file p525-celebration-race.spec.ts
 * @description E2E tests for P525: Live State Deadlock Prevention
 *
 * The core scenario: two users clicking "Continue" on the celebration screen
 * simultaneously. Before P525, the celebrationAcknowledgedBy array could lose
 * one user's acknowledgment due to JSONB key-level overwrite. After P525,
 * each user writes to their own boolean key — no collision possible.
 *
 * Also tests: handleSkip clears selectedStoryData (no stale data leak).
 *
 * Session setup:
 *   - Creator: authenticated (needs stories + session)
 *   - Joiner: guest (P396 name-only form)
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { mockMicPermission } from './helpers/test-realtime';

// ─── Constants ──────────────────────────────────────────────────────────────

const GUEST_JOINER_NAME = 'P525Guest';
const SESSION_CODE_PREFIX = 'P525';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generates a unique session code to avoid collisions with parallel test runs.
 */
function generateSessionCode(): string {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${SESSION_CODE_PREFIX}${suffix}`;
}

/**
 * Polls clarity_sessions.live_state until a JSONB key matches a value.
 */
async function waitForLiveStateKey(
  sessionCode: string,
  key: string,
  value: unknown,
  timeoutMs = 15000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();

    if (data?.live_state && (data.live_state as Record<string, unknown>)[key] === value) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(
    `[waitForLiveStateKey] Timed out waiting for live_state.${key} = ${String(value)} on session ${sessionCode}`
  );
}

/**
 * Polls until both celebration booleans are true in live_state.
 */
async function waitForBothAcknowledged(
  sessionCode: string,
  timeoutMs = 15000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();

    const state = data?.live_state as Record<string, unknown> | null;
    if (state?.celebrationAcknowledgedByCreator === true &&
        state?.celebrationAcknowledgedByJoiner === true) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(
    `[waitForBothAcknowledged] Timed out on session ${sessionCode}`
  );
}

/**
 * Checks that selectedStoryData is cleared (null/undefined) in live_state.
 */
async function assertStoryDataCleared(sessionCode: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('clarity_sessions')
    .select('live_state')
    .eq('code', sessionCode)
    .single();

  const state = data?.live_state as Record<string, unknown> | null;
  expect(state?.selectedStoryData).toBeFalsy();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('P525: Celebration race — two users clicking Continue simultaneously', () => {
  let creatorUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionCode: string;
  let creatorContext: BrowserContext;
  let joinerContext: BrowserContext;
  let creatorPage: Page;
  let joinerPage: Page;

  test.beforeAll(async () => {
    creatorUser = await createTestUser({ name: 'P525 Creator' });
    const story = await createTestStory({
      authorId: creatorUser.user.id,
      title: 'P525 Test Story',
      body: 'A story for deadlock testing',
    });
    storyId = story.id;
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (creatorUser) await deleteTestUser(creatorUser.user.id);
  });

  test.beforeEach(async ({ browser }) => {
    sessionCode = generateSessionCode();

    creatorContext = await browser.newContext();
    joinerContext = await browser.newContext();
    creatorPage = await creatorContext.newPage();
    joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    await setTestSession(creatorPage, creatorUser.email);
  });

  test.afterEach(async () => {
    await creatorContext?.close();
    await joinerContext?.close();
    if (sessionCode) await deleteClaritySession(sessionCode);
  });

  test('both users clicking Continue on celebration → both advance to next round', async () => {
    // This test verifies the behavioral outcome of the P525 boolean fix.
    // We cannot reliably trigger a true simultaneous click in E2E, but we can
    // verify that both acknowledgments persist in the DB without overwriting.
    //
    // Strategy:
    // 1. Set up a session in celebration phase directly via DB (skip the full rating flow)
    // 2. Both users write their boolean key via the app's UI (click Continue)
    // 3. Verify both booleans are true in DB
    // 4. Verify the session advances (ratingPhase returns to 'idle', round increments)

    // Step 1: Create session in celebration phase via admin
    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        creator_profile_id: creatorUser.user.id,
        creator_name: 'P525 Creator',
        joiner_name: GUEST_JOINER_NAME,
        code: sessionCode,
        mode: 'live',
        live_state: {
          ratingPhase: 'celebration',
          currentRound: 1,
          checkerSubmitted: true,
          responderSubmitted: true,
          checkerRating: 10,
          responderRating: 10,
          checkerName: 'P525 Creator',
          currentSpeaker: 'P525 Creator',
          currentListener: GUEST_JOINER_NAME,
          roleSelections: {},
          sliderRatings: {},
          listenActivelyRatings: {},
          checksCount: 1,
          checksTotal: 1,
          ideasDiscussed: 1,
          ideasUnderstood: 1,
          talkTime: {},
          explainBackRound: 0,
          explainBackRatings: [],
          celebrationAcknowledgedByCreator: false,
          celebrationAcknowledgedByJoiner: false,
          selectedStoryId: storyId,
          selectedStoryData: { id: storyId, title: 'P525 Test Story' },
          selectedContentTitle: 'P525 Test Story',
        },
      });

    expect(error).toBeNull();

    // Step 2: Navigate both users to the live session
    await creatorPage.goto(`/live?code=${sessionCode}`);
    await joinerPage.goto(`/live?code=${sessionCode}`);

    // Wait for celebration screen to appear on both
    const continueButtonCreator = creatorPage.getByRole('button', { name: /continue/i });
    const continueButtonJoiner = joinerPage.getByRole('button', { name: /continue/i });

    await expect(continueButtonCreator).toBeVisible({ timeout: 10000 });
    await expect(continueButtonJoiner).toBeVisible({ timeout: 10000 });

    // Step 3: Both click Continue (as close together as possible)
    await Promise.all([
      continueButtonCreator.click(),
      continueButtonJoiner.click(),
    ]);

    // Step 4: Verify both booleans are set in DB
    await waitForBothAcknowledged(sessionCode);

    // Step 5: Verify session advances — ratingPhase should return to 'idle'
    await waitForLiveStateKey(sessionCode, 'ratingPhase', 'idle', 15000);

    // Verify round incremented
    const { data: finalState } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();

    const state = finalState?.live_state as Record<string, unknown>;
    expect(state.currentRound).toBe(2);
  });
});

test.describe('P525: handleSkip clears selectedStoryData', () => {
  let creatorUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;
  let sessionCode: string;
  let creatorContext: BrowserContext;
  let joinerContext: BrowserContext;
  let creatorPage: Page;
  let joinerPage: Page;

  test.beforeAll(async () => {
    creatorUser = await createTestUser({ name: 'P525 Skip Creator' });
    const story = await createTestStory({
      authorId: creatorUser.user.id,
      title: 'P525 Skip Story',
      body: 'Story for skip test',
    });
    storyId = story.id;
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (creatorUser) await deleteTestUser(creatorUser.user.id);
  });

  test.beforeEach(async ({ browser }) => {
    sessionCode = generateSessionCode();

    creatorContext = await browser.newContext();
    joinerContext = await browser.newContext();
    creatorPage = await creatorContext.newPage();
    joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    await setTestSession(creatorPage, creatorUser.email);
  });

  test.afterEach(async () => {
    await creatorContext?.close();
    await joinerContext?.close();
    if (sessionCode) await deleteClaritySession(sessionCode);
  });

  test('skipping a round clears selectedStoryData from live_state', async () => {
    // Set up session with story data in live_state
    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        creator_profile_id: creatorUser.user.id,
        creator_name: 'P525 Skip Creator',
        joiner_name: GUEST_JOINER_NAME,
        code: sessionCode,
        mode: 'live',
        live_state: {
          ratingPhase: 'rating',
          currentRound: 1,
          checkerSubmitted: false,
          responderSubmitted: false,
          checkerName: 'P525 Skip Creator',
          currentSpeaker: 'P525 Skip Creator',
          currentListener: GUEST_JOINER_NAME,
          roleSelections: {},
          sliderRatings: {},
          listenActivelyRatings: {},
          checksCount: 0,
          checksTotal: 0,
          ideasDiscussed: 0,
          ideasUnderstood: 0,
          talkTime: {},
          explainBackRound: 0,
          explainBackRatings: [],
          selectedStoryId: storyId,
          selectedStoryData: { id: storyId, title: 'P525 Skip Story' },
          selectedContentTitle: 'P525 Skip Story',
        },
      });

    expect(error).toBeNull();

    // Navigate creator to live session
    await creatorPage.goto(`/live?code=${sessionCode}`);

    // Find and click Skip button
    const skipButton = creatorPage.getByRole('button', { name: /skip/i });
    await expect(skipButton).toBeVisible({ timeout: 10000 });
    await skipButton.click();

    // Wait for skip to propagate — ratingPhase should return to 'idle'
    await waitForLiveStateKey(sessionCode, 'ratingPhase', 'idle', 10000);

    // Verify selectedStoryData is cleared
    await assertStoryDataCleared(sessionCode);
  });
});
