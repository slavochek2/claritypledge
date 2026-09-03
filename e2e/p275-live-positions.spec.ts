/**
 * @file p275-live-positions.spec.ts
 * @description E2E tests for P275: Point position selection in /live
 *
 * Tests the full position lifecycle:
 * 1. Setting a position writes to livePositions in live_state
 * 2. Removing a position (toggle off) writes null — not silently reverted by ?? fallthrough
 * 3. Positions survive page navigation (livePositions restored from DB on re-render)
 *
 * The critical regression guarded here is the ?? null-fallthrough bug:
 *   `myPositions[pointId] ?? p.userPosition` would ignore an explicit null (removal)
 *   and fall through to the old DB position, making removal appear sticky after reload.
 *
 * Architecture note on livePositions:
 * - Stored in live_state JSONB: { livePositions: { [participantName]: { [pointId]: position | null } } }
 * - null means "explicitly removed" — key present with null value, distinct from key absent
 * - Shared in real-time between participants via Supabase Realtime + polling fallback
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
} from './helpers/test-user';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { waitForDBPresence, mockMicPermission } from './helpers/test-realtime';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reuses the two-party session setup from p272.
 * Returns the 6-character room code.
 */
async function setupTwoPartySession(
  speakerPage: Parameters<typeof mockMicPermission>[0],
  listenerPage: Parameters<typeof mockMicPermission>[0],
  _creatorEmail: string,
  joinerUser: { email: string; name: string }
): Promise<string> {
  await speakerPage.goto('/live');
  await speakerPage.waitForLoadState('networkidle');
  await speakerPage.getByRole('button', { name: 'New session' }).click();
  await expect(speakerPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

  const shareLink = await speakerPage.getByTestId('share-link').textContent();
  const roomCode = shareLink!.split('/').pop()!;
  expect(roomCode).toHaveLength(6);

  await listenerPage.goto(`/live/${roomCode}`);
  // P1232: P396 removed the guest email input and the consent checkbox, and
  // "Join Session" now renders only when auto-join FAILS — an unconditional
  // click on either hangs until the test times out. See helpers/live-join.ts.
  await completeLiveJoinIfPrompted(listenerPage);

  try {
    await listenerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
    await listenerPage.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No terms dialog — proceed normally
  }

  await waitForDBPresence('clarity_sessions', 'joiner_name', joinerUser.name, 'code', roomCode);
  return roomCode;
}

/**
 * Polls live_state until livePositions[participantName][pointId] equals expectedPosition.
 * Handles both string positions ('agree', 'disagree', etc.) and null (explicitly removed).
 * Uses `pointId in userPositions` to distinguish "null stored" from "key absent".
 */
async function waitForLivePosition(
  sessionCode: string,
  participantName: string,
  pointId: string,
  expectedPosition: string | null,
  timeoutMs = 10000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();

    const liveState = data?.live_state as Record<string, unknown> | null;
    const livePositions = liveState?.livePositions as
      | Record<string, Record<string, string | null>>
      | undefined;
    const userPositions = livePositions?.[participantName];

    if (userPositions && pointId in userPositions && userPositions[pointId] === expectedPosition) {
      console.log(
        `[p275] livePositions[${participantName}][${pointId}] = ${expectedPosition} confirmed ✓`
      );
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `[waitForLivePosition] Timed out after ${timeoutMs}ms: ` +
      `livePositions[${participantName}][${pointId}] !== ${String(expectedPosition)}`
  );
}

/**
 * Writes livePositions directly to live_state via admin (bypasses app) to simulate a
 * pre-existing position for a participant. Used to set up reload-restore scenarios.
 */
async function setLivePositionInDB(
  sessionCode: string,
  participantName: string,
  pointId: string,
  position: string | null
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('clarity_sessions')
    .select('live_state')
    .eq('code', sessionCode)
    .single();

  const current = (data?.live_state as Record<string, unknown>) ?? {};
  const currentPositions = (current.livePositions as Record<string, Record<string, string | null>>) ?? {};

  await supabaseAdmin
    .from('clarity_sessions')
    .update({
      live_state: {
        ...current,
        livePositions: {
          ...currentPositions,
          [participantName]: {
            ...(currentPositions[participantName] ?? {}),
            [pointId]: position,
          },
        },
      },
    })
    .eq('code', sessionCode);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('P275: Point positions in /live', () => {
  test.describe.configure({ timeout: 90000 });

  // ── Test 1: Setting a position writes to livePositions in DB ─────────────
  test('Clicking a position button writes to livePositions in live_state', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      const uniqueFragment = `PosSet${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P275Creator' });
      joinerUser = await createTestUser({ name: 'P275Joiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: position write test story`,
      });
      storyId = story.id;
      const point = await createTestPoint(creatorUser.user.id, {
        statement: `P275 test point ${Date.now()}`,
      });
      pointId = point.id;
      await linkStoryToPoint(storyId, pointId);

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(
        speakerPage, listenerPage, creatorUser.email, joinerUser
      );

      // Wait for creator's live view
      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Select story
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      await expect(speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) })).toBeVisible({ timeout: 5000 });
      await speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) }).click();

      // Story card visible — expand points
      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });
      const expandBtn = speakerPage.getByRole('button', { name: /1 point/i });
      await expect(expandBtn).toBeVisible({ timeout: 5000 });
      await expandBtn.click();

      // Click the Agree button (main segment — the button with aria-pressed, not the chevron)
      const agreeSegmentBtn = speakerPage
        .locator('button[aria-pressed]')
        .filter({ hasText: /^Agree/ })
        .first();
      await expect(agreeSegmentBtn).toBeVisible({ timeout: 5000 });
      await agreeSegmentBtn.click();

      // Local state: button should be active immediately
      await expect(agreeSegmentBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 3000 });

      // DB: livePositions should reflect the choice
      await waitForLivePosition(roomCode, creatorUser.name, pointId, 'agree');

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (pointId) await deleteTestPoint(pointId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  // ── Test 2: Removing a position (toggle off) writes null to livePositions ─
  // This is the key regression test for the ?? null-fallthrough bug.
  // Before the fix: null was stored in DB but ?? would fall through to the old DB
  // position, making the button re-appear as active after any re-render from DB.
  test('Toggling a position off writes null to livePositions (regression: ?? null fallthrough)', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      const uniqueFragment = `PosRemove${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P275Creator' });
      joinerUser = await createTestUser({ name: 'P275Joiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: position removal test story`,
      });
      storyId = story.id;
      const point = await createTestPoint(creatorUser.user.id, {
        statement: `P275 removal test point ${Date.now()}`,
      });
      pointId = point.id;
      await linkStoryToPoint(storyId, pointId);

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(
        speakerPage, listenerPage, creatorUser.email, joinerUser
      );

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Select story + expand points
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      await expect(speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) })).toBeVisible({ timeout: 5000 });
      await speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) }).click();

      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });
      const expandBtn = speakerPage.getByRole('button', { name: /1 point/i });
      await expect(expandBtn).toBeVisible({ timeout: 5000 });
      await expandBtn.click();

      const agreeSegmentBtn = speakerPage
        .locator('button[aria-pressed]')
        .filter({ hasText: /^Agree/ })
        .first();
      await expect(agreeSegmentBtn).toBeVisible({ timeout: 5000 });

      // Set Agree
      await agreeSegmentBtn.click();
      await expect(agreeSegmentBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 3000 });
      await waitForLivePosition(roomCode, creatorUser.name, pointId, 'agree');

      // Toggle off (same button again = remove)
      await agreeSegmentBtn.click();
      await expect(agreeSegmentBtn).toHaveAttribute('aria-pressed', 'false', { timeout: 3000 });

      // DB: livePositions[name][pointId] must be null — not absent and not 'agree'
      // Before the ?? fix this would still show 'agree' from profileSubjectPosition fallback
      await waitForLivePosition(roomCode, creatorUser.name, pointId, null);

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (pointId) await deleteTestPoint(pointId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  // ── Test 3: Position removed in DB is not restored on next live_state sync ─
  // Directly injects null into live_state and verifies the UI renders no active button.
  // Guards against regression where ?? re-read the DB profileSubjectPosition after sync.
  test('Position null in livePositions renders as inactive button after live_state sync', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      const uniqueFragment = `PosSync${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P275Creator' });
      joinerUser = await createTestUser({ name: 'P275Joiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: null sync test story`,
      });
      storyId = story.id;
      const point = await createTestPoint(creatorUser.user.id, {
        statement: `P275 sync test point ${Date.now()}`,
      });
      pointId = point.id;
      await linkStoryToPoint(storyId, pointId);

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(
        speakerPage, listenerPage, creatorUser.email, joinerUser
      );

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Select story + expand points
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      await expect(speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) })).toBeVisible({ timeout: 5000 });
      await speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) }).click();

      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });
      const expandBtn = speakerPage.getByRole('button', { name: /1 point/i });
      await expect(expandBtn).toBeVisible({ timeout: 5000 });
      await expandBtn.click();

      const agreeSegmentBtn = speakerPage
        .locator('button[aria-pressed]')
        .filter({ hasText: /^Agree/ })
        .first();
      await expect(agreeSegmentBtn).toBeVisible({ timeout: 5000 });

      // Set Agree so we have an active position to start with
      await agreeSegmentBtn.click();
      await expect(agreeSegmentBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 3000 });
      await waitForLivePosition(roomCode, creatorUser.name, pointId, 'agree');

      // Directly write null to DB (simulates reload scenario: position was removed,
      // null stored, page re-renders from DB — the ?? bug would restore 'agree' here)
      await setLivePositionInDB(roomCode, creatorUser.name, pointId, null);
      await waitForLivePosition(roomCode, creatorUser.name, pointId, null);

      // The app polls live_state every ~1s. After the null reaches the UI,
      // the Agree button must not be active (aria-pressed=false).
      // Timeout covers the polling interval + render.
      await expect(agreeSegmentBtn).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 });

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (pointId) await deleteTestPoint(pointId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});
