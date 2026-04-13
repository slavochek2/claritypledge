/**
 * @file p667-speak-button-position.spec.ts
 * @description P667: Speak button should not jump position on the /live idle screen.
 *
 * Canary test: verifies that the Speak button maintains a stable vertical
 * position regardless of whether session history exists below it.
 *
 * Before fix: session history causes isCleanIdle=false → CONTENT_LAYOUT
 * (justify-start pt-8) → button near top. Without history, two-zone layout
 * → button at ~40%. The drift exceeds 60px.
 *
 * After fix: two-zone layout always used → button at ~40% in both cases.
 *
 * Setup: DB injection pattern (same as p469, p617).
 */

import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, deleteClaritySession } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
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

/** Minimal idle live_state with session history (post-round). */
function makeIdleWithHistory() {
  return {
    ratingPhase: 'idle',
    selectedStoryId: null,
    selectedStoryData: null,
    checkerRating: undefined,
    responderRating: undefined,
    explainBackRatings: [],
    checkerSubmitted: false,
    responderSubmitted: false,
    explainBackDone: false,
    speakerSawExplainBackDone: false,
    sessionEnded: false,
    sessionHistory: [
      {
        round: 1,
        checkerRating: 4,
        responderRating: 3,
        explainBackRatings: [],
        checkerName: 'P667User',
        proverName: 'TestPartner',
        storyData: {
          id: 'hist-story-1',
          content: 'A test story for history',
          authorName: 'P667User',
          authorSlug: 'p667-user',
          authorAvatarColor: '#4A90E2',
          authorHasPledged: false,
          visibility: 'public',
          points: [],
        },
      },
    ],
  };
}

/** Minimal clean idle live_state (no history, no story). */
function makeCleanIdle() {
  return {
    ratingPhase: 'idle',
    selectedStoryId: null,
    selectedStoryData: null,
    checkerRating: undefined,
    responderRating: undefined,
    explainBackRatings: [],
    checkerSubmitted: false,
    responderSubmitted: false,
    explainBackDone: false,
    speakerSawExplainBackDone: false,
    sessionEnded: false,
    sessionHistory: [],
  };
}

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

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P667: Speak button position stability', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  const sessionCodes: string[] = [];

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P667User' });
  });

  test.afterAll(async () => {
    for (const code of sessionCodes) {
      await deleteClaritySession(code);
    }
    if (testUser) await deleteTestUser(testUser.user.id);
  });

  test('Speak button stays at stable position with session history (symptom 3)', async ({ browser }) => {
    // Set up two sessions: one clean idle, one with history
    const cleanCode = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeCleanIdle(),
    });
    sessionCodes.push(cleanCode);

    const historyCode = await createTestSession({
      creatorName: testUser.name,
      creatorProfileId: testUser.user.id,
      liveState: makeIdleWithHistory(),
    });
    sessionCodes.push(historyCode);

    // --- Measure button position in clean idle ---
    const ctx1 = await browser.newContext({ viewport: MOBILE_VIEWPORT });
    const page1 = await ctx1.newPage();
    injectSessionStorage(page1, cleanCode, testUser.name);
    await setTestSession(page1, testUser.email);
    await page1.goto('/live?insights=off');

    const cleanButton = page1.getByTestId('start-check');
    await expect(cleanButton).toBeVisible({ timeout: 10000 });
    const cleanBox = await cleanButton.boundingBox();
    expect(cleanBox).toBeTruthy();
    const cleanButtonY = cleanBox!.y;
    await ctx1.close();

    // --- Measure button position with session history ---
    const ctx2 = await browser.newContext({ viewport: MOBILE_VIEWPORT });
    const page2 = await ctx2.newPage();
    injectSessionStorage(page2, historyCode, testUser.name);
    await setTestSession(page2, testUser.email);
    await page2.goto('/live?insights=off');

    const histButton = page2.getByTestId('start-check');
    await expect(histButton).toBeVisible({ timeout: 10000 });
    const histBox = await histButton.boundingBox();
    expect(histBox).toBeTruthy();
    const histButtonY = histBox!.y;
    await ctx2.close();

    // The Speak button should be at approximately the same position in both cases.
    // Before fix: clean idle puts button at ~40% (~267px), history puts button near top (~80px).
    // Tolerance: 60px (accounts for header/padding differences).
    const drift = Math.abs(cleanButtonY - histButtonY);
    expect(drift, `Speak button Y drifted ${drift}px between clean idle (${cleanButtonY}px) and post-round idle (${histButtonY}px). Max allowed: 60px.`).toBeLessThanOrEqual(60);
  });
});
