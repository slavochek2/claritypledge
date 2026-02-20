/**
 * @file p398-session-history-summary.spec.ts
 * @description E2E tests for P398: Clickable Session Round History with Summary Screen
 *
 * Tests the full "view completed round summary" flow:
 * 1. Complete a round → history entry shows chevron/button affordance
 * 2. Click history entry → summary screen opens inline (Back button visible)
 * 3. Back button → idle screen restored (action buttons visible, no Back button)
 * 4. Skip a round → history entry is NOT clickable (no button affordance)
 * 5. Summary auto-closes when a new round starts
 *
 * Auth notes:
 * - Both creator and joiner are authenticated (avoids signInAnonymously failures)
 * - Realtime doesn't propagate between isolated browser contexts — uses DB polling
 *
 * All two-party tests require browser.newContext() with separate pages.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Gets both participants into the /live session view.
 * Returns the room code.
 */
async function setupTwoPartySession(
  creatorPage: Parameters<typeof mockMicPermission>[0],
  joinerPage: Parameters<typeof mockMicPermission>[0],
  joinerUser: { email: string; name: string }
): Promise<string> {
  await creatorPage.goto('/live');
  await creatorPage.waitForLoadState('networkidle');
  await creatorPage.getByRole('button', { name: 'New session' }).click();
  await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

  const shareLink = await creatorPage.getByTestId('share-link').textContent();
  const roomCode = shareLink!.split('/').pop()!;
  expect(roomCode).toHaveLength(6);

  await joinerPage.goto(`/live/${roomCode}`);

  // P396: authenticated test users auto-join without the email form.
  // Try to find the email input with a short timeout; fill it only if it appears.
  const emailInput = joinerPage.getByPlaceholder('your@email.com');
  const formVisible = await emailInput
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (formVisible) {
    await emailInput.fill(joinerUser.email);
    await joinerPage.getByRole('checkbox').check();
    await joinerPage.getByRole('button', { name: 'Join Session' }).click();
  }

  // Handle "Updated Terms" dialog — can appear for both authenticated and anonymous users
  try {
    await joinerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
    await joinerPage.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No terms dialog — proceed normally
  }

  await waitForDBPresence('clarity_sessions', 'joiner_name', joinerUser.name, 'code', roomCode);
  console.log(`[p398] Room ${roomCode}: both participants in live view`);
  return roomCode;
}

/**
 * Completes one rating round for two participants.
 * Checker starts the round, both submit ratings, both click Continue.
 * Returns when both screens show the idle state again (action buttons visible).
 *
 * @param checkerPage    - The page of the user who clicks "Does X understand you?"
 * @param responderPage  - The page of the other participant
 * @param joinerName     - The joiner's display name (for button label matching)
 * @param checkerRating  - Rating to submit as the checker (1–9 to avoid verification write)
 * @param responderRating - Rating to submit as the responder
 */
