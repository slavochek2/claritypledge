/**
 * E2E test: Nav blocker during live session
 *
 * When a user is in an active live meeting and taps a bottom nav link,
 * a "Leave session?" confirmation dialog should appear instead of
 * silently navigating away.
 */
import { test, expect } from '@playwright/test';
import { deleteClaritySession } from './helpers/test-user';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

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

async function startTwoPersonSession(browser: Parameters<typeof test>[1] extends { browser: infer B } ? B : never) {
  const creatorContext = await (browser as import('@playwright/test').Browser).newContext({
    permissions: ['microphone'],
    viewport: { width: 390, height: 844 }, // Mobile — bottom nav is visible (lg:hidden)
  });
  const joinerContext = await (browser as import('@playwright/test').Browser).newContext({
    permissions: ['microphone'],
    viewport: { width: 390, height: 844 },
  });

  const creatorPage = await creatorContext.newPage();
  const joinerPage = await joinerContext.newPage();

  await creatorPage.addInitScript(mockMicScript);
  await joinerPage.addInitScript(mockMicScript);

  // Creator starts a session
  await creatorPage.goto('/live');
  await creatorPage.getByPlaceholder('Enter your name').fill('Alice');
  const emailInput = creatorPage.getByPlaceholder('your@email.com');
  if (await emailInput.isVisible()) await emailInput.fill('alice@test.com');
  const checkbox = creatorPage.getByRole('checkbox');
  if (await checkbox.isVisible()) await checkbox.check();
  await creatorPage.getByRole('button', { name: 'New session' }).click();
  await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

  const shareLink = await creatorPage.getByTestId('share-link').textContent();
  const roomCode = shareLink!.split('/').pop()!;

  // Joiner joins
  await joinerPage.goto(`/live/${roomCode}`);
  await joinerPage.getByPlaceholder('Enter your name').fill('Bob');
  // P1232: P396 removed the guest email input and the consent checkbox.
  // "Join Session" now renders only on the auto-join ERROR path, so an
  // unconditional click hangs; a guard keyed on the removed email input
  // is always false and skips the join entirely. See helpers/live-join.ts.
  await completeLiveJoinIfPrompted(joinerPage);

  // Both reach live view
  await expect(joinerPage.getByText('Alice')).toBeVisible({ timeout: 10000 });
  await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 15000 });

  return { creatorPage, joinerPage, creatorContext, joinerContext, roomCode };
}

// Two-party tests require a live session with two authenticated users.
// The two-party E2E session infrastructure is currently broken in the test environment
// (session state sync between creator/joiner fails — same issue as live-content-picker.spec.ts).
// These tests are skipped until that infrastructure is fixed.
// Manual verification: create a session in two tabs, tap a nav link, confirm dialog appears.
test.describe('Nav blocker during live session', () => {
  test.skip('tapping bottom nav shows Leave session dialog', async ({ browser }) => {
    const { creatorPage, creatorContext, joinerContext, roomCode } = await startTwoPersonSession(browser);

    try {
      // Bottom nav is visible on mobile viewport — tap "My Events"
      const eventsNavLink = creatorPage.getByRole('link', { name: /my events/i });
      await expect(eventsNavLink).toBeVisible({ timeout: 5000 });
      await eventsNavLink.click();

      // Dialog should appear instead of navigating
      await expect(creatorPage.getByRole('dialog')).toBeVisible({ timeout: 3000 });
      await expect(creatorPage.getByText('Leave session?')).toBeVisible();

      // URL should NOT have changed
      expect(creatorPage.url()).toContain('/live');
    } finally {
      await creatorContext.close();
      await joinerContext.close();
      await deleteClaritySession(roomCode);
    }
  });

  test.skip('cancel keeps user in the live session', async ({ browser }) => {
    const { creatorPage, creatorContext, joinerContext, roomCode } = await startTwoPersonSession(browser);

    try {
      await creatorPage.getByRole('link', { name: /my events/i }).click();
      await expect(creatorPage.getByText('Leave session?')).toBeVisible({ timeout: 3000 });

      // Click Cancel
      await creatorPage.getByRole('button', { name: 'Cancel' }).click();

      // Dialog gone, still on /live
      await expect(creatorPage.getByRole('dialog')).not.toBeVisible();
      expect(creatorPage.url()).toContain('/live');

      // Still in the live meeting view
      await expect(creatorPage.getByText('Bob')).toBeVisible();
    } finally {
      await creatorContext.close();
      await joinerContext.close();
      await deleteClaritySession(roomCode);
    }
  });

  test.skip('confirming Leave navigates to intended destination', async ({ browser }) => {
    const { creatorPage, creatorContext, joinerContext, roomCode } = await startTwoPersonSession(browser);

    try {
      await creatorPage.getByRole('link', { name: /my events/i }).click();
      await expect(creatorPage.getByText('Leave session?')).toBeVisible({ timeout: 3000 });

      await creatorPage.getByRole('button', { name: 'Leave' }).click();

      // Should navigate to /events (the link they tapped)
      await expect(creatorPage).toHaveURL(/\/events/, { timeout: 5000 });
    } finally {
      await creatorContext.close();
      await joinerContext.close();
      if (!creatorPage.url().includes('/live')) {
        // Session already ended by confirm action — no need to force-delete
      }
      await deleteClaritySession(roomCode).catch(() => {});
    }
  });

  test('no dialog when navigating away from start view (no active session)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/live');
    await expect(page.locator('h1')).toBeVisible();

    // On start view — nav should work without dialog
    const eventsLink = page.getByRole('link', { name: /my events/i });
    if (await eventsLink.isVisible()) {
      await eventsLink.click();
      await expect(page).not.toHaveURL(/\/live/);
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
  });
});
