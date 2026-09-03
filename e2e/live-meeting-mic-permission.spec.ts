/**
 * @file live-meeting-mic-permission.spec.ts
 * @description Tests for mic permission gating in Clarity Live meetings
 *
 * BUG FIXED: Joiner could appear "joined" to creator even when joiner denied
 * microphone permission. This happened because joinClaritySession() was called
 * BEFORE the mic permission check.
 *
 * FIX: Mic permission is now checked BEFORE writing joiner_name to database.
 * This ensures joiner only appears "joined" when they're actually ready.
 */
import { test, expect, Page } from '@playwright/test';
import { waitForDBPresence } from './helpers/test-realtime';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';

test.describe('Mic Permission Gating', () => {
  test.describe.configure({ timeout: 60000 });

  /**
   * Helper to create a meeting and return the session code.
   * Creator must be authenticated before calling this function —
   * authenticated creators have no name/email/consent inputs.
   */
  async function createMeeting(page: Page): Promise<string> {
    await page.goto('/live');

    // Click new meeting (no form inputs — authenticated creator)
    await page.getByRole('button', { name: /new session/i }).click();

    // Wait for waiting screen with session code
    // Normal sessions show "Invite Your Partner" (not "Waiting for partner to join..." which is event-only)
    await expect(page.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

    // Extract the session code from the share link span (data-testid="share-link")
    // The span contains text like "localhost:5100/live/XCD47A"
    const shareLink = page.locator('[data-testid="share-link"]');
    await expect(shareLink).toBeVisible();
    const linkText = await shareLink.textContent();

    if (linkText) {
      const linkMatch = linkText.match(/\/live\/([A-Z0-9]+)/i);
      if (linkMatch) {
        console.log(`[Test] Found session code ${linkMatch[1]} from share link`);
        return linkMatch[1];
      }
    }

    throw new Error('Could not find session code');
  }

  /**
   * TDD Test: Joiner who denies mic should NOT appear joined to creator.
   *
   * This test captures the bug where:
   * 1. Joiner clicks "Join" -> joinClaritySession() writes joiner_name to DB
   * 2. Mic permission denied -> joiner stuck at dialog
   * 3. Creator sees joiner_name set -> transitions to live view
   * 4. But joiner isn't actually in the meeting!
   *
   * Expected behavior after fix:
   * - Mic check happens BEFORE joinClaritySession()
   * - If denied, joiner_name never gets set
   * - Creator continues to see "Waiting for partner"
   */
  test('joiner who denies mic should NOT appear joined to creator', async ({ browser }) => {
    // Create two browser contexts
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    // Mock getUserMedia on creator's page to always succeed (simulate mic granted)
    // This runs before any page load to intercept the getUserMedia call
    await creatorPage.addInitScript(() => {
      // Create a mock MediaStream with a fake audio track
      const mockAudioTrack = {
        kind: 'audio',
        stop: () => {},
        enabled: true,
      };
      const mockStream = {
        getTracks: () => [mockAudioTrack],
        getAudioTracks: () => [mockAudioTrack],
      };

      // Override getUserMedia to return the mock stream
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    });

    // Explicitly mock joiner's getUserMedia to REJECT — Playwright doesn't deny it naturally
    await joinerPage.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      };
    });

    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Step 0: Create and authenticate creator
      testUser = await createTestUser({ name: 'Creator' });
      await setTestSession(creatorPage, testUser.email);

      // Step 1: Creator creates meeting
      const sessionCode = await createMeeting(creatorPage);
      console.log(`[Test] Created meeting with code: ${sessionCode}`);

      // Creator should be on waiting screen
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible();

      // Step 2: Joiner navigates to join link
      await joinerPage.goto(`/live/${sessionCode}`);

      // Fill joiner info
      const joinerNameInput = joinerPage.locator('input[placeholder="Enter your name"]');
      await expect(joinerNameInput).toBeVisible({ timeout: 5000 });
      await joinerNameInput.fill('Joiner');

      // P1232: the guest email input and consent checkbox were removed by P396;
      // filling them auto-waited until the test timed out. The /join/i click below
      // still matches the surviving "Join as Guest" button.

      // Step 3: Joiner clicks Join - mic permission will be denied
      console.log('[Test] Joiner clicking Join button...');
      await joinerPage.getByRole('button', { name: /join/i }).click();

      // Listen for console logs from the page to debug the flow
      joinerPage.on('console', msg => {
        if (msg.text().includes('[B48]') || msg.text().includes('[Live')) {
          console.log(`[Joiner Console] ${msg.text()}`);
        }
      });
      creatorPage.on('console', msg => {
        if (msg.text().includes('[B48]') || msg.text().includes('joiner')) {
          console.log(`[Creator Console] ${msg.text()}`);
        }
      });

      // Wait for the mic permission flow to complete
      // getUserMedia will reject when no permission is granted in Playwright context
      // Instead of a fixed timeout, wait for either:
      // - Mic permission dialog appears (joiner blocked at mic step)
      // - Error message appears (joiner's join was rejected)
      // - Join form is still visible (joiner never left start screen)
      console.log('[Test] Waiting for mic permission flow...');
      await Promise.race([
        joinerPage.getByRole('dialog').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
        joinerPage.getByText(/microphone|permission|denied/i).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
        joinerPage.waitForTimeout(5000), // Fallback timeout
      ]);

      // Step 4: Check what state the joiner ended up in
      // After mic denied, joiner should see EITHER:
      // - Mic permission dialog (asking to retry)
      // - Back on start screen with error message
      // - Definitely NOT in live view
      const joinerInLive = await joinerPage.locator('[data-testid="live-view"]').isVisible().catch(() => false)
        || await joinerPage.getByText(/I spoke|I heard you/i).isVisible().catch(() => false);

      console.log(`[Test] Joiner in live view: ${joinerInLive}`);

      // Step 5: CRITICAL ASSERTION - Creator should STILL be waiting
      // This is the bug we're fixing: creator should NOT transition to live
      // when joiner's mic permission is denied (regardless of what joiner sees)
      await creatorPage.waitForTimeout(2000); // Give time for any subscription to fire

      // Creator should still see "Waiting for partner" - NOT the live view
      const stillWaiting = await creatorPage.getByText('Invite Your Partner').isVisible();
      const inLiveView = await creatorPage.getByText(/I spoke|I heard you/i).isVisible().catch(() => false);

      console.log(`[Test] Creator still waiting: ${stillWaiting}, in live: ${inLiveView}`);

      // THE BUG: If this assertion fails, it means the creator went to live view
      // even though the joiner denied mic permission
      expect(stillWaiting).toBe(true);
      expect(inLiveView).toBe(false);

      console.log('[Test] SUCCESS: Creator still waiting after joiner denied mic');

    } finally {
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
      await creatorContext.close();
      await joinerContext.close();
    }
  });

  /**
   * Complementary test: Joiner who GRANTS mic should appear joined.
   * This ensures the fix doesn't break the happy path.
   */
  test('joiner who grants mic should appear joined to creator', async ({ browser }) => {
    // Both users grant mic permission
    const creatorContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    // Mock getUserMedia on BOTH pages to always succeed (simulate mic granted)
    const mockMicScript = () => {
      const mockAudioTrack = {
        kind: 'audio',
        stop: () => {},
        enabled: true,
      };
      const mockStream = {
        getTracks: () => [mockAudioTrack],
        getAudioTracks: () => [mockAudioTrack],
      };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    };

    await creatorPage.addInitScript(mockMicScript);
    await joinerPage.addInitScript(mockMicScript);

    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Step 0: Create and authenticate creator
      testUser = await createTestUser({ name: 'Creator' });
      await setTestSession(creatorPage, testUser.email);

      // Step 1: Creator creates meeting
      const sessionCode = await createMeeting(creatorPage);
      console.log(`[Test] Created meeting with code: ${sessionCode}`);

      // Step 2: Joiner joins with mic granted
      await joinerPage.goto(`/live/${sessionCode}`);

      const joinerNameInput = joinerPage.locator('input[placeholder="Enter your name"]');
      await expect(joinerNameInput).toBeVisible({ timeout: 5000 });
      await joinerNameInput.fill('Joiner');

      // P1232: the guest email input and consent checkbox were removed by P396;
      // filling them auto-waited until the test timed out. The /join/i click below
      // still matches the surviving "Join as Guest" button.

      await joinerPage.getByRole('button', { name: /join/i }).click();

      // Wait for DB to confirm joiner wrote their name (Realtime doesn't propagate between isolated contexts)
      await waitForDBPresence('clarity_sessions', 'joiner_name', 'Joiner', 'code', sessionCode);

      // Step 3: Both should transition to live view
      // Wait for creator to see live view (no longer waiting)
      await expect(creatorPage.getByText('Invite Your Partner')).not.toBeVisible({ timeout: 5000 });

      // Joiner should also be in live view (not showing mic dialog)
      const joinerMicDialog = joinerPage.getByRole('dialog');
      await expect(joinerMicDialog).not.toBeVisible({ timeout: 5000 });

      console.log('[Test] SUCCESS: Both users in live view after mic granted');

    } finally {
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
      await creatorContext.close();
      await joinerContext.close();
    }
  });

  /**
   * Test: Joiner cancels mic dialog should return to start view.
   */
  test('joiner who cancels mic dialog should return to start view', async ({ browser }) => {
    const creatorContext = await browser.newContext({
      permissions: ['microphone'],
    });
    const joinerContext = await browser.newContext({
      permissions: [], // Mic will be denied
    });

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      // Create and authenticate creator
      testUser = await createTestUser({ name: 'Creator' });
      await setTestSession(creatorPage, testUser.email);

      // Creator creates meeting
      const sessionCode = await createMeeting(creatorPage);

      // Joiner tries to join
      await joinerPage.goto(`/live/${sessionCode}`);

      const joinerNameInput = joinerPage.locator('input[placeholder="Enter your name"]');
      await joinerNameInput.fill('Joiner');

      // P1232: the guest email input and consent checkbox were removed by P396;
      // filling them auto-waited until the test timed out. The /join/i click below
      // still matches the surviving "Join as Guest" button.

      await joinerPage.getByRole('button', { name: /join/i }).click();

      // Wait for mic dialog
      await joinerPage.waitForTimeout(2000);

      // If there's a cancel button in the mic dialog, click it
      const cancelButton = joinerPage.getByRole('button', { name: 'Cancel' });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }

      // Joiner should return to start view (can see "Join" button again)
      await expect(joinerPage.getByRole('button', { name: /join/i })).toBeVisible({ timeout: 5000 });

      // Creator should still be waiting
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible();

    } finally {
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
      await creatorContext.close();
      await joinerContext.close();
    }
  });
});