async function completeTwoPartyRound(
  checkerPage: Parameters<typeof mockMicPermission>[0],
  responderPage: Parameters<typeof mockMicPermission>[0],
  joinerName: string,
  checkerRating = 8,
  responderRating = 7,
  options: { roomCode?: string; checkerName?: string } = {}
): Promise<void> {
  // Checker starts the round
  await checkerPage.getByRole('button', { name: new RegExp(`Does ${joinerName} understand you`, 'i') }).click();

  // Wait for checker's rating UI, then checker submits
  await expect(checkerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 15000 });
  await checkerPage.locator('button').filter({ hasText: new RegExp(`^${checkerRating}$`) }).click();
  await checkerPage.getByRole('button', { name: /Submit/i }).click();

  // Responder's drawer appears only after checker submits — wait for it, then responder submits
  await expect(responderPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 20000 });
  await responderPage.locator('button').filter({ hasText: new RegExp(`^${responderRating}$`) }).click();
  await responderPage.getByRole('button', { name: /Submit/i }).click();

  // Both click Continue on the revealed/celebration screen
  await expect(checkerPage.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 15000 });
  await expect(responderPage.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 15000 });

  // Brief settling delay: the celebration screen entrance animation may temporarily apply
  // pointer-events: none to the container, causing clicks to go to the element below.
  // Waiting ~300ms ensures the animation is complete and the button is truly interactive.
  await checkerPage.waitForTimeout(500);

  // Checker clicks Continue first.
  // updateClaritySessionLiveState does a full live_state replace (last-write-wins), so we must
  // confirm the checker's DB write is durable before the responder clicks — otherwise both read
  // celebrationAcknowledgedBy=[], each write only themselves, and bothAcknowledged never fires.
  await checkerPage.getByRole('button', { name: /Continue/i }).click();

  if (options.roomCode && options.checkerName) {
    // Poll DB until checker's name appears in celebrationAcknowledgedBy
    await waitForCelebrationAck(options.roomCode, options.checkerName);
    // Extra propagation delay: responder's app polls every 1s, and may not have picked up the
    // checker's ack yet even though it's in DB. Wait 1.5s so the polling cycle fires.
    await responderPage.waitForTimeout(1500);
  } else {
    // Fallback: blind delay (less reliable — prefer passing roomCode+checkerName)
    await checkerPage.waitForTimeout(3000);
  }

  await responderPage.getByRole('button', { name: /Continue/i }).click();

  // Wait for return to idle — action buttons reappear on checker's screen
  await expect(
    checkerPage.getByRole('button', { name: new RegExp(`Does ${joinerName} understand you`, 'i') })
  ).toBeVisible({ timeout: 20000 });
}

/**
 * Polls live_state.sessionHistory until it has at least `count` entries.
 */
async function waitForHistoryLength(
  roomCode: string,
  count: number,
  timeoutMs = 15000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', roomCode)
      .single();
    const history = (data?.live_state as Record<string, unknown> | null)?.sessionHistory;
    if (Array.isArray(history) && history.length >= count) {
      console.log(`[p398] sessionHistory has ${history.length} entries ✓`);
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`[waitForHistoryLength] Timed out waiting for ${count} history entries`);
}

/**
 * Polls DB until celebrationAcknowledgedBy includes the given userName.
 * Required because updateClaritySessionLiveState does a full live_state replace —
 * if the responder clicks Continue before this write lands, they overwrite the
 * checker's entry and bothAcknowledged never fires.
 */
