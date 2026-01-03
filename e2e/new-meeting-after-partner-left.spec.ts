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
 */
import { test, expect } from '@playwright/test';
import { deleteClaritySession } from './helpers/test-user';

test.describe('New Meeting After Session Ends', () => {
  /**
   * This is the exact bug scenario:
   * - Same two users (creator + joiner) have a meeting
   * - Meeting ends
   * - They try to have ANOTHER meeting
   * - Bug: Creator stuck on "Waiting for Partner" even though joiner joined
   */
  test('Same two users can connect in a second meeting after first session ends', async ({ browser }) => {
    // Use persistent contexts to simulate same users across sessions
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    const sessionCodes: string[] = [];

    try {
      // ========================================
      // MEETING 1: First successful meeting
      // ========================================

      // Creator starts first meeting
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByPlaceholder('Enter your name').fill('Alice');
      await creatorPage.getByRole('button', { name: 'New meeting' }).click();

      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      const shareLink1 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode1 = shareLink1!.split('/').pop()!;
      sessionCodes.push(roomCode1);

      // Joiner joins first meeting
      await joinerPage.goto(`/live/${roomCode1}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Bob');
      await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

      // Both should be in live meeting
      await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 10000 });
      await expect(joinerPage.getByText('Alice')).toBeVisible({ timeout: 10000 });
      await expect(creatorPage.getByText('Did you understand me?')).toBeVisible();
      await expect(joinerPage.getByText('Did you understand me?')).toBeVisible();

      // ========================================
      // END MEETING 1: Joiner leaves
      // ========================================

      await joinerPage.getByRole('button', { name: 'Menu' }).click();
      await joinerPage.getByRole('menuitem', { name: 'Leave Meeting' }).click();
      await expect(joinerPage.getByText('Leave meeting?')).toBeVisible();
      await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

      // Joiner back at start
      await expect(joinerPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 10000 });

      // Creator sees partner left
      await expect(creatorPage.getByText('Bob has left')).toBeVisible({ timeout: 10000 });

      // Creator clicks Start New Session
      await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
      await expect(creatorPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 5000 });

      // ========================================
      // MEETING 2: Second meeting - THIS IS WHERE THE BUG OCCURS
      // ========================================

      // Creator starts second meeting (name should be prefilled)
      await creatorPage.getByRole('button', { name: 'New meeting' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });
      await expect(creatorPage.getByText('Waiting for partner to join...')).toBeVisible();

      const shareLink2 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode2 = shareLink2!.split('/').pop()!;
      sessionCodes.push(roomCode2);

      // Verify it's a new session
      expect(roomCode2).not.toBe(roomCode1);

      // Joiner joins second meeting (name should be prefilled from before)
      await joinerPage.goto(`/live/${roomCode2}`);
      // Name might be prefilled or need to re-enter
      const nameInput = joinerPage.getByPlaceholder('Enter your name');
      if (await nameInput.isVisible()) {
        await nameInput.fill('Bob');
      }
      await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

      // ========================================
      // CRITICAL: Both should connect in Meeting 2
      // BUG: Creator stays stuck on "Waiting for Partner"
      // ========================================

      await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 15000 });
      await expect(joinerPage.getByText('Alice')).toBeVisible({ timeout: 10000 });

      // Both should see live meeting buttons
      await expect(creatorPage.getByText('Did you understand me?')).toBeVisible();
      await expect(joinerPage.getByText('Did you understand me?')).toBeVisible();

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
    }
  });

  test('Creator waiting screen stays stable after previous session ended', async ({ browser }) => {
    // This tests that the waiting screen doesn't flip to "partner left" immediately
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    const sessionCodes: string[] = [];

    try {
      // Meeting 1
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByPlaceholder('Enter your name').fill('Host');
      await creatorPage.getByRole('button', { name: 'New meeting' }).click();

      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });
      const shareLink1 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode1 = shareLink1!.split('/').pop()!;
      sessionCodes.push(roomCode1);

      // Joiner joins and leaves
      await joinerPage.goto(`/live/${roomCode1}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Guest');
      await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();
      await expect(creatorPage.getByText('Guest')).toBeVisible({ timeout: 10000 });

      await joinerPage.getByRole('button', { name: 'Menu' }).click();
      await joinerPage.getByRole('menuitem', { name: 'Leave Meeting' }).click();
      await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

      await expect(creatorPage.getByText('Guest has left')).toBeVisible({ timeout: 10000 });

      // Creator starts new session
      await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
      await expect(creatorPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 5000 });

      await creatorPage.getByRole('button', { name: 'New meeting' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      const shareLink2 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode2 = shareLink2!.split('/').pop()!;
      sessionCodes.push(roomCode2);

      // CRITICAL: Waiting screen should stay stable for at least 5 seconds
      // Bug symptom: It would flip to "has left" immediately due to stale refs
      await expect(creatorPage.getByText('Waiting for partner to join...')).toBeVisible();
      await creatorPage.waitForTimeout(3000);
      await expect(creatorPage.getByText('Waiting for partner to join...')).toBeVisible();
      await expect(creatorPage.getByText(/has left/)).not.toBeVisible();

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
    }
  });

  test('Joiner can join new meeting using code input after previous session ended', async ({ browser }) => {
    // This tests the scenario where:
    // - Joiner stays on the /live page (doesn't navigate away)
    // - After session ends, joiner enters NEW room code manually
    // - Bug: Joiner might be stuck due to stale state from previous session
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    const sessionCodes: string[] = [];

    try {
      // ========== MEETING 1 ==========
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByPlaceholder('Enter your name').fill('Host');
      await creatorPage.getByRole('button', { name: 'New meeting' }).click();

      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });
      const shareLink1 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode1 = shareLink1!.split('/').pop()!;
      sessionCodes.push(roomCode1);

      // Joiner navigates to /live and enters code manually
      await joinerPage.goto('/live');
      await joinerPage.waitForLoadState('networkidle');
      await joinerPage.getByPlaceholder('Enter your name').fill('Guest');
      await joinerPage.getByPlaceholder('Enter a code or link').fill(roomCode1);
      await joinerPage.getByRole('button', { name: 'Join' }).click();

      // Both connected
      await expect(creatorPage.getByText('Did you understand me?')).toBeVisible({ timeout: 10000 });
      await expect(joinerPage.getByText('Did you understand me?')).toBeVisible({ timeout: 10000 });

      // End meeting - joiner leaves
      await joinerPage.getByRole('button', { name: 'Menu' }).click();
      await joinerPage.getByRole('menuitem', { name: 'Leave Meeting' }).click();
      await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

      // Joiner is back at start screen (same tab, just navigated back)
      await expect(joinerPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 10000 });

      // Creator sees partner left
      await expect(creatorPage.getByText('Guest has left')).toBeVisible({ timeout: 10000 });
      await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
      await expect(creatorPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 5000 });

      // ========== MEETING 2 - SAME TABS ==========
      // Creator creates new meeting
      await creatorPage.getByRole('button', { name: 'New meeting' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      const shareLink2 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode2 = shareLink2!.split('/').pop()!;
      sessionCodes.push(roomCode2);

      // Joiner enters NEW code manually (same tab, no full page reload)
      // This is the key - joiner's tab has React state from previous session
      await joinerPage.getByPlaceholder('Enter a code or link').fill(roomCode2);
      await joinerPage.getByRole('button', { name: 'Join' }).click();

      // CRITICAL: Both should connect
      await expect(creatorPage.getByText('Did you understand me?')).toBeVisible({ timeout: 15000 });
      await expect(joinerPage.getByText('Did you understand me?')).toBeVisible({ timeout: 10000 });

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
    }
  });

  test('Multiple rounds of meetings work correctly', async ({ browser }) => {
    // Test 3 consecutive meetings between same users
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    const sessionCodes: string[] = [];

    try {
      for (let round = 1; round <= 3; round++) {
        // Creator starts meeting
        if (round === 1) {
          await creatorPage.goto('/live');
          await creatorPage.waitForLoadState('networkidle');
          await creatorPage.getByPlaceholder('Enter your name').fill('Repeated');
        }

        await creatorPage.getByRole('button', { name: 'New meeting' }).click();
        await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

        const shareLink = await creatorPage.getByTestId('share-link').textContent();
        const roomCode = shareLink!.split('/').pop()!;
        sessionCodes.push(roomCode);

        // Joiner joins
        await joinerPage.goto(`/live/${roomCode}`);
        const nameInput = joinerPage.getByPlaceholder('Enter your name');
        if (await nameInput.isVisible()) {
          await nameInput.fill('Partner');
        }
        await joinerPage.getByRole('button', { name: 'Join Meeting' }).click();

        // Should connect - look for the live meeting view with partner's name in banner
        // Use exact match to avoid matching "Waiting for Partner" banner
        await expect(creatorPage.getByText('Did you understand me?')).toBeVisible({ timeout: 15000 });
        await expect(joinerPage.getByText('Did you understand me?')).toBeVisible({ timeout: 10000 });

        // End meeting (joiner leaves)
        await joinerPage.getByRole('button', { name: 'Menu' }).click();
        await joinerPage.getByRole('menuitem', { name: 'Leave Meeting' }).click();
        await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

        await expect(creatorPage.getByText(/Partner has left|has left/)).toBeVisible({ timeout: 10000 });
        await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
        await expect(creatorPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 5000 });
      }

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
    }
  });
});
