/**
 * E2E test for: Creator detects when joiner joins
 *
 * BUG: Creator stays stuck on "Waiting for partner to join..."
 * even after joiner has successfully joined and sees the live view.
 *
 * Root cause hypothesis: Realtime subscription or polling not detecting
 * the joiner_name update in the database.
 */
import { test, expect } from '@playwright/test';
import { deleteClaritySession } from './helpers/test-user';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

test.describe('Creator Detects Joiner', () => {
  test('Creator transitions to live view when joiner joins', async ({ browser }) => {
    // Create two browser contexts to simulate two users
    // Grant mic permission to both so they can actually join/create meetings
    const creatorContext = await browser.newContext({
      permissions: ['microphone'],
    });
    const joinerContext = await browser.newContext({
      permissions: ['microphone'],
    });

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    // Mock getUserMedia on BOTH pages to simulate mic granted
    // This is needed because Playwright doesn't have a real mic device
    const mockMicScript = () => {
      const mockAudioTrack = {
        kind: 'audio' as const,
        enabled: true,
        stop: () => {},
      };
      const mockStream = {
        getTracks: () => [mockAudioTrack],
        getAudioTracks: () => [mockAudioTrack],
      };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    };
    await creatorPage.addInitScript(mockMicScript);
    await joinerPage.addInitScript(mockMicScript);

    // Capture console logs for debugging
    const creatorLogs: string[] = [];
    creatorPage.on('console', msg => {
      const text = msg.text();
      // Capture subscription-related logs
      if (text.includes('📡') || text.includes('joiner') || text.includes('subscription')) {
        creatorLogs.push(`[${msg.type()}] ${text}`);
      }
    });

    // Track session for cleanup
    let roomCode: string | null = null;

    try {
      // Step 1: Creator starts a meeting
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');

      await creatorPage.getByPlaceholder('Enter your name').fill('Creator');

      // Fill email (required for guests - B50)
      const creatorEmailInput = creatorPage.getByPlaceholder('your@email.com');
      if (await creatorEmailInput.isVisible()) {
        await creatorEmailInput.fill('creator@test.com');
      }

      // Check consent checkbox (required - B50)
      const creatorCheckbox = creatorPage.getByRole('checkbox');
      if (await creatorCheckbox.isVisible()) {
        await creatorCheckbox.check();
      }

      await creatorPage.getByRole('button', { name: 'New session' }).click();

      // Wait for the waiting room with share link
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });
      await expect(creatorPage.getByText('Waiting for partner to join')).toBeVisible();

      // Get the room code from the share link
      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      expect(shareLink).toBeTruthy();
      roomCode = shareLink!.split('/').pop()!;
      expect(roomCode).toHaveLength(6);

      console.log(`[Test] Room code: ${roomCode}`);

      // Step 2: Joiner joins the meeting
      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.waitForLoadState('networkidle');

      await joinerPage.getByPlaceholder('Enter your name').fill('Joiner');

      // P1232: P396 removed the guest email input and the consent checkbox.
      // "Join Session" now renders only on the auto-join ERROR path, so an
      // unconditional click hangs; a guard keyed on the removed email input
      // is always false and skips the join entirely. See helpers/live-join.ts.
      await completeLiveJoinIfPrompted(joinerPage);

      // Step 3: Joiner should see the live view (this works per the bug report)
      await expect(joinerPage.getByText('Creator')).toBeVisible({ timeout: 10000 });
      await expect(joinerPage.getByText('Does Creator understand you?')).toBeVisible({ timeout: 5000 });

      console.log('[Test] Joiner is in live view');

      // Step 4: THE BUG - Creator should ALSO transition to live view
      // This is where the bug manifests - creator stays stuck on "Waiting"

      // First check: Creator should see joiner's name in the header
      await expect(creatorPage.getByText('Joiner')).toBeVisible({ timeout: 15000 });

      // Second check: Creator should see the live meeting buttons
      await expect(creatorPage.getByText('Does Joiner understand you?')).toBeVisible({ timeout: 5000 });

      // If we get here, the bug is fixed!
      console.log('[Test] Creator successfully detected joiner');
      console.log('[Test] Creator logs:', creatorLogs.join('\n'));

    } catch (error) {
      // Log debugging info on failure
      console.log('[Test] FAILED - Creator logs:', creatorLogs.join('\n'));
      throw error;
    } finally {
      await creatorContext.close();
      await joinerContext.close();
      // Clean up the session from Supabase
      if (roomCode) {
        await deleteClaritySession(roomCode);
      }
    }
  });

  test('Creator detects joiner via polling fallback if realtime fails', async ({ browser }) => {
    // This test specifically checks the polling mechanism
    // by waiting longer than the poll interval (1000ms)

    // Grant mic permission to both contexts
    const creatorContext = await browser.newContext({
      permissions: ['microphone'],
    });
    const joinerContext = await browser.newContext({
      permissions: ['microphone'],
    });

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    // Mock getUserMedia on BOTH pages to simulate mic granted
    const mockMicScript = () => {
      const mockAudioTrack = {
        kind: 'audio' as const,
        enabled: true,
        stop: () => {},
      };
      const mockStream = {
        getTracks: () => [mockAudioTrack],
        getAudioTracks: () => [mockAudioTrack],
      };
      navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
    };
    await creatorPage.addInitScript(mockMicScript);
    await joinerPage.addInitScript(mockMicScript);

    let roomCode: string | null = null;

    try {
      // Creator starts meeting
      await creatorPage.goto('/live');
      await creatorPage.getByPlaceholder('Enter your name').fill('Alice');

      // Fill email (required for guests - B50)
      const creatorEmailInput = creatorPage.getByPlaceholder('your@email.com');
      if (await creatorEmailInput.isVisible()) {
        await creatorEmailInput.fill('alice@test.com');
      }

      // Check consent checkbox (required - B50)
      const creatorCheckbox = creatorPage.getByRole('checkbox');
      if (await creatorCheckbox.isVisible()) {
        await creatorCheckbox.check();
      }

      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      const shareLink = await creatorPage.getByTestId('share-link').textContent();
      roomCode = shareLink!.split('/').pop()!;

      // Add a small delay to ensure subscription is fully set up
      await creatorPage.waitForTimeout(2000);

      // Joiner joins
      await joinerPage.goto(`/live/${roomCode}`);
      await joinerPage.getByPlaceholder('Enter your name').fill('Bob');

      // P1232: P396 removed the guest email input and the consent checkbox.
      // "Join Session" now renders only on the auto-join ERROR path, so an
      // unconditional click hangs; a guard keyed on the removed email input
      // is always false and skips the join entirely. See helpers/live-join.ts.
      await completeLiveJoinIfPrompted(joinerPage);

      // Wait for joiner to be in live view
      await expect(joinerPage.getByText('Alice')).toBeVisible({ timeout: 10000 });

      // Wait for polling to kick in (poll interval is 1000ms, give it 5 cycles)
      // Creator should detect joiner within 5 seconds via polling even if realtime fails
      await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 5000 });
      await expect(creatorPage.getByText('Does Bob understand you?')).toBeVisible({ timeout: 2000 });

    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (roomCode) {
        await deleteClaritySession(roomCode);
      }
    }
  });
});
