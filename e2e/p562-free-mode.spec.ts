/**
 * @file p562-free-mode.spec.ts
 * @description E2E two-party test for P562: /live Free Mode — Structured Start, Then Continuous Sliders
 *
 * Rewritten for the current design (commit 11aadf87, P891): free mode's first
 * round reuses the guided mode round. Free mode diverges at the speaker's
 * explain-back re-rating: a re-rating <10 transitions to freePhase='unlocked'
 * continuous sliders (a 10/10 round celebrates and resets to idle instead).
 * 10/10 on the unlocked sliders auto-completes to the success screen
 * (freePhase='success').
 *
 * Flow under test:
 * 1. Both join session — free ("Open") mode is the default; mode toggle visible
 * 2. Speaker taps "Did [partner] understand you?" — sealed-bid round starts
 * 3. Bids reveal a gap → listener explains back → speaker re-rates <10
 * 4. freePhase='unlocked' — continuous sliders + "Speak freely" + intention question
 * 5. Both move sliders to 10 → success screen ("understood you perfectly!")
 *
 * Anti-anchoring (guided-equivalent): responder sees no reveal/celebration
 * before submitting their own rating.
 *
 * Auth: createTwoPartySession (host + guest verified).
 * Realtime: waitForDBStateKey + DB polling to sync cross-context transitions.
 * Mic: mocked inside createTwoPartySession.
 */

import { test, expect, Page } from '@playwright/test';
import { createTwoPartySession } from './helpers/test-session';
import { waitForDBStateKey } from './helpers/test-realtime';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Drives the guided first round into free mode's unlocked phase via the
 * explain-back path — the ONLY route into freePhase='unlocked'
 * (clarity-live-page.tsx ~2775: sessionMode !== 'guided' && re-rating !== 10).
 * A 10/10 first round celebrates and resets to idle instead.
 *
 * Steps: speaker starts check → both submit sealed bids with a gap →
 * gap revealed → listener explains back → "I'm done with active listening" →
 * speaker re-rates <10 → freePhase='unlocked'.
 */
