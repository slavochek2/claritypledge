/**
 * @file live-rating-drawer.spec.ts
 * @description Reproducer for rating drawer bug: when person A submits a rating,
 * person B should see a rating drawer (bottom sheet) to submit their own rating.
 *
 * Bug: Person B gets stuck in "Waiting for partner to share their confidence"
 * without ever seeing the drawer.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
} from './helpers/test-user';
import { waitForDBPresence } from './helpers/test-realtime';
import { mockMicPermission } from './helpers/test-realtime';

/**
 * Polls live_state until ratingPhase matches expected value.
 */
async function waitForRatingPhase(
  sessionCode: string,
  phase: string,
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
    if (liveState?.ratingPhase === phase) {
      console.log(`[drawer-test] ratingPhase = '${phase}' confirmed ✓`);
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ratingPhase = '${phase}'`);
}

/**
 * Dumps the current live_state for debugging.
 */
async function dumpLiveState(sessionCode: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabaseAdmin
    .from('clarity_sessions')
    .select('live_state')
    .eq('code', sessionCode)
    .single();
  return (data?.live_state as Record<string, unknown>) ?? null;
}

/**
 * Creates the session and gets both participants into the live view.
 */
async function setupTwoPartySession(
  creatorPage: Parameters<typeof mockMicPermission>[0],
  joinerPage: Parameters<typeof mockMicPermission>[0],
  _creatorEmail: string,
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

  // Handle auth form if it appears
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

  // Handle "Updated Terms" dialog
  try {
    await joinerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
    await joinerPage.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No terms dialog
  }

  await waitForDBPresence('clarity_sessions', 'joiner_name', joinerUser.name, 'code', roomCode);
  console.log(`[drawer-test] Room ${roomCode}: both participants in live view`);
  return roomCode;
}

test.describe('Rating drawer appears for responder', () => {
  test.describe.configure({ timeout: 90000 });

  test('When creator submits rating, joiner sees rating drawer', async ({ browser }) => {
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
      creatorUser = await createTestUser({ name: 'DrawerCreator' });
      joinerUser = await createTestUser({ name: 'DrawerJoiner' });

      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(creatorPage, joinerPage, creatorUser.email, joinerUser);

      // ── Step 1: Wait for both to see idle screen ──
      const creatorCheckButton = creatorPage.getByRole('button', {
        name: `Does ${joinerUser.name} understand you?`,
      });
      await expect(creatorCheckButton).toBeVisible({ timeout: 15000 });

      const joinerCheckButton = joinerPage.getByRole('button', {
        name: `Does ${creatorUser.name} understand you?`,
      });
      await expect(joinerCheckButton).toBeVisible({ timeout: 15000 });

      console.log('[drawer-test] Both users see idle screen ✓');

      // ── Step 2: Creator taps "Does JoinerName understand you?" ──
      await creatorCheckButton.click();
      console.log('[drawer-test] Creator clicked check button');

      // Creator should see the rating screen with number buttons
      // Wait for a rating button (e.g., "7") to appear
      const ratingButton = creatorPage.getByRole('button', { name: '7' });
      await expect(ratingButton).toBeVisible({ timeout: 10000 });
      console.log('[drawer-test] Creator sees rating buttons ✓');

      // ── Step 3: Creator selects rating and clicks Submit ──
      await ratingButton.click();
      console.log('[drawer-test] Creator selected rating 7');

      const submitButton = creatorPage.getByRole('button', { name: 'Submit' });
      await expect(submitButton).toBeVisible({ timeout: 5000 });
      await submitButton.click();
      console.log('[drawer-test] Creator clicked Submit');

      // Wait for DB to confirm the rating was written
      await waitForRatingPhase(roomCode, 'waiting');

      // Dump state for debugging
      const stateAfterRating = await dumpLiveState(roomCode);
      console.log('[drawer-test] Live state after creator rating:', JSON.stringify(stateAfterRating, null, 2));

      // ── Step 4: Joiner should see rating drawer ──
      // The drawer contains a rating question like "How confident are you that you understand DrawerCreator?"
      // Give the app's polling interval time to pick up the change (1s poll + render)
      await joinerPage.waitForTimeout(3000);

      // Dump joiner's console logs for debugging
      const joinerLogs: string[] = [];
      joinerPage.on('console', msg => {
        if (msg.text().includes('[LiveModeView]')) {
          joinerLogs.push(msg.text());
        }
      });
      // Trigger a re-render by waiting a bit more
      await joinerPage.waitForTimeout(2000);

      // Check what the joiner sees
      // The drawer should show a rating question
      const drawerVisible = await joinerPage
        .getByText(/How confident are you/i)
        .isVisible()
        .catch(() => false);

      // Also check if joiner is stuck in "Waiting" (the bug)
      const waitingVisible = await joinerPage
        .getByText(/Waiting for.*to share their confidence/i)
        .isVisible()
        .catch(() => false);

      // Log joiner's LiveModeView debug output
      console.log('[drawer-test] Joiner console logs:', joinerLogs);
      console.log('[drawer-test] Drawer visible:', drawerVisible);
      console.log('[drawer-test] Waiting message visible:', waitingVisible);

      // THE ACTUAL ASSERTION: joiner should see the drawer, not the waiting message
      if (waitingVisible && !drawerVisible) {
        // Dump the full live state and joiner's page content for debugging
        const finalState = await dumpLiveState(roomCode);
        console.error('[drawer-test] BUG REPRODUCED: Joiner stuck in waiting, no drawer');
        console.error('[drawer-test] Final live_state:', JSON.stringify(finalState, null, 2));

        // Get page text for debugging
        const pageText = await joinerPage.textContent('body');
        console.error('[drawer-test] Joiner page text:', pageText?.substring(0, 500));
      }

      expect(drawerVisible, 'Joiner should see rating drawer').toBe(true);
      expect(waitingVisible, 'Joiner should NOT see waiting message').toBe(false);

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});
