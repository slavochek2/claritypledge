/**
 * @file p670-listener-layout-jump.spec.ts
 *
 * P670: Canary test — listener's Speak button must not jump when speaker selects a story.
 *
 * The bug: `hasScrollableContent` in `live-mode-view.tsx` includes `selectedStoryId`
 * from shared Realtime state. When the speaker selects a story, the listener's layout
 * proportions change, causing the Speak button to shift position.
 *
 * This test captures the guest's Speak button Y position before and after the host
 * selects a story (via DB state injection). The button must stay stable.
 */

import { test, expect } from '@playwright/test';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState } from './helpers/test-realtime';

test.describe('P670 — Listener Layout Stability', () => {
  test.setTimeout(90_000);

  test('guest Speak button does not jump when host selects a story', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P670 Host',
      guestName: 'P670 Guest',
    });

    try {
      const guestPage = session.guest.page;

      // Wait for guest's Speak button to appear and stabilize
      const speakButton = guestPage.getByRole('button', { name: /speak/i });
      await expect(speakButton).toBeVisible({ timeout: 15_000 });

      // Let layout settle (Realtime subscription + initial render)
      await guestPage.waitForTimeout(2000);

      // Record the Speak button's Y position before host selects a story
      const boxBefore = await speakButton.boundingBox();
      expect(boxBefore).toBeTruthy();
      const yBefore = boxBefore!.y;

      // Simulate host selecting a story — inject selectedStoryId into shared live_state.
      // Only set selectedStoryId (not selectedStoryData) to avoid shape mismatch crashes.
      // selectedStoryId alone is sufficient to flip hasScrollableContent.
      await advanceSessionState(session.sessionCode, {
        selectedStoryId: 'fake-story-id-for-p670-test',
      });

      // Wait for Realtime to deliver the state change to guest's browser.
      // The app uses postgres_changes + 1s drift polling, so 4s is generous.
      await guestPage.waitForTimeout(4000);

      // The Speak button must still be visible and at the same Y position.
      await expect(speakButton).toBeVisible();
      const boxAfter = await speakButton.boundingBox();
      expect(boxAfter).toBeTruthy();
      const yAfter = boxAfter!.y;

      // Allow ±2px tolerance for sub-pixel rendering differences
      expect(Math.abs(yAfter - yBefore)).toBeLessThanOrEqual(2);
    } finally {
      await session.cleanup();
    }
  });
});
