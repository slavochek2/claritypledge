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
import { createTestUser, setTestSession, deleteTestUser, deleteClaritySession } from './helpers/test-user';
import { waitForDBPresence } from './helpers/test-realtime';

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
    // Use persistent contexts to simulate same users across sessions
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    const sessionCodes: string[] = [];
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Creator (Alice) is authenticated — no name/email/consent inputs shown
      testUser = await createTestUser({ name: 'Alice' });
      await setTestSession(creatorPage, testUser.email);

      // ========================================
      // MEETING 1: First successful meeting
      // ========================================

      // Creator starts first meeting
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByRole('button', { name: 'New session' }).click();

      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      const shareLink1 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode1 = shareLink1!.split('/').pop()!;
      sessionCodes.push(roomCode1);

      // Joiner joins first meeting (guest — requires name, email, consent)
      await joinerPage.goto(`/live/${roomCode1}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Bob');
      await joinerPage.getByPlaceholder('your@email.com').fill('bob@test.com');
      const joinerCheckbox1 = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox1.isVisible()) {
        await joinerCheckbox1.check();
      }
      await joinerPage.getByRole('button', { name: 'Join Session' }).click();

      // Wait for DB to confirm joiner wrote their name (Realtime doesn't propagate between isolated contexts)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Bob', 'code', roomCode1);

      // Both should be in live meeting
      await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 5000 });
      await expect(joinerPage.getByText('Alice')).toBeVisible({ timeout: 10000 });
      await expect(creatorPage.getByText('Does Bob understand you?')).toBeVisible();
      await expect(joinerPage.getByText('Does Alice understand you?')).toBeVisible();

      // ========================================
      // END MEETING 1: Joiner leaves
      // ========================================

      await joinerPage.getByRole('button', { name: 'Menu' }).click();
      await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();
      await expect(joinerPage.getByText('Leave session?')).toBeVisible();
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

      // Creator starts second meeting (authenticated — button enabled directly)
      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });
      await expect(creatorPage.getByText('Waiting for partner to join...')).toBeVisible();

      const shareLink2 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode2 = shareLink2!.split('/').pop()!;
      sessionCodes.push(roomCode2);

      // Verify it's a new session
      expect(roomCode2).not.toBe(roomCode1);

      // Joiner joins second meeting (guest — name/email/consent required again)
      await joinerPage.goto(`/live/${roomCode2}`);
      const nameInput2 = joinerPage.getByPlaceholder('Enter your name');
      if (await nameInput2.isVisible()) {
        await nameInput2.fill('Bob');
      }
      await joinerPage.getByPlaceholder('your@email.com').fill('bob@test.com');
      const joinerCheckbox2 = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox2.isVisible()) {
        await joinerCheckbox2.check();
      }
      await joinerPage.getByRole('button', { name: 'Join Session' }).click();

      // ========================================
      // CRITICAL: Both should connect in Meeting 2
      // BUG: Creator stays stuck on "Waiting for Partner"
      // ========================================

      // Wait for DB to confirm joiner wrote their name for Meeting 2 (Realtime doesn't propagate between isolated contexts)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Bob', 'code', roomCode2);

      await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 5000 });
      await expect(joinerPage.getByText('Alice')).toBeVisible({ timeout: 10000 });

      // Both should see live meeting buttons
      await expect(creatorPage.getByText('Does Bob understand you?')).toBeVisible();
      await expect(joinerPage.getByText('Does Alice understand you?')).toBeVisible();

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
      if (testUser) {
        await deleteTestUser(testUser.user.id);
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
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Creator (Host) is authenticated — no name/email/consent inputs shown
      testUser = await createTestUser({ name: 'Host' });
      await setTestSession(creatorPage, testUser.email);

      // Meeting 1
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByRole('button', { name: 'New session' }).click();

      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });
      const shareLink1 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode1 = shareLink1!.split('/').pop()!;
      sessionCodes.push(roomCode1);

      // Joiner joins and leaves (guest — requires name, email, consent)
      await joinerPage.goto(`/live/${roomCode1}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Guest');
      await joinerPage.getByPlaceholder('your@email.com').fill('guest@test.com');
      const joinerCheckbox1 = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox1.isVisible()) {
        await joinerCheckbox1.check();
      }
      await joinerPage.getByRole('button', { name: 'Join Session' }).click();

      // Wait for DB to confirm joiner wrote their name (Realtime doesn't propagate between isolated contexts)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Guest', 'code', roomCode1);

      await expect(creatorPage.getByText('Guest')).toBeVisible({ timeout: 5000 });

      await joinerPage.getByRole('button', { name: 'Menu' }).click();
      await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();
      await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

      await expect(creatorPage.getByText('Guest has left')).toBeVisible({ timeout: 10000 });

      // Creator starts new session
      await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
      await expect(creatorPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 5000 });

      await creatorPage.getByRole('button', { name: 'New session' }).click();
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
      if (testUser) {
        await deleteTestUser(testUser.user.id);
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
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Creator (Host) is authenticated — no name/email/consent inputs shown
      testUser = await createTestUser({ name: 'Host' });
      await setTestSession(creatorPage, testUser.email);

      // ========== MEETING 1 ==========
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByRole('button', { name: 'New session' }).click();

      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });
      const shareLink1 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode1 = shareLink1!.split('/').pop()!;
      sessionCodes.push(roomCode1);

      // Joiner navigates to /live and enters code manually (guest — requires name, email, consent)
      await joinerPage.goto('/live');
      await joinerPage.waitForLoadState('networkidle');
      await joinerPage.getByPlaceholder('Enter your name').fill('Guest');
      await joinerPage.getByPlaceholder('your@email.com').fill('guest@test.com');
      const joinerCheckbox1 = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox1.isVisible()) {
        await joinerCheckbox1.check();
      }
      await joinerPage.getByPlaceholder('Enter a code or link').fill(roomCode1);
      await joinerPage.getByRole('button', { name: 'Join' }).click();

      // Wait for DB to confirm joiner wrote their name (Realtime doesn't propagate between isolated contexts)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Guest', 'code', roomCode1);

      // Both connected
      await expect(creatorPage.getByText('Does Guest understand you?')).toBeVisible({ timeout: 5000 });
      await expect(joinerPage.getByText('Does Host understand you?')).toBeVisible({ timeout: 10000 });

      // End meeting - joiner leaves
      await joinerPage.getByRole('button', { name: 'Menu' }).click();
      await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();
      await joinerPage.getByRole('button', { name: 'Leave' }).last().click();

      // Joiner is back at start screen (same tab, just navigated back)
      await expect(joinerPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 10000 });

      // Creator sees partner left
      await expect(creatorPage.getByText('Guest has left')).toBeVisible({ timeout: 10000 });
      await creatorPage.getByRole('button', { name: 'Start New Session' }).click();
      await expect(creatorPage.getByText('Practice Clarity Together')).toBeVisible({ timeout: 5000 });

      // ========== MEETING 2 - SAME TABS ==========
      // Creator creates new meeting
      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

      const shareLink2 = await creatorPage.getByTestId('share-link').textContent();
      const roomCode2 = shareLink2!.split('/').pop()!;
      sessionCodes.push(roomCode2);

      // Joiner enters NEW code manually (same tab, no full page reload)
      // This is the key - joiner's tab has React state from previous session
      // Guest inputs (name/email/consent) may be prefilled from earlier in the session
      const nameInput2 = joinerPage.getByPlaceholder('Enter your name');
      if (await nameInput2.isVisible()) {
        await nameInput2.fill('Guest');
      }
      const emailInput2 = joinerPage.getByPlaceholder('your@email.com');
      if (await emailInput2.isVisible()) {
        await emailInput2.fill('guest@test.com');
      }
      const joinerCheckbox2 = joinerPage.getByRole('checkbox');
      if (await joinerCheckbox2.isVisible() && !(await joinerCheckbox2.isChecked())) {
        await joinerCheckbox2.check();
      }
      await joinerPage.getByPlaceholder('Enter a code or link').fill(roomCode2);
      await joinerPage.getByRole('button', { name: 'Join' }).click();

      // Wait for DB to confirm joiner wrote their name for Meeting 2 (Realtime doesn't propagate between isolated contexts)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Guest', 'code', roomCode2);

      // CRITICAL: Both should connect
      await expect(creatorPage.getByText('Does Guest understand you?')).toBeVisible({ timeout: 5000 });
      await expect(joinerPage.getByText('Does Host understand you?')).toBeVisible({ timeout: 10000 });

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      for (const code of sessionCodes) {
        await deleteClaritySession(code);
      }
      if (testUser) {
        await deleteTestUser(testUser.user.id);
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
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Creator (Repeated) is authenticated — no name/email/consent inputs shown
      testUser = await createTestUser({ name: 'Repeated' });
      await setTestSession(creatorPage, testUser.email);

      for (let round = 1; round <= 3; round++) {
        // First round: navigate to /live (setTestSession already navigated to /)
        if (round === 1) {
          await creatorPage.goto('/live');
          await creatorPage.waitForLoadState('networkidle');
        }

        await creatorPage.getByRole('button', { name: 'New session' }).click();
        await expect(creatorPage.getByText('Share this link with your partner')).toBeVisible({ timeout: 10000 });

        const shareLink = await creatorPage.getByTestId('share-link').textContent();
        const roomCode = shareLink!.split('/').pop()!;
        sessionCodes.push(roomCode);

        // Joiner joins (guest — name, email, consent required each time via fresh navigation)
        await joinerPage.goto(`/live/${roomCode}`);
        const nameInput = joinerPage.getByPlaceholder('Enter your name');
        if (await nameInput.isVisible()) {
          await nameInput.fill('Partner');
        }
        await joinerPage.getByPlaceholder('your@email.com').fill('partner@test.com');
        const joinerCheckbox = joinerPage.getByRole('checkbox');
        if (await joinerCheckbox.isVisible()) {
          await joinerCheckbox.check();
        }
        await joinerPage.getByRole('button', { name: 'Join Session' }).click();

        // Wait for DB to confirm joiner wrote their name (Realtime doesn't propagate between isolated contexts)
        await waitForDBPresence('clarity_sessions', 'joiner_name', 'Partner', 'code', roomCode);

        // Should connect - look for the live meeting view with partner's name in banner
        // Use exact match to avoid matching "Waiting for Partner" banner
        await expect(creatorPage.getByText('Does Partner understand you?')).toBeVisible({ timeout: 5000 });
        await expect(joinerPage.getByText('Does Repeated understand you?')).toBeVisible({ timeout: 10000 });

        // End meeting (joiner leaves)
        await joinerPage.getByRole('button', { name: 'Menu' }).click();
        await joinerPage.getByRole('menuitem', { name: 'Leave Session' }).click();
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
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
    }
  });
});
