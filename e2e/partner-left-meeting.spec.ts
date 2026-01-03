/**
 * E2E tests for Partner Left Meeting Notification (P25 enhancement)
 *
 * Tests the flow where one user leaves a meeting and the other user
 * sees the "Partner Left" or "Session Ended" screen.
 */
import { test, expect } from '@playwright/test';
import { deleteClaritySession } from './helpers/test-user';

test.describe('Partner Left Meeting Notification', () => {
  test.describe('Joiner leaves - Creator sees notification', () => {
    test('Creator sees "Partner has left" screen when joiner leaves', async ({ browser }) => {
      // Create two browser contexts to simulate two users
      const creatorContext = await browser.newContext();
      const joinerContext = await browser.newContext();

      const creatorPage = await creatorContext.newPage();
      const joinerPage = await joinerContext.newPage();

      // Capture console errors
      const errors: string[] = [];
      creatorPage.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      creatorPage.on('pageerror', err => {
        errors.push(err.message);
      });

      // Track session for cleanup
      let roomCode: string | null = null;

      try {
        // Step 1: Creator starts a meeting
        await creatorPage.goto('/live');

        // Wait for page to load
        await creatorPage.waitForLoadState('networkidle');

        // Check if there's an error
        const errorVisible = await creatorPage.getByText('Something went wrong').isVisible().catch(() => false);
        if (errorVisible) {
          console.log('Page errors:', errors);
          throw new Error(`Page showed error: ${errors.join(', ')}`);
        }

        await creatorPage.getByPlaceholder('Enter your name').fill('Alice');
        await creatorPage.getByRole('button', { name: 'New meeting' }).click();

        // Wait for the waiting room with share link
        await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

        // Get the room code from the share link
        const shareLink = await creatorPage.getByTestId('share-link').textContent();
        expect(shareLink).toBeTruthy();

        // Extract the room code (last 6 characters of the link)
        roomCode = shareLink!.split('/').pop()!;
        expect(roomCode).toHaveLength(6);

        // Step 2: Joiner joins the meeting
        await joinerPage.goto(`/live/${roomCode}`);
        await joinerPage.getByPlaceholder('Enter your name').fill('Bob');
        await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

        // Wait for both users to be in live view
        await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 10000 });
        await expect(joinerPage.getByText('Alice')).toBeVisible({ timeout: 10000 });

        // Both should see the idle state buttons (the live meeting view)
        await expect(creatorPage.getByText('Did you understand me?')).toBeVisible();
        await expect(joinerPage.getByText('Did you understand me?')).toBeVisible();

        // Step 3: Joiner clicks "Leave" button via menu
        await joinerPage.getByRole('button', { name: 'Menu' }).click();
        await joinerPage.getByRole('menuitem', { name: 'Leave Meeting' }).click();

        // Confirm the exit
        await expect(joinerPage.getByText('Leave meeting?')).toBeVisible();
        await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

        // Joiner should be back at start screen with clean URL
        await expect(joinerPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 10000 });
        await expect(joinerPage).toHaveURL('/live');

        // Step 4: Creator should see "Partner has left" screen
        await expect(creatorPage.getByText('Bob has left')).toBeVisible({ timeout: 10000 });
        await expect(creatorPage.getByText('The clarity check session has ended.')).toBeVisible();
        await expect(creatorPage.getByRole('button', { name: 'Start New Session' })).toBeVisible();

        // Step 5: Creator clicks "Start New Session"
        await creatorPage.getByRole('button', { name: 'Start New Session' }).click();

        // Creator should be back at start screen with clean URL
        await expect(creatorPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 5000 });
        await expect(creatorPage).toHaveURL('/live');
      } finally {
        await creatorContext.close();
        await joinerContext.close();
        // Clean up the session from Supabase
        if (roomCode) {
          await deleteClaritySession(roomCode);
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

      // Track session for cleanup
      let roomCode: string | null = null;

      try {
        // Step 1: Creator starts a meeting
        await creatorPage.goto('/live');
        await creatorPage.getByPlaceholder('Enter your name').fill('Charlie');
        await creatorPage.getByRole('button', { name: 'New meeting' }).click();

        // Wait for the waiting room with share link
        await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

        // Get the room code from the share link
        const shareLink = await creatorPage.getByTestId('share-link').textContent();
        expect(shareLink).toBeTruthy();

        // Extract the room code
        roomCode = shareLink!.split('/').pop()!;
        expect(roomCode).toHaveLength(6);

        // Step 2: Joiner joins the meeting
        await joinerPage.goto(`/live/${roomCode}`);
        await joinerPage.getByPlaceholder('Enter your name').fill('Diana');
        await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

        // Wait for both users to be in live view
        await expect(creatorPage.getByText('Diana')).toBeVisible({ timeout: 10000 });
        await expect(joinerPage.getByText('Charlie')).toBeVisible({ timeout: 10000 });

        // Both should see the idle state buttons (the live meeting view)
        await expect(creatorPage.getByText('Did you understand me?')).toBeVisible();
        await expect(joinerPage.getByText('Did you understand me?')).toBeVisible();

        // Step 3: Creator clicks "Leave" button via menu
        await creatorPage.getByRole('button', { name: 'Menu' }).click();
        await creatorPage.getByRole('menuitem', { name: 'Leave Meeting' }).click();

        // Confirm the exit
        await expect(creatorPage.getByText('Leave meeting?')).toBeVisible();
        await creatorPage.getByRole('button', { name: 'Leave' }).last().click();

        // Creator should be back at start screen with clean URL
        await expect(creatorPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 10000 });
        await expect(creatorPage).toHaveURL('/live');

        // Step 4: Joiner should see "Session ended" screen
        await expect(joinerPage.getByText('Session ended')).toBeVisible({ timeout: 10000 });
        await expect(joinerPage.getByText(/Charlie.*ended the clarity check session/)).toBeVisible();
        await expect(joinerPage.getByRole('button', { name: 'Start New Session' })).toBeVisible();

        // Step 5: Joiner clicks "Start New Session"
        await joinerPage.getByRole('button', { name: 'Start New Session' }).click();

        // Joiner should be back at start screen with clean URL
        await expect(joinerPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 5000 });
        await expect(joinerPage).toHaveURL('/live');
      } finally {
        await creatorContext.close();
        await joinerContext.close();
        // Clean up the session from Supabase
        if (roomCode) {
          await deleteClaritySession(roomCode);
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

      // Track session for cleanup
      let roomCode: string | null = null;

      try {
        // Setup: Creator starts meeting
        await creatorPage.goto('/live');
        await creatorPage.getByPlaceholder('Enter your name').fill('Eve');
        await creatorPage.getByRole('button', { name: 'New meeting' }).click();
        await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

        const shareLink = await creatorPage.getByTestId('share-link').textContent();
        roomCode = shareLink!.split('/').pop()!;

        // Joiner joins
        await joinerPage.goto(`/live/${roomCode}`);
        await joinerPage.getByPlaceholder('Enter your name').fill('Frank');
        await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

        await expect(creatorPage.getByText('Frank')).toBeVisible({ timeout: 10000 });

        // Joiner leaves via menu
        await joinerPage.getByRole('button', { name: 'Menu' }).click();
        await joinerPage.getByRole('menuitem', { name: 'Leave Meeting' }).click();
        await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

        // Creator should see "Meeting Ended" banner
        await expect(creatorPage.getByText('Meeting Ended')).toBeVisible({ timeout: 10000 });
      } finally {
        await creatorContext.close();
        await joinerContext.close();
        // Clean up the session from Supabase
        if (roomCode) {
          await deleteClaritySession(roomCode);
        }
      }
    });
  });
});
