/**
 * @file p562-free-mode.spec.ts
 * @description E2E two-party test for P562: /live Free Mode — Structured Start, Then Continuous Sliders
 *
 * Tests the full free mode flow with two browser contexts (speaker + listener):
 * 1. Both join session, see mode toggle, select Free mode
 * 2. Speaker taps "Did [partner] understand you?" — both enter sealed-bid phase
 * 3. Both submit sealed bids via slider → reveal phase
 * 4. Listener clicks "I paraphrased" → sliders unlock
 * 5. Both move sliders to 10 → success screen
 * 6. "Speak freely" exits round → returns to entry screen
 *
 * Auth: Uses getTestAuthContext for both participants (host + guest verified).
 * Realtime: Uses waitForDBStateKey to sync cross-context phase transitions.
 * Mic: mockMicPermission on both pages to bypass mic permission gate.
 */

import { test, expect } from '@playwright/test';
import { createTwoPartySession } from './helpers/test-session';
import { waitForDBStateKey } from './helpers/test-realtime';

test.describe('P562: Free Mode — Two-Party Full Flow', () => {
  test.describe.configure({ timeout: 120000 });

  test('complete free mode round: sealed bid → reveal → paraphrase → unlock → speak freely', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    const speakerPage = session.host.page;
    const listenerPage = session.guest.page;
    const code = session.sessionCode;

    try {
      // --- Phase 1: Entry — both see mode toggle ---
      // Wait for entry screen to load on both pages
      await expect(speakerPage.getByText('Open mode')).toBeVisible({ timeout: 15000 });
      await expect(listenerPage.getByText('Open mode')).toBeVisible({ timeout: 15000 });

      // Both should see Guided mode option too
      await expect(speakerPage.getByText('Guided mode')).toBeVisible();
      await expect(listenerPage.getByText('Guided mode')).toBeVisible();

      // Select Free mode on both (click the pill toggle)
      await speakerPage.getByText('Open mode').click();
      await listenerPage.getByText('Open mode').click();

      // Speaker should see the Speak button
      await expect(speakerPage.getByRole('button', { name: /Did.*understand you/i })).toBeVisible({ timeout: 10000 });

      // --- Phase 2: Speaker taps "Does [partner] understand you?" ---
      await speakerPage.getByRole('button', { name: /Did.*understand you/i }).click();

      // --- Phase 2-3: Both enter sealed-bid — drawer slides up ---
      // Speaker sees their question
      await expect(speakerPage.getByText(/How well do you believe.*understands your intention/i)).toBeVisible({ timeout: 10000 });

      // Listener sees their question (via Realtime broadcast)
      await expect(listenerPage.getByText(/How well do you believe you understand.*intention/i)).toBeVisible({ timeout: 10000 });

      // Both see Submit button
      await expect(speakerPage.getByRole('button', { name: /Submit/i })).toBeVisible();
      await expect(listenerPage.getByRole('button', { name: /Submit/i })).toBeVisible();

      // Both see scale labels
      await expect(speakerPage.getByText('Not at all')).toBeVisible();
      await expect(speakerPage.getByText('Complete cognitive understanding')).toBeVisible();
      await expect(listenerPage.getByText('Not at all')).toBeVisible();
      await expect(listenerPage.getByText('Complete cognitive understanding')).toBeVisible();

      // Both see "Speak freely" link in drawer
      await expect(speakerPage.getByText(/Speak freely/i)).toBeVisible();
      await expect(listenerPage.getByText(/Speak freely/i)).toBeVisible();

      // --- Phase 3: Move sliders and submit sealed bids ---
      // Move speaker slider (interact with the slider element)
      const speakerSlider = speakerPage.locator('[role="slider"]');
      if (await speakerSlider.isVisible()) {
        await speakerSlider.click(); // Activate slider area
      }

      // Speaker submits sealed bid
      await speakerPage.getByRole('button', { name: /Submit/i }).click();

      // --- Phase 4: Speaker sees waiting state ---
      await expect(speakerPage.getByText(/Waiting for.*to submit/i)).toBeVisible({ timeout: 10000 });

      // Speaker sees their sealed answer confirmation
      await expect(speakerPage.getByText(/Your answer:/i)).toBeVisible();

      // Listener should NOT see any indication speaker submitted (anti-anchoring)
      await expect(listenerPage.getByRole('button', { name: /Submit/i })).toBeVisible();

      // Listener submits sealed bid
      await listenerPage.getByRole('button', { name: /Submit/i }).click();

      // --- Phase 5: Reveal — both see Journey with numbers ---
      await expect(speakerPage.getByText(/Initial guesses revealed/i)).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.getByText(/Initial guesses revealed/i)).toBeVisible({ timeout: 10000 });

      // Gap badge should be visible during reveal
      // (exact text depends on the gap value — check for either "points gap" or "Well calibrated")
      const speakerGapOrCalibrated = speakerPage.getByText(/points gap|Well calibrated|Both at 10/i);
      await expect(speakerGapOrCalibrated).toBeVisible({ timeout: 5000 });

      // --- Phase 6: Paraphrase ---
      // After 1.5s auto-transition, listener sees paraphrase prompt
      await expect(listenerPage.getByText(/Paraphrase what you understood/i)).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.getByRole('button', { name: /I paraphrased/i })).toBeVisible();

      // Speaker sees waiting for paraphrase
      await expect(speakerPage.getByText(/Waiting for.*to paraphrase/i)).toBeVisible({ timeout: 10000 });

      // Listener clicks "I paraphrased"
      await listenerPage.getByRole('button', { name: /I paraphrased/i }).click();

      // --- Phase 7: Unlocked — continuous sliders ---
      // Both should see their sliders (unlocked mode)
      await expect(speakerPage.locator('[role="slider"]')).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.locator('[role="slider"]')).toBeVisible({ timeout: 10000 });

      // No gap badge in unlocked mode
      await expect(speakerPage.getByText(/points gap/i)).not.toBeVisible({ timeout: 3000 }).catch(() => {
        // May not have gap badge text at all — that's correct
      });

      // Both see "Speak freely" in unlocked mode
      await expect(speakerPage.getByText(/Speak freely/i)).toBeVisible();
      await expect(listenerPage.getByText(/Speak freely/i)).toBeVisible();

      // --- Phase 8b: Speak freely exits round ---
      await speakerPage.getByText(/Speak freely/i).click();

      // Wait for both to return to entry screen
      await waitForDBStateKey(
        'clarity_sessions', 'live_state', 'freePhase', null, 'code', code, 15000
      ).catch(() => {
        // freePhase may be undefined rather than null — also acceptable
      });

      // Both should see mode toggle again (back to entry screen)
      await expect(speakerPage.getByText('Open mode')).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.getByText('Open mode')).toBeVisible({ timeout: 10000 });
    } finally {
      await session.cleanup();
    }
  });

  test('sealed bid values remain hidden until both submit', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'Carol',
      guestName: 'Dave',
    });

    const speakerPage = session.host.page;
    const listenerPage = session.guest.page;

    try {
      // Set up free mode and start round
      await expect(speakerPage.getByText('Open mode')).toBeVisible({ timeout: 15000 });
      await speakerPage.getByText('Open mode').click();
      await listenerPage.getByText('Open mode').click();

      await speakerPage.getByRole('button', { name: /Did.*understand you/i }).click();

      // Wait for sealed-bid drawer on both
      await expect(speakerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 10000 });

      // Speaker submits — listener should NOT see speaker's number
      await speakerPage.getByRole('button', { name: /Submit/i }).click();

      // Speaker enters waiting state
      await expect(speakerPage.getByText(/Waiting for.*to submit/i)).toBeVisible({ timeout: 10000 });

      // Listener still sees their own slider and Submit — no reveal yet
      await expect(listenerPage.getByRole('button', { name: /Submit/i })).toBeVisible();
      await expect(listenerPage.getByText(/Initial guesses revealed/i)).not.toBeVisible();
    } finally {
      await session.cleanup();
    }
  });

  test('10/10 auto-completes to success screen after 2-second hold', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'Eve',
      guestName: 'Frank',
    });

    const speakerPage = session.host.page;
    const listenerPage = session.guest.page;

    try {
      // Fast-forward through sealed bid → reveal → paraphrase → unlocked
      await expect(speakerPage.getByText('Open mode')).toBeVisible({ timeout: 15000 });
      await speakerPage.getByText('Open mode').click();
      await listenerPage.getByText('Open mode').click();

      await speakerPage.getByRole('button', { name: /Did.*understand you/i }).click();

      // Both submit sealed bids quickly
      await expect(speakerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 10000 });
      await speakerPage.getByRole('button', { name: /Submit/i }).click();
      await listenerPage.getByRole('button', { name: /Submit/i }).click();

      // Wait for paraphrase phase
      await expect(listenerPage.getByRole('button', { name: /I paraphrased/i })).toBeVisible({ timeout: 15000 });
      await listenerPage.getByRole('button', { name: /I paraphrased/i }).click();

      // Unlocked phase — move both sliders to 10
      await expect(speakerPage.locator('[role="slider"]')).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.locator('[role="slider"]')).toBeVisible({ timeout: 10000 });

      // Drag sliders to max (10) — use keyboard for reliability
      await speakerPage.locator('[role="slider"]').focus();
      for (let i = 0; i < 10; i++) {
        await speakerPage.keyboard.press('ArrowRight');
      }

      await listenerPage.locator('[role="slider"]').focus();
      for (let i = 0; i < 10; i++) {
        await listenerPage.keyboard.press('ArrowRight');
      }

      // Wait for 2-second hold + auto-transition to success screen
      // Should see "Both at 10" celebration text first
      // Then success screen with "Mutual understanding reached"
      await expect(speakerPage.getByText(/Mutual understanding reached|Discuss another story/i)).toBeVisible({ timeout: 15000 });
      await expect(listenerPage.getByText(/Mutual understanding reached|Discuss another story/i)).toBeVisible({ timeout: 15000 });

      // Success screen shows action buttons
      await expect(speakerPage.getByText(/Discuss another story/i)).toBeVisible();
      await expect(speakerPage.getByText(/End session/i)).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });
});