async function waitForCelebrationAck(
  roomCode: string,
  userName: string,
  timeoutMs = 10000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', roomCode)
      .single();
    const ack = (data?.live_state as Record<string, unknown> | null)?.celebrationAcknowledgedBy as string[] | undefined;
    if (Array.isArray(ack) && ack.includes(userName)) {
      console.log(`[p398] celebrationAcknowledgedBy includes ${userName} ✓`);
      return;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`[waitForCelebrationAck] Timed out: ${userName} not in celebrationAcknowledgedBy`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('P398: Session History Summary', () => {
  test.describe.configure({ timeout: 120000 });

  // ── Test 1: Happy path — view completed round summary ─────────────────────
  test('completed round history entry is clickable → summary opens → Back restores idle', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;

    try {
      const uniqueFragment = `P398Round${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P398Creator' });
      joinerUser = await createTestUser({ name: 'P398Joiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: The importance of calibrated listening`,
      });
      storyId = story.id;

      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(creatorPage, joinerPage, joinerUser);

      // Wait for creator's idle screen to be ready
      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        joinerPage.getByRole('button', { name: new RegExp(`Does ${creatorUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });

      // Creator selects the story
      const searchInput = creatorPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      const storyResult = creatorPage.getByRole('button', { name: new RegExp(uniqueFragment) });
      await expect(storyResult).toBeVisible({ timeout: 5000 });
      await storyResult.click();

      // Complete the round — checker=10 triggers celebration ("Continue" button path)
      // story_verifications written but cascade-deleted via deleteTestUser in cleanup
      await completeTwoPartyRound(creatorPage, joinerPage, joinerUser.name, 10, 7, {
        roomCode: roomCode!,
        checkerName: creatorUser.name,
      });

      // DB confirms sessionHistory has 1 entry with journey data
      await waitForHistoryLength(roomCode!, 1);

      // Wait for the history entry button to appear on creator's screen
      // Completed entry is a button with aria-label "View round summary: [title]"
      const historyButton = creatorPage.getByRole('button', { name: /View round summary:/i });
      await expect(historyButton).toBeVisible({ timeout: 10000 });

      // Verify the title fragment is in the button's accessible name
      const ariaLabel = await historyButton.getAttribute('aria-label');
      expect(ariaLabel).toMatch(new RegExp(uniqueFragment));

      // Click the history entry — summary screen should open inline
      await historyButton.click();

      // Summary screen: Back button is the key affordance
      await expect(creatorPage.getByRole('button', { name: /^Back$/i })).toBeVisible({ timeout: 5000 });

      // Idle action buttons should be gone (replaced by summary content)
      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).not.toBeVisible();

      // Story title visible in summary (celebration screen reused)
      await expect(creatorPage.getByText(new RegExp(uniqueFragment))).toBeVisible({ timeout: 5000 });

      // Click Back — idle content restored
      await creatorPage.getByRole('button', { name: /^Back$/i }).click();

      // Action buttons are visible again
      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 5000 });

      // No Back button remaining
      await expect(creatorPage.getByRole('button', { name: /^Back$/i })).not.toBeVisible();

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  // ── Test 2: Summary auto-closes when new round starts ─────────────────────
  test('summary closes automatically when partner starts a new round', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      creatorUser = await createTestUser({ name: 'P398AutoClose' });
      joinerUser = await createTestUser({ name: 'P398AutoJoiner' });

      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(creatorPage, joinerPage, joinerUser);

      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        joinerPage.getByRole('button', { name: new RegExp(`Does ${creatorUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });

      // Complete round 1 (creator as checker)
      // checker=10 → celebration path with Continue button
      await completeTwoPartyRound(creatorPage, joinerPage, joinerUser.name, 10, 7, {
        roomCode: roomCode!,
        checkerName: creatorUser.name,
      });
      await waitForHistoryLength(roomCode!, 1);

      // Creator opens the summary
      const historyButton = creatorPage.getByRole('button', { name: /View round summary:/i });
      await expect(historyButton).toBeVisible({ timeout: 10000 });
      await historyButton.click();
      await expect(creatorPage.getByRole('button', { name: /^Back$/i })).toBeVisible({ timeout: 5000 });

      // Joiner (responder) starts a new round while creator is viewing the summary
      await joinerPage.getByRole('button', { name: new RegExp(`Does ${creatorUser.name} understand you`, 'i') }).click();

      // Creator's summary should auto-close — Back button disappears
      // (ratingPhase leaves 'idle', triggering the useEffect auto-reset)
      await expect(creatorPage.getByRole('button', { name: /^Back$/i })).not.toBeVisible({ timeout: 15000 });

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  // ── Test 3: Skipped round has no clickable affordance ─────────────────────
  test('skipped round history entry has no chevron button', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      creatorUser = await createTestUser({ name: 'P398SkipCreator' });
      joinerUser = await createTestUser({ name: 'P398SkipJoiner' });

      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(creatorPage, joinerPage, joinerUser);

      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });

      // Creator starts the round and submits a rating
      await creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') }).click();
      await expect(creatorPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 10000 });
      await creatorPage.locator('button').filter({ hasText: /^8$/ }).click();
      await creatorPage.getByRole('button', { name: /Submit/i }).click();

      // Creator is now in the "waiting" phase — "Cancel" button goes back to idle
      // via onBackToIdle → handleSkip, creating a skipped history entry
      const cancelButton = creatorPage.getByRole('button', { name: /^Cancel$/i });
      await expect(cancelButton).toBeVisible({ timeout: 15000 });
      await cancelButton.click();

      // Wait for return to idle with skipped entry in history
      await waitForHistoryLength(roomCode!, 1);
      await expect(
        creatorPage.getByRole('button', { name: new RegExp(`Does ${joinerUser.name} understand you`, 'i') })
      ).toBeVisible({ timeout: 15000 });

      // Skipped entry should show "Skipped" label
      await expect(creatorPage.getByText('Skipped')).toBeVisible({ timeout: 5000 });

      // Skipped entry must NOT be a button — no "View round summary" button present
      await expect(creatorPage.getByRole('button', { name: /View round summary:/i })).not.toBeVisible();

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});
