/**
 * E2E tests for starting a new meeting after session ends
 *
 * Bug: After a session ends (partner leaves or creator ends it) and users try to
 * start a new meeting, the "Waiting for Partner" screen gets stuck because
 * stale refs from the previous session are not properly reset.
 *
 * Reproduction steps:
 * 1. Creator creates session, joiner joins - works fine
 * 2. Session ends (partner leaves OR creator ends it)
 * 3. Both users click "Start New Session" to go back to start screen
 * 4. Creator starts NEW session
 * 5. Joiner tries to join NEW session → BUG: STUCK on "Waiting for Partner"
 *
 * Both users must be authenticated: guest users are redirected to /signup
 * by the auth gate when they navigate to /live without a room code.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser, deleteClaritySession } from './helpers/test-user';
import { waitForDBPresence, mockMicPermission } from './helpers/test-realtime';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

test.describe('New Meeting After Session Ends', () => {
  test.describe.configure({ timeout: 120000 }); // Long tests with multiple meetings

  /**
   * This is the exact bug scenario:
   * - Same two users (creator + joiner) have a meeting
   * - Meeting ends
   * - They try to have ANOTHER meeting
   * - Bug: Creator stuck on "Waiting for Partner" even though joiner joined
   */
  test('Same two users can connect in a second meeting after first session ends', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    const sessionCodes: string[] = [];
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Both users authenticated — avoids /signup redirect when navigating to /live after leaving
      creatorUser = await createTestUser({ name: 'Alice' });
      joinerUser = await createTestUser({ name: 'Bob' });
      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      // ========================================
      // MEETING 1: First successful meeting
      // ========================================

      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink1 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode1 = shareLink1!.split('/').pop()!;
      sessionCodes.push(roomCode1);

      await joinerPage.goto(`/live/${roomCode1}`);
      // P1232: P396 removed the guest email input and the consent checkbox, and
      // "Join Session" now renders only when auto-join FAILS — an unconditional
      // click on either hangs until the test times out. See helpers/live-join.ts.
      await completeLiveJoinIfPrompted(joinerPage);
      // Handle "Updated Terms" dialog — new test users trigger this on first join
      try {
        await joinerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
        await joinerPage.getByRole('button', { name: 'Continue' }).click();
      } catch {
        // No terms dialog — proceed normally
      }

      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Bob', 'code', roomCode1);

      await expect(creatorPage.getByRole('button', { name: 'Does Bob understand you?' })).toBeVisible({ timeout: 15000 });
      await expect(joinerPage.getByRole('button', { name: 'Does Alice understand you?' })).toBeVisible({ timeout: 15000 });

      // ========================================
      // END MEETING 1: Joiner leaves
      // ========================================

      await joinerPage.getByRole('button', { name: 'Menu' }).click();
      await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();
      await expect(joinerPage.getByText('Leave session?')).toBeVisible();
      await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

      // Auth user returns to /live after leaving (guests would go to /signup)
      await expect(joinerPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 10000 });

      await expect(creatorPage.getByText('Bob has left')).toBeVisible({ timeout: 10000 });
      await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
      await expect(creatorPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 5000 });

      // ========================================
      // MEETING 2: Second meeting — THIS IS WHERE THE BUG OCCURS
      // ========================================

      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink2 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode2 = shareLink2!.split('/').pop()!;
      sessionCodes.push(roomCode2);
      expect(roomCode2).not.toBe(roomCode1);

      await joinerPage.goto(`/live/${roomCode2}`);
      // P1232: P396 removed the guest email input and the consent checkbox, and
      // "Join Session" now renders only when auto-join FAILS — an unconditional
      // click on either hangs until the test times out. See helpers/live-join.ts.
      await completeLiveJoinIfPrompted(joinerPage);

      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Bob', 'code', roomCode2);

      // ========================================
      // CRITICAL: Both should connect in Meeting 2
      // BUG: Creator stays stuck on "Waiting for Partner"
      // ========================================
      await expect(creatorPage.getByRole('button', { name: 'Does Bob understand you?' })).toBeVisible({ timeout: 15000 });
      await expect(joinerPage.getByRole('button', { name: 'Does Alice understand you?' })).toBeVisible({ timeout: 15000 });

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  test('Creator waiting screen stays stable after previous session ended', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    const sessionCodes: string[] = [];
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      creatorUser = await createTestUser({ name: 'Host' });
      joinerUser = await createTestUser({ name: 'Guest' });
      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      // Meeting 1
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink1 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode1 = shareLink1!.split('/').pop()!;
      sessionCodes.push(roomCode1);

      // Joiner joins and leaves
      await joinerPage.goto(`/live/${roomCode1}`);
      // P1232: P396 removed the guest email input and the consent checkbox, and
      // "Join Session" now renders only when auto-join FAILS — an unconditional
      // click on either hangs until the test times out. See helpers/live-join.ts.
      await completeLiveJoinIfPrompted(joinerPage);
      try {
        await joinerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
        await joinerPage.getByRole('button', { name: 'Continue' }).click();
      } catch {
        // No terms dialog
      }

      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Guest', 'code', roomCode1);
      await expect(creatorPage.getByRole('button', { name: 'Does Guest understand you?' })).toBeVisible({ timeout: 15000 });

      await joinerPage.getByRole('button', { name: 'Menu' }).click();
      await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();
      await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

      await expect(creatorPage.getByText('Guest has left')).toBeVisible({ timeout: 10000 });

      // Creator starts new session
      await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
      await expect(creatorPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 5000 });

      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink2 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode2 = shareLink2!.split('/').pop()!;
      sessionCodes.push(roomCode2);

      // CRITICAL: Waiting screen should stay stable for at least 3 seconds
      // Bug symptom: It would flip to "has left" immediately due to stale refs
      // In normal (non-event) sessions the heading is "Invite Your Partner" (not "Waiting for partner to join...")
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible();
      await creatorPage.waitForTimeout(3000);
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible();
      await expect(creatorPage.getByText(/has left/)).not.toBeVisible();

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  test('Joiner can join new meeting using code input after previous session ended', async ({ browser }) => {
    // Tests that after session 1 ends, the joiner can use the /live start page code input
    // to join session 2 — verifying that stale state from session 1 doesn't block the join.
    // Auth users: stay at /live after leaving (guests would go to /signup).
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    const sessionCodes: string[] = [];
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      creatorUser = await createTestUser({ name: 'Host' });
      joinerUser = await createTestUser({ name: 'Guest' });
      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      // ========== MEETING 1: join via URL ==========
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink1 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode1 = shareLink1!.split('/').pop()!;
      sessionCodes.push(roomCode1);

      await joinerPage.goto(`/live/${roomCode1}`);
      // P1232: P396 removed the guest email input and the consent checkbox, and
      // "Join Session" now renders only when auto-join FAILS — an unconditional
      // click on either hangs until the test times out. See helpers/live-join.ts.
      await completeLiveJoinIfPrompted(joinerPage);
      try {
        await joinerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
        await joinerPage.getByRole('button', { name: 'Continue' }).click();
      } catch {
        // No terms dialog
      }

      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Guest', 'code', roomCode1);

      await expect(creatorPage.getByRole('button', { name: 'Does Guest understand you?' })).toBeVisible({ timeout: 15000 });
      await expect(joinerPage.getByRole('button', { name: 'Does Host understand you?' })).toBeVisible({ timeout: 15000 });

      // End meeting - joiner leaves
      await joinerPage.getByRole('button', { name: 'Menu' }).click();
      await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();
      await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

      // Auth joiner returns to /live start page (not /signup)
      await expect(joinerPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 10000 });

      await expect(creatorPage.getByText('Guest has left')).toBeVisible({ timeout: 10000 });
      await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
      await expect(creatorPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 5000 });

      // ========== MEETING 2: join via code input on start page ==========
      // Creator creates new meeting
      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink2 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode2 = shareLink2!.split('/').pop()!;
      sessionCodes.push(roomCode2);

      // Joiner is on /live start page — enters the new code using the code input field.
      // For auth users, this calls completeJoin directly (no name/email/consent form).
      await joinerPage.getByPlaceholder('Enter a code or link').fill(roomCode2);
      await joinerPage.getByRole('button', { name: 'Join' }).click();
      // Handle "Updated Terms" dialog on second join with same user
      try {
        await joinerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
        await joinerPage.getByRole('button', { name: 'Continue' }).click();
      } catch {
        // No terms dialog
      }

      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Guest', 'code', roomCode2);

      // CRITICAL: Both should connect using the code-input flow
      await expect(creatorPage.getByRole('button', { name: 'Does Guest understand you?' })).toBeVisible({ timeout: 15000 });
      await expect(joinerPage.getByRole('button', { name: 'Does Host understand you?' })).toBeVisible({ timeout: 15000 });

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });

  test('Multiple rounds of meetings work correctly', async ({ browser }) => {
    // Test 3 consecutive meetings between same users
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    await mockMicPermission(creatorPage);
    await mockMicPermission(joinerPage);

    const sessionCodes: string[] = [];
    let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      creatorUser = await createTestUser({ name: 'Repeated' });
      joinerUser = await createTestUser({ name: 'Partner' });
      await setTestSession(creatorPage, creatorUser.email);
      await setTestSession(joinerPage, joinerUser.email);

      for (let round = 1; round <= 3; round++) {
        if (round === 1) {
          await creatorPage.goto('/live');
          await creatorPage.waitForLoadState('networkidle');
        }

        await creatorPage.getByRole('button', { name: 'New session' }).click();
        await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

        const shareLink = await creatorPage.getByTestId('share-link').textContent();
        const roomCode = shareLink!.split('/').pop()!;
        sessionCodes.push(roomCode);

        await joinerPage.goto(`/live/${roomCode}`);
        // P1232: P396 removed the guest email input and the consent checkbox, and
        // "Join Session" now renders only when auto-join FAILS — an unconditional
        // click on either hangs until the test times out. See helpers/live-join.ts.
        await completeLiveJoinIfPrompted(joinerPage);
        // Handle terms dialog on first round only (subsequent rounds: terms already accepted)
        if (round === 1) {
          try {
            await joinerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
            await joinerPage.getByRole('button', { name: 'Continue' }).click();
          } catch {
            // No terms dialog
          }
        }

        await waitForDBPresence('clarity_sessions', 'joiner_name', 'Partner', 'code', roomCode);

        await expect(creatorPage.getByRole('button', { name: 'Does Partner understand you?' })).toBeVisible({ timeout: 15000 });
        await expect(joinerPage.getByRole('button', { name: 'Does Repeated understand you?' })).toBeVisible({ timeout: 15000 });

        // End meeting (joiner leaves)
        await joinerPage.getByRole('button', { name: 'Menu' }).click();
        await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();
        await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

        await expect(creatorPage.getByText(/Partner has left|has left/)).toBeVisible({ timeout: 10000 });
        await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
        await expect(creatorPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 5000 });
      }

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
      if (creatorUser) await deleteTestUser(creatorUser.user.id);
      if (joinerUser) await deleteTestUser(joinerUser.user.id);
    }
  });
});
