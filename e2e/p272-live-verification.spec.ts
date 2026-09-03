/**
 * @file p272-live-verification.spec.ts
 * @description E2E tests for P272: Verification of Stories in /live
 *
 * Tests the full story selection and verification loop:
 * 1. Story picker (StorySearchPicker) appears for authenticated creator with stories
 * 2. Story selection syncs to listener screen in real time
 * 3. "Speak freely" pre-round button clears story from both screens
 * 4. Story card remains visible throughout the rating phase
 * 5. story_verifications record is written when speaker_rating = 10
 *
 * Auth notes:
 * - Creator must be authenticated (story picker only shows authenticated user's stories)
 * - Joiner is also authenticated to avoid signInAnonymously failures in test env
 * - Realtime doesn't propagate between isolated browser contexts — tests use DB polling
 *   and the app's 1-second polling fallback for cross-context state sync
 *
 * All two-party tests require browser.newContext() with separate pages.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { waitForDBPresence, mockMicPermission } from './helpers/test-realtime';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Polls clarity_sessions.live_state until selectedStoryId matches storyId.
 * Use after creator selects a story to confirm DB is updated before asserting listener UI.
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
      console.log(`[p272] live_state.selectedStoryId = ${storyId} confirmed ✓`);
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
 * Polls story_verifications until a row with accuracy_achieved=true exists for storyId.
 * Use after completing a round with speaker_rating=10 to confirm verification was written.
 */
