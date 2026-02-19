/**
 * @file p-story-persistence-fixes.spec.ts
 * @description Regression tests for two story-persistence bugs in clarity-live-page.tsx:
 *
 * Bug 1 — Story card lingers after round completes at score 10
 *   Root cause: handleCelebrationComplete cleared selectedStoryId but NOT selectedStoryData.
 *   The live-mode-view useEffect only hides the story card when selectedStoryData is falsy,
 *   so the card remained visible after round completion.
 *   Fix: Add selectedStoryData: undefined to the updateLiveState call in handleCelebrationComplete.
 *
 * Bug 5 — Story selection not propagating to partner via polling
 *   Root cause: The polling drift check in clarity-live-page.tsx was missing selectedStoryId,
 *   selectedStoryData, and selectedContentTitle from its drift comparison. When Realtime
 *   WebSocket drops (common on mobile), the partner's 1-second polling never detected
 *   story selection and their screen never updated.
 *   Fix: Add three drift variables and include them in the serverHasUpdate expression.
 *   Note: Bug 5 cannot be isolated in a distinct E2E test because Playwright's isolated
 *   browser contexts already simulate the WebSocket-dropout scenario — the app's 1-second
 *   DB polling fallback IS the mechanism these two-party tests exercise. The existing
 *   p272-live-verification.spec.ts Test 2 already covers the polling path for story
 *   selection propagation. A unit test for the drift-check logic in clarity-live-page.tsx
 *   would be more appropriate for targeted coverage.
 *
 * Session setup:
 *   - Creator: authenticated (needs stories + session)
 *   - Listener: guest (P396 name-only form — no email, no checkbox)
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { waitForDBPresence, mockMicPermission } from './helpers/test-realtime';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GUEST_JOINER_NAME = 'LiveTestGuest';

/**
 * Polls clarity_sessions.live_state until selectedStoryId matches storyId.
 */
async function waitForStoryInLiveState(
  sessionCode: string,
  storyId: string,
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
    if (liveState?.selectedStoryId === storyId) {
      console.log(`[story-fixes] live_state.selectedStoryId = ${storyId} confirmed`);
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `[waitForStoryInLiveState] Timed out after ${timeoutMs}ms: selectedStoryId ${storyId} ` +
    `not found in live_state for session ${sessionCode}`
  );
}

/**
 * Polls clarity_sessions.live_state until selectedStoryId and selectedStoryData are absent.
 * Used to confirm that round completion cleared story fields from DB before asserting UI.
 */
async function waitForStoryCleared(
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
    const liveState = data?.live_state as Record<string, unknown> | null;
    // selectedStoryId and selectedStoryData should both be absent after round completion
    if (!liveState?.selectedStoryId && !liveState?.selectedStoryData) {
      console.log(`[story-fixes] live_state story fields cleared confirmed`);
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `[waitForStoryCleared] Timed out after ${timeoutMs}ms: story fields still set in ` +
    `live_state for session ${sessionCode}`
  );
}

/**
 * Gets both participants into the live view.
 * Creator: authenticated.
 * Listener: guest (P396 name-only form).
 * Returns the room code.
 */
