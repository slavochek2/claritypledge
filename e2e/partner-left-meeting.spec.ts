/**
 * E2E tests for Partner Left Meeting Notification (P25 enhancement)
 *
 * Tests the flow where one user leaves a meeting and the other user
 * sees the "Partner Left" or "Session Ended" screen.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser, deleteClaritySession } from './helpers/test-user';
import { waitForDBPresence, mockMicPermission } from './helpers/test-realtime';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

test.describe('Partner Left Meeting Notification', () => {
  test.describe.configure({ timeout: 120000 });

  test.describe('Joiner leaves - Creator sees notification', () => {
    test('Creator sees "Partner has left" screen when joiner leaves', async ({ browser }) => {
      // Create two browser contexts to simulate two users
      const creatorContext = await browser.newContext();
      const joinerContext = await browser.newContext();

      const creatorPage = await creatorContext.newPage();
      const joinerPage = await joinerContext.newPage();

      // Mock mic on both contexts so the app's mic check doesn't block the join
      await mockMicPermission(creatorPage);
      await mockMicPermission(joinerPage);

      // Track session and users for cleanup
      let roomCode: string | null = null;
      let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
      let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

      try {
        // Both users authenticated — avoids guest form-filling and signInAnonymously failures
        creatorUser = await createTestUser({ name: 'Alice' });
        joinerUser = await createTestUser({ name: 'Bob' });
        await setTestSession(creatorPage, creatorUser.email);
        await setTestSession(joinerPage, joinerUser.email);

        // Step 1: Creator starts a meeting
        await creatorPage.goto('/live');
        await creatorPage.waitForLoadState('networkidle');
        await creatorPage.getByRole('button', { name: 'New session' }).click();

        // Wait for the waiting room with share link
        await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

        // Get the room code from the share link
        const shareLink = await creatorPage.getByTestId('share-link').textContent();
        expect(shareLink).toBeTruthy();

        // Extract the room code (last 6 characters of the link)
        roomCode = shareLink!.split('/').pop()!;
        expect(roomCode).toHaveLength(6);

        // Step 2: Joiner joins the meeting
        await joinerPage.goto(`/live/${roomCode}`);
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

        // Wait for DB to confirm joiner wrote their name (Realtime doesn't propagate between isolated contexts)
        await waitForDBPresence('clarity_sessions', 'joiner_name', 'Bob', 'code', roomCode);

        // Wait for both users to be in live view
        await expect(creatorPage.getByRole('button', { name: 'Does Bob understand you?' })).toBeVisible({ timeout: 15000 });
        await expect(joinerPage.getByRole('button', { name: 'Does Alice understand you?' })).toBeVisible({ timeout: 15000 });

        // Step 3: Joiner clicks "Leave" button via menu
        await joinerPage.getByRole('button', { name: 'Menu' }).click();
        await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();

        // Confirm the exit
        await expect(joinerPage.getByText('Leave session?')).toBeVisible();
        await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

        // Joiner should be back at start screen with clean URL
        await expect(joinerPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 10000 });
        await expect(joinerPage).toHaveURL('/live');

        // Step 4: Creator should see "Partner has left" screen
        await expect(creatorPage.getByText('Bob has left')).toBeVisible({ timeout: 10000 });
        await expect(creatorPage.getByText('The clarity check session has ended.')).toBeVisible();
        await expect(creatorPage.getByRole('button', { name: 'Start New Session' })).toBeVisible();

        // Step 5: Creator clicks "Start New Session"
        await creatorPage.getByRole('button', { name: 'Start New Session' }).click();

        // Creator should be back at start screen with clean URL
        await expect(creatorPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 5000 });
        await expect(creatorPage).toHaveURL('/live');
      } finally {
        await creatorContext.close();
        await joinerContext.close();
        // Clean up the session from Supabase
        if (roomCode) {
          await deleteClaritySession(roomCode);
        }
        if (creatorUser) {
          await deleteTestUser(creatorUser.user.id);
        }
        if (joinerUser) {
          await deleteTestUser(joinerUser.user.id);
        }
      }
    });
  });

  test.describe('Creator leaves - Joiner sees notification', () => {
    test('Joiner sees "Session ended" screen when creator leaves', async ({ browser }) => {
      // Create two browser contexts to simulate two users
      const creatorContext = await browser.newContext();
      const joinerContext = await browser.newContext();

      const creatorPage = await creatorContext.newPage();
      const joinerPage = await joinerContext.newPage();

      // Mock mic on both contexts so the app's mic check doesn't block the join
      await mockMicPermission(creatorPage);
      await mockMicPermission(joinerPage);

      // Track session and users for cleanup
      let roomCode: string | null = null;
      let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
      let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

      try {
        // Both users authenticated — avoids guest form-filling and signInAnonymously failures
        creatorUser = await createTestUser({ name: 'Charlie' });
        joinerUser = await createTestUser({ name: 'Diana' });
        await setTestSession(creatorPage, creatorUser.email);
        await setTestSession(joinerPage, joinerUser.email);

        // Step 1: Creator starts a meeting
        await creatorPage.goto('/live');
        await creatorPage.waitForLoadState('networkidle');
        await creatorPage.getByRole('button', { name: 'New session' }).click();

        // Wait for the waiting room with share link
        await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

        // Get the room code from the share link
        const shareLink = await creatorPage.getByTestId('share-link').textContent();
        expect(shareLink).toBeTruthy();

        // Extract the room code
        roomCode = shareLink!.split('/').pop()!;
        expect(roomCode).toHaveLength(6);

        // Step 2: Joiner joins the meeting
        await joinerPage.goto(`/live/${roomCode}`);
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

        // Wait for DB to confirm joiner wrote their name (Realtime doesn't propagate between isolated contexts)
        await waitForDBPresence('clarity_sessions', 'joiner_name', 'Diana', 'code', roomCode);

        // Wait for both users to be in live view
        await expect(creatorPage.getByRole('button', { name: 'Does Diana understand you?' })).toBeVisible({ timeout: 15000 });
        await expect(joinerPage.getByRole('button', { name: 'Does Charlie understand you?' })).toBeVisible({ timeout: 15000 });

        // Step 3: Creator clicks "Leave" button via menu
        await creatorPage.getByRole('button', { name: 'Menu' }).click();
        await creatorPage.getByRole('menuitem', { name: 'Leave Session' }).click();

        // Confirm the exit
        await expect(creatorPage.getByText('Leave session?')).toBeVisible();
        await creatorPage.getByRole('button', { name: 'Leave' }).last().click();

        // Creator should be back at start screen with clean URL
        await expect(creatorPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 10000 });
        await expect(creatorPage).toHaveURL('/live');

        // Step 4: Joiner should see "Session ended" screen
        await expect(joinerPage.getByText('Session ended')).toBeVisible({ timeout: 10000 });
        await expect(joinerPage.getByText(/Charlie.*ended the clarity check session/)).toBeVisible();
        await expect(joinerPage.getByRole('button', { name: 'Start New Session' })).toBeVisible();

        // Step 5: Joiner clicks "Start New Session"
        await joinerPage.getByRole('button', { name: 'Start New Session' }).click();

        // Joiner should be back at start screen with clean URL
        await expect(joinerPage.getByRole('button', { name: 'New session' })).toBeVisible({ timeout: 5000 });
        await expect(joinerPage).toHaveURL('/live');
      } finally {
        await creatorContext.close();
        await joinerContext.close();
        // Clean up the session from Supabase
        if (roomCode) {
          await deleteClaritySession(roomCode);
        }
        if (creatorUser) {
          await deleteTestUser(creatorUser.user.id);
        }
        if (joinerUser) {
          await deleteTestUser(joinerUser.user.id);
        }
      }
    });
  });

  test.describe('Banner shows correct state', () => {
    test('Banner shows "Meeting Ended" when partner leaves', async ({ browser }) => {
      const creatorContext = await browser.newContext();
      const joinerContext = await browser.newContext();

      const creatorPage = await creatorContext.newPage();
      const joinerPage = await joinerContext.newPage();

      // Mock mic on both contexts so the app's mic check doesn't block the join
      await mockMicPermission(creatorPage);
      await mockMicPermission(joinerPage);

      // Track session and users for cleanup
      let roomCode: string | null = null;
      let creatorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
      let joinerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

      try {
        // Both users authenticated — avoids guest form-filling and signInAnonymously failures
        creatorUser = await createTestUser({ name: 'Eve' });
        joinerUser = await createTestUser({ name: 'Frank' });
        await setTestSession(creatorPage, creatorUser.email);
        await setTestSession(joinerPage, joinerUser.email);

        // Setup: Creator starts meeting
        await creatorPage.goto('/live');
        await creatorPage.waitForLoadState('networkidle');
        await creatorPage.getByRole('button', { name: 'New session' }).click();
        await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

        const shareLink = await creatorPage.getByTestId('share-link').textContent();
        roomCode = shareLink!.split('/').pop()!;

        await joinerPage.goto(`/live/${roomCode}`);
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

        // Wait for DB to confirm joiner wrote their name (Realtime doesn't propagate between isolated contexts)
        await waitForDBPresence('clarity_sessions', 'joiner_name', 'Frank', 'code', roomCode);

        await expect(creatorPage.getByRole('button', { name: 'Does Frank understand you?' })).toBeVisible({ timeout: 15000 });

        // Joiner leaves via menu
        await joinerPage.getByRole('button', { name: 'Menu' }).click();
        await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();
        await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

        // Creator should see "Partner has left" screen — joiner leaving shows "{name} has left"
        await expect(creatorPage.getByText('Frank has left')).toBeVisible({ timeout: 10000 });
      } finally {
        await creatorContext.close();
        await joinerContext.close();
        // Clean up the session from Supabase
        if (roomCode) {
          await deleteClaritySession(roomCode);
        }
        if (creatorUser) {
          await deleteTestUser(creatorUser.user.id);
        }
        if (joinerUser) {
          await deleteTestUser(joinerUser.user.id);
        }
      }
    });
  });
});