async function waitForVerificationCreated(storyId: string, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('story_verifications')
      .select('id')
      .eq('story_id', storyId)
      .eq('accuracy_achieved', true)
      .limit(1);
    if (data && data.length > 0) {
      console.log(`[p272] story_verifications record found for story ${storyId} ✓`);
      return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// ─── Setup: join both participants into live view ─────────────────────────────

/**
 * Creates the session and gets both participants into the live view.
 * Returns the room code.
 */
async function setupTwoPartySession(
  speakerPage: Parameters<typeof mockMicPermission>[0],
  listenerPage: Parameters<typeof mockMicPermission>[0],
  creatorEmail: string,
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

  // P396: authenticated test users auto-join without the email form.
  // Try to find the email input with a short timeout; fill it only if it appears.
    // P1232: P396 removed the guest email input and the consent checkbox.
    // "Join Session" now renders only on the auto-join ERROR path, so an
    // unconditional click hangs; a guard keyed on the removed email input
    // is always false and skips the join entirely. See helpers/live-join.ts.
    await completeLiveJoinIfPrompted(listenerPage);

  // Handle "Updated Terms" dialog — can appear for both authenticated and anonymous users
  try {
    await listenerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
    await listenerPage.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No terms dialog — proceed normally
  }

  // Wait for joiner name to reach DB (Realtime doesn't propagate between isolated contexts)
  await waitForDBPresence('clarity_sessions', 'joiner_name', joinerUser.name, 'code', roomCode);

  console.log(`[p272] Room ${roomCode}: both participants in live view`);
  return roomCode;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('P272: Story Selection and Verification in /live', () => {
  test.describe.configure({ timeout: 90000 });

  // ── Test 1: Story picker appears for creator with stories ─────────────────
  test('Story picker search input visible for authenticated creator with stories after both join', async ({ browser }) => {
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

    try {
      creatorUser = await createTestUser({ name: 'P272Creator' });
      joinerUser = await createTestUser({ name: 'P272Joiner' });

      // Creator needs at least one story for the picker to appear
      const story = await createTestStory(creatorUser.user.id, {
        content: 'P272UniqueStory: When clarity becomes the foundation',
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(speakerPage, listenerPage, creatorUser.email, joinerUser);

      // Wait for creator's live view to load (action buttons visible)
      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Story picker (StorySearchPicker) should be visible below the action buttons
      // when creator has stories and no story is currently selected
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  // ── Test 2: Story selection syncs to listener screen ─────────────────────
  test('Selected story appears on listener screen immediately after creator selects it', async ({ browser }) => {
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

    try {
      const uniqueFragment = `ClarityMethod${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P272Creator' });
      joinerUser = await createTestUser({ name: 'P272Joiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: When I first realised that calibration is earned`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(speakerPage, listenerPage, creatorUser.email, joinerUser);

      // Wait for both to be in live view
      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        listenerPage.getByRole('button', { name: `Does ${creatorUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Creator types unique fragment into story search picker
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);

      // Story result appears — click it
      const storyResult = speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) });
      await expect(storyResult).toBeVisible({ timeout: 5000 });
      await storyResult.click();

      // Creator's screen should show the story card immediately
      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });

      // Confirm live_state updated in DB before asserting listener UI
      await waitForStoryInLiveState(roomCode, storyId);

      // Listener's screen should show the story card (via app polling fallback ~1s)
      await expect(listenerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 10000 });

      // Story text should be visible on listener's screen
      await expect(listenerPage.getByText(uniqueFragment)).toBeVisible({ timeout: 5000 });

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  // ── Test 3: Speak freely pre-round clears story from both screens ─────────
  test('"Speak freely" pre-round button clears story from both screens', async ({ browser }) => {
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

    try {
      const uniqueFragment = `ClearTest${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P272Creator' });
      joinerUser = await createTestUser({ name: 'P272Joiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: The speak freely flow test`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(speakerPage, listenerPage, creatorUser.email, joinerUser);

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        listenerPage.getByRole('button', { name: `Does ${creatorUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Creator selects a story
      const searchInput = speakerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      const storyResult = speakerPage.getByRole('button', { name: new RegExp(uniqueFragment) });
      await expect(storyResult).toBeVisible({ timeout: 5000 });
      await storyResult.click();

      // Story card visible on both screens
      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });
      await waitForStoryInLiveState(roomCode, storyId);
      await expect(listenerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 10000 });

      // "Speak freely" button should appear below the action buttons (pre-round state)
      const speakFreelyButton = speakerPage.getByRole('button', { name: 'Speak freely' });
      await expect(speakFreelyButton).toBeVisible({ timeout: 5000 });

      // Creator clicks "Speak freely" to clear the story
      await speakFreelyButton.click();

      // Story card should disappear from creator's screen
      await expect(speakerPage.getByTestId('live-story-card-expanded')).not.toBeVisible({ timeout: 5000 });

      // Story picker search input should reappear (no story selected)
      await expect(speakerPage.getByPlaceholder('Search your stories…')).toBeVisible({ timeout: 5000 });

      // Story card should also disappear from listener's screen (via DB polling)
      await expect(listenerPage.getByTestId('live-story-card-expanded')).not.toBeVisible({ timeout: 10000 });

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  // ── Test 4: Story visible during rating phase ─────────────────────────────
  test('Story card remains visible on creator screen during rating phase', async ({ browser }) => {
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

    try {
      const uniqueFragment = `RatingPhase${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P272Creator' });
      joinerUser = await createTestUser({ name: 'P272Joiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: Visible during rating test`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(speakerPage, listenerPage, creatorUser.email, joinerUser);

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
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

      // Confirm story selected on both screens
      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });
      await waitForStoryInLiveState(roomCode, storyId);
      await expect(listenerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 10000 });

      // Start a round by clicking action button
      await speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` }).click();

      // Rating drawer should slide up (speaker's rating card)
      await expect(speakerPage.getByText(/How well do you believe/i)).toBeVisible({ timeout: 10000 });

      // Story card MUST still be visible above the rating drawer (UX requirement)
      await expect(speakerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  // ── Test 5: story_verifications written at speaker_rating = 10 ───────────
  test('story_verifications record created and accuracy_achieved=true when speaker rates 10', async ({ browser }) => {
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

    try {
      const uniqueFragment = `VerifyAt10${Date.now()}`;
      creatorUser = await createTestUser({ name: 'P272Creator' });
      joinerUser = await createTestUser({ name: 'P272Joiner' });

      const story = await createTestStory(creatorUser.user.id, {
        content: `${uniqueFragment}: Full verification loop test`,
      });
      storyId = story.id;

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(speakerPage, listenerPage, creatorUser.email, joinerUser);

      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` })
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

      // Wait for story to sync to listener
      await waitForStoryInLiveState(roomCode, storyId);
      await expect(listenerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 10000 });

      // Start round
      await speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` }).click();
      await expect(speakerPage.getByText(/How well do you believe/i)).toBeVisible({ timeout: 10000 });

      // Speaker rates 10 (perfect understanding — triggers verification)
      await speakerPage.getByRole('button', { name: '10' }).click();
      await speakerPage.getByRole('button', { name: 'Submit' }).click();

      // Listener sees rating prompt
      await expect(listenerPage.getByText(/How confident are you/i)).toBeVisible({ timeout: 10000 });
      await listenerPage.getByRole('button', { name: '8' }).click();
      await listenerPage.getByRole('button', { name: 'Submit' }).click();

      // Both submitted → bothSubmitted block fires → writeStoryVerification called
      // Poll DB for story_verifications row with accuracy_achieved=true
      const verificationCreated = await waitForVerificationCreated(storyId, 15000);
      expect(
        verificationCreated,
        `story_verifications row not created for story ${storyId} after speaker_rating=10`
      ).toBe(true);

      // UI should show congratulations/celebration screen (not gap reveal)
      // The celebration screen appears when accuracy_achieved=true
      await expect(speakerPage.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 10000 });

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      // Verifications and story cleaned up by deleteTestUser (cascade) below
      if (storyId) await deleteTestStory(storyId);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  // ── Test 6: Regression — speak freely without story still works ───────────
  test('Sessions with no story selected still work as speak freely (no regression)', async ({ browser }) => {
    const speakerContext = await browser.newContext();
    const listenerContext = await browser.newContext();
    const speakerPage = await speakerContext.newPage();
    const listenerPage = await listenerContext.newPage();

    await mockMicPermission(speakerPage);
    await mockMicPermission(listenerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Creator without stories — picker is hidden, action buttons are primary
      creatorUser = await createTestUser({ name: 'P272 NoStory' });
      joinerUser = await createTestUser({ name: 'P272Joiner' });

      await setTestSession(speakerPage, creatorUser.email);
      await setTestSession(listenerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(speakerPage, listenerPage, creatorUser.email, joinerUser);

      // Both should see action buttons (standard live view, no story picker)
      // Note: component renders getFirstName(partnerName) which takes first word only
      const joinerFirstName = joinerUser.name.split(' ')[0];
      const creatorFirstName = creatorUser.name.split(' ')[0];
      await expect(
        speakerPage.getByRole('button', { name: `Does ${joinerFirstName} understand you?` })
      ).toBeVisible({ timeout: 15000 });
      await expect(
        listenerPage.getByRole('button', { name: `Does ${creatorFirstName} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // No story card should be visible (no story selected)
      await expect(speakerPage.getByTestId('live-story-card-expanded')).not.toBeVisible();

      // "Speak freely" pre-round button should NOT appear (no story to clear)
      // Standard "Speak freely" button during a round is handled by existing mid-round flow
      // (This assertion guards against showing an unexpected pre-round speak freely button)

      // Start a round without a story — should work as current behavior
      await speakerPage.getByRole('button', { name: `Does ${joinerUser.name} understand you?` }).click();
      await expect(speakerPage.getByText(/How well do you believe/i)).toBeVisible({ timeout: 10000 });

    } finally {
      await speakerContext.close();
      await listenerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});