async function setupTwoPartySession(
  speakerPage: Parameters<typeof mockMicPermission>[0],
  listenerPage: Parameters<typeof mockMicPermission>[0]
): Promise<string> {
  // Speaker creates session
  await speakerPage.goto('/live');
  await speakerPage.waitForLoadState('networkidle');
  await speakerPage.getByRole('button', { name: 'New session' }).click();
  await expect(speakerPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

  const shareLink = await speakerPage.getByTestId('share-link').textContent();
  const roomCode = shareLink!.split('/').pop()!;
  expect(roomCode).toHaveLength(6);

  // Listener joins as guest: name-only form (P396)
  await listenerPage.goto(`/live/${roomCode}`);
  const nameInput = listenerPage.locator('input[placeholder="Enter your name"]');
  await expect(nameInput).toBeVisible({ timeout: 10000 });
  await nameInput.fill(GUEST_JOINER_NAME);
  await listenerPage.getByRole('button', { name: 'Join as Guest' }).click();

  // Wait for joiner name to reach DB (Realtime doesn't propagate between isolated contexts)
  await waitForDBPresence('clarity_sessions', 'joiner_name', GUEST_JOINER_NAME, 'code', roomCode, 15000);

  console.log(`[story-fixes] Room ${roomCode}: both participants joined`);
  return roomCode;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Story Persistence Fixes — Regression', () => {
  test.describe.configure({ timeout: 120000 });

  /**
   * Bug 1 regression: After a round completes with speaker_rating=10 and both
   * parties click Continue, the story card must disappear from both screens.
   *
   * Before the fix: handleCelebrationComplete cleared selectedStoryId but left
   * selectedStoryData set, so live-mode-view kept rendering the story card.
   * After the fix: selectedStoryData: undefined is included in the updateLiveState call.
   */
  test('Bug 1: Story card disappears from both screens after round completes at score 10', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      const uniqueFragment = `RoundComplete${Date.now()}`;
      creatorUser = await createTestUser({ name: 'StoryFixCreator' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: The story that should vanish after round ends`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);

      roomCode = await setupTwoPartySession(speakerPage, listenerPage);

      // Wait for both to be in live view
      await expect(
        speakerPage.getByRole('button', { name: `Does ${GUEST_JOINER_NAME} understand you?` })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        listenerPage.getByRole('button', { name: `Does ${creatorUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Creator selects story
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      const storyResult = speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) });
      await expect(storyResult).toBeVisible({ timeout: 5000 });
      await storyResult.click();

      // Story card visible on creator's screen immediately
      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });

      // Confirm DB update, then wait for listener's screen to show the card
      await waitForStoryInLiveState(roomCode, storyId);
      await expect(listenerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 10000 });

      // Start a round
      await speakerPage.getByRole('button', { name: `Does ${GUEST_JOINER_NAME} understand you?` }).click();
      await expect(speakerPage.getByText(/How well do you believe/i)).toBeVisible({ timeout: 10000 });

      // Speaker rates 10 (triggers verification + celebration path)
      await speakerPage.getByRole('button', { name: '10' }).click();
      await speakerPage.getByRole('button', { name: 'Submit' }).click();

      // Listener submits their rating
      await expect(listenerPage.getByText(/How confident are you/i)).toBeVisible({ timeout: 10000 });
      await listenerPage.getByRole('button', { name: '8' }).click();
      await listenerPage.getByRole('button', { name: 'Submit' }).click();

      // Both should see the celebration/Continue screen
      await expect(speakerPage.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 15000 });
      await expect(listenerPage.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 15000 });

      // The two-party Continue coordination works via Realtime in production, but isolated
      // Playwright contexts don't propagate celebrationAcknowledgedBy through the polling
      // drift check (it's a separate concern). To test Bug 1 directly, we write the speaker's
      // acknowledgment to the DB before the listener clicks — simulating what Realtime would do.
      // This ensures the listener's handleCelebrationComplete sees both names and fires the
      // "both done" branch that must clear selectedStoryData.
      const { data: sessionRow } = await supabaseAdmin
        .from('clarity_sessions')
        .select('id,live_state')
        .eq('code', roomCode)
        .single();
      const currentLiveState = sessionRow?.live_state as Record<string, unknown>;
      await supabaseAdmin
        .from('clarity_sessions')
        .update({
          live_state: {
            ...currentLiveState,
            celebrationAcknowledgedBy: [creatorUser.name],
          },
        })
        .eq('code', roomCode);

      // Listener clicks Continue — their handleCelebrationComplete reads celebrationAcknowledgedBy
      // from confirmedLiveStateRef. Give polling 2s to pick up our DB write before the click.
      await new Promise(r => setTimeout(r, 2500));
      await listenerPage.getByRole('button', { name: /Continue/i }).click();

      // Wait for DB to confirm story fields are cleared (selectedStoryId + selectedStoryData gone)
      // This is the core Bug 1 regression assertion.
      await waitForStoryCleared(roomCode, 15000);

      // Bug 1 regression: story card MUST be gone from creator's screen after round ends
      await expect(speakerPage.getByTestId('live-story-card-expanded')).not.toBeVisible({ timeout: 10000 });

      // Story card MUST also be gone from listener's screen
      await expect(listenerPage.getByTestId('live-story-card-expanded')).not.toBeVisible({ timeout: 10000 });

      // Creator should be back in idle state — story search picker reappears
      await expect(speakerPage.getByPlaceholder('Search your stories…')).toBeVisible({ timeout: 10000 });

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
    }
  });

  /**
   * Bug 5 (polling drift): Story selection must propagate to listener via DB polling fallback.
   *
   * Playwright's isolated browser contexts simulate WebSocket isolation — the app's 1-second
   * DB polling fallback is the only propagation mechanism between contexts. This test
   * verifies that selectedStoryId/selectedStoryData/selectedContentTitle drift is detected
   * and applied to the listener's screen.
   *
   * Before the fix: selectedStoryId/selectedStoryData/selectedContentTitle were missing from
   * the drift check, so polling would never apply story selection to the partner's screen.
   * After the fix: All three fields are included in the drift check and serverHasUpdate.
   */
  test('Bug 5: Story selection propagates to listener screen via DB polling fallback', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      const uniqueFragment = `PollDrift${Date.now()}`;
      creatorUser = await createTestUser({ name: 'StoryPollCreator' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: Polling drift detection test`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);

      roomCode = await setupTwoPartySession(speakerPage, listenerPage);

      // Wait for both to be in live view
      await expect(
        speakerPage.getByRole('button', { name: `Does ${GUEST_JOINER_NAME} understand you?` })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        listenerPage.getByRole('button', { name: `Does ${creatorUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Creator selects story — writes selectedStoryId + selectedStoryData + selectedContentTitle to DB
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      const storyResult = speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) });
      await expect(storyResult).toBeVisible({ timeout: 5000 });
      await storyResult.click();

      // Confirm DB has selectedStoryId written
      await waitForStoryInLiveState(roomCode, storyId);

      // Bug 5 regression: listener MUST see the story card via polling fallback
      // (isolated context = no Realtime WebSocket propagation — pure polling path)
      await expect(listenerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 12000 });
      await expect(listenerPage.getByText(uniqueFragment)).toBeVisible({ timeout: 5000 });

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
    }
  });
});
