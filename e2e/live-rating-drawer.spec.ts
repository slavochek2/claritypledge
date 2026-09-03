/**
 * @file live-rating-drawer.spec.ts
 * @description Reproducer for rating drawer bug: when person A submits a rating,
 * person B should see a rating drawer (bottom sheet) to submit their own rating.
 *
 * Bug: Person B gets stuck in "Waiting for partner to share their confidence"
 * without ever seeing the drawer.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
} from './helpers/test-user';
import { waitForDBPresence } from './helpers/test-realtime';
import { mockMicPermission } from './helpers/test-realtime';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

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
    // P1232: P396 removed the guest email input and the consent checkbox.
    // "Join Session" now renders only on the auto-join ERROR path, so an
    // unconditional click hangs; a guard keyed on the removed email input
    // is always false and skips the join entirely. See helpers/live-join.ts.
    await completeLiveJoinIfPrompted(joinerPage);

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

  // Mobile viewport
  const _MOBILE_VIEWPORT = { width: 375, height: 812 };
  // Desktop viewport — matches user's actual setup (two windows side by side)
  const DESKTOP_VIEWPORT = { width: 768, height: 900 };

  test('On DESKTOP: when creator submits rating, joiner sees rating drawer', async ({ browser }) => {
    const creatorContext = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const joinerContext = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    let roomCode: string | null = null;
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Both users have the SAME name — this is the bug scenario.
      // Name collision caused isChecker to be true for both sides.
      creatorUser = await createTestUser({ name: 'SameName' });
      joinerUser = await createTestUser({ name: 'SameName' });

      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      roomCode = await setupTwoPartySession(creatorPage, joinerPage, creatorUser.email, joinerUser);

      // ── Step 1: Wait for both to see idle screen ──
      // Both users see "Does SameName understand you?" since names are identical
      const creatorCheckButton = creatorPage.getByRole('button', {
        name: /Does.*understand you/,
      });
      await expect(creatorCheckButton).toBeVisible({ timeout: 15000 });

      const joinerCheckButton = joinerPage.getByRole('button', {
        name: /Does.*understand you/,
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
      // Give the app's polling interval time to pick up the change (1s poll + render)
      // The drawer should appear as a bottom sheet with a rating question

      // Wait for the drawer to appear (polls every 1s, give it time)
      const drawerText = joinerPage.getByText(/How confident are you/i);
      const waitingText = joinerPage.getByText(/Waiting for.*to share their confidence/i);

      // Wait up to 10s for either drawer or waiting message to appear
      const result = await Promise.race([
        drawerText.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'drawer' as const),
        waitingText.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'waiting' as const),
      ]).catch(() => 'neither' as const);

      // Take screenshot of joiner's screen for evidence
      await joinerPage.screenshot({ path: 'test-results/drawer-test-joiner.png' });
      console.log('[drawer-test] Joiner sees:', result);

      if (result !== 'drawer') {
        // Dump state for debugging
        const finalState = await dumpLiveState(roomCode);
        console.error('[drawer-test] Live state:', JSON.stringify(finalState, null, 2));
        const pageText = await joinerPage.textContent('body');
        console.error('[drawer-test] Joiner page text:', pageText?.substring(0, 500));
      }

      expect(result, 'Joiner should see rating drawer, not waiting message').toBe('drawer');

      // ── Step 5: Verify drawer is rendered (bounding box exists) ──
      const drawerBox = await drawerText.boundingBox();
      expect(drawerBox, 'Drawer text should have a bounding box').not.toBeNull();
      console.log('[drawer-test] Drawer position:', drawerBox);

      // Verify rating buttons exist and are rendered
      const ratingBtn = joinerPage.getByRole('button', { name: '5' });
      await expect(ratingBtn).toBeVisible({ timeout: 3000 });

      // Take final screenshot
      await joinerPage.screenshot({ path: 'test-results/drawer-test-joiner-final.png' });
      console.log('[drawer-test] Drawer and rating buttons rendered ✓');

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});