async function reachUnlockedViaExplainBack(
  speakerPage: Page,
  listenerPage: Page,
  sessionCode: string,
  speakerBid = 8,
  listenerBid = 5,
  reRating = 9
): Promise<void> {
  // Speaker starts the round — both enter the sealed-bid drawer
  await speakerPage.getByTestId('start-check').click();

  // Sealed bids with a gap → reveal leads to explain-back, not celebration.
  // Sequential: the listener's drawer appears only after the speaker submits.
  await expect(speakerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 15000 });
  await speakerPage.locator('button').filter({ hasText: new RegExp(`^${speakerBid}$`) }).click();
  await speakerPage.getByRole('button', { name: /Submit/i }).click();

  await expect(listenerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 20000 });
  await listenerPage.locator('button').filter({ hasText: new RegExp(`^${listenerBid}$`) }).click();
  await listenerPage.getByRole('button', { name: /Submit/i }).click();

  // Gap revealed — listener offers to explain back.
  // updateClaritySessionLiveState is last-write-wins: confirm each phase write
  // is durable in DB before the next click, or a stale write reverts the phase.
  const explainBackButton = listenerPage.getByRole('button', { name: /Explain back what I heard/i });
  await expect(explainBackButton).toBeVisible({ timeout: 15000 });
  // Entrance animation applies pointer-events: none to the container — a click
  // during it lands on the element below (documented incident, ex-p398 helper).
  // Playwright actionability does not catch this; the settle delay does.
  await listenerPage.waitForTimeout(500);
  await explainBackButton.click();
  await waitForDBStateKey(
    'clarity_sessions', 'live_state', 'ratingPhase', 'explain-back', 'code', sessionCode, 15000
  );

  // Listener finishes active listening
  const doneButton = listenerPage.getByRole('button', { name: /I'm done with active listening/i });
  await expect(doneButton).toBeVisible({ timeout: 15000 });
  await listenerPage.waitForTimeout(500);
  await doneButton.click();
  await waitForDBStateKey(
    'clarity_sessions', 'live_state', 'explainBackDone', true, 'code', sessionCode, 15000
  );

  // Speaker re-rates (<10 → free mode diverges to unlocked sliders).
  // The freePhase wait doubles as the durability confirmation for this write.
  await expect(speakerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 15000 });
  await speakerPage.locator('button').filter({ hasText: new RegExp(`^${reRating}$`) }).click();
  await speakerPage.getByRole('button', { name: /Submit/i }).click();
  await waitForDBStateKey(
    'clarity_sessions', 'live_state', 'freePhase', 'unlocked', 'code', sessionCode, 15000
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('P562: Free Mode — Two-Party Full Flow', () => {
  test.describe.configure({ timeout: 120000 });

  test('guided first round → unlocked continuous sliders with intention question', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    const speakerPage = session.host.page;
    const listenerPage = session.guest.page;
    const code = session.sessionCode;

    try {
      // --- Phase 1: Entry — both see the mode toggle; free ("Open") is default ---
      await expect(speakerPage.getByText('Open mode')).toBeVisible({ timeout: 15000 });
      await expect(listenerPage.getByText('Open mode')).toBeVisible({ timeout: 15000 });
      await expect(speakerPage.getByText('Guided mode')).toBeVisible();
      await expect(listenerPage.getByText('Guided mode')).toBeVisible();

      // Speaker sees the start-check button with current copy
      await expect(speakerPage.getByTestId('start-check')).toBeVisible({ timeout: 10000 });
      await expect(speakerPage.getByText(/Did Bob understand you/i)).toBeVisible();

      // --- Phase 2: Gap round → explain-back → speaker re-rates <10 ---
      await reachUnlockedViaExplainBack(speakerPage, listenerPage, code);

      // --- Phase 3: Free mode diverged — helper confirmed freePhase='unlocked' in DB ---
      // Both see the continuous slider
      await expect(speakerPage.locator('[role="slider"]')).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.locator('[role="slider"]')).toBeVisible({ timeout: 10000 });

      // Role-aware intention question above the slider
      await expect(
        speakerPage.getByText(/How well do you believe.*understands your intention/i)
      ).toBeVisible();
      await expect(
        listenerPage.getByText(/How well do you believe you understand.*intention/i)
      ).toBeVisible();

      // Scale labels
      await expect(speakerPage.getByText('Not at all')).toBeVisible();
      await expect(speakerPage.getByText('Complete cognitive understanding')).toBeVisible();

      // Journey card from the guided first round (committed rounds carried over)
      await expect(speakerPage.getByText(/journey to/i)).toBeVisible();

      // "Speak freely" exit affordance present on both
      await expect(speakerPage.getByText(/Speak freely/i)).toBeVisible();
      await expect(listenerPage.getByText(/Speak freely/i)).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });

  test('responder sees no reveal before submitting their own rating (sequential anti-anchoring)', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'Carol',
      guestName: 'Dave',
    });

    const speakerPage = session.host.page;
    const listenerPage = session.guest.page;

    try {
      await expect(speakerPage.getByTestId('start-check')).toBeVisible({ timeout: 15000 });
      await speakerPage.getByTestId('start-check').click();

      // Checker rates 10 and submits
      await expect(speakerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 15000 });
      await speakerPage.locator('button').filter({ hasText: /^10$/ }).click();
      await speakerPage.getByRole('button', { name: /Submit/i }).click();

      // Responder's drawer appears — they still have to rate
      await expect(listenerPage.getByRole('button', { name: /Submit/i })).toBeVisible({ timeout: 20000 });

      // Anti-anchoring: no reveal/celebration content on the responder's screen
      // before they submit — checker's rating must not leak.
      await expect(listenerPage.getByText(/understood you perfectly/i)).not.toBeVisible();
      // The journey card renders pre-reveal with the checker's submitted value
      // SEALED — "Carol's belief" must read "Pending…", never the number.
      await expect(listenerPage.getByText(/Pending/i).first()).toBeVisible();
      await expect(listenerPage.getByRole('button', { name: /Continue/i })).not.toBeVisible();

      // Responder submits → reveal/celebration appears for both
      await listenerPage.locator('button').filter({ hasText: /^10$/ }).click();
      await listenerPage.getByRole('button', { name: /Submit/i }).click();

      await expect(speakerPage.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 15000 });
      await expect(listenerPage.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 15000 });
    } finally {
      await session.cleanup();
    }
  });

  test('10/10 on unlocked sliders auto-completes to success screen', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'Eve',
      guestName: 'Frank',
    });

    const speakerPage = session.host.page;
    const listenerPage = session.guest.page;
    const code = session.sessionCode;

    try {
      await expect(speakerPage.getByTestId('start-check')).toBeVisible({ timeout: 15000 });

      // Gap round + explain-back → unlocked
      await reachUnlockedViaExplainBack(speakerPage, listenerPage, code);

      await expect(speakerPage.locator('[role="slider"]')).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.locator('[role="slider"]')).toBeVisible({ timeout: 10000 });

      // Move both sliders to 10 via keyboard (step=1 from 0)
      await speakerPage.locator('[role="slider"]').focus();
      for (let i = 0; i < 10; i++) {
        await speakerPage.keyboard.press('ArrowRight');
      }
      await listenerPage.locator('[role="slider"]').focus();
      for (let i = 0; i < 10; i++) {
        await listenerPage.keyboard.press('ArrowRight');
      }

      // 2-second "Both at 10" hold → freePhase='success'
      await waitForDBStateKey(
        'clarity_sessions', 'live_state', 'freePhase', 'success', 'code', code, 20000
      );

      // Success screen on both: role-aware headline + Continue
      await expect(speakerPage.getByText(/Frank understood you perfectly!/i)).toBeVisible({ timeout: 10000 });
      await expect(listenerPage.getByText(/You understood Eve perfectly!/i)).toBeVisible({ timeout: 10000 });
      await expect(speakerPage.getByText(/Achieved in/i)).toBeVisible();
      await expect(speakerPage.getByRole('button', { name: /Continue/i })).toBeVisible();
      await expect(listenerPage.getByRole('button', { name: /Continue/i })).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });
});
