/**
 * @file p775-reproduce.spec.ts
 *
 * P775 reproduce canary — REAL locators (role + aria-label), two distinct scenarios.
 *
 * Why this file exists:
 * The in-place P775 describe block in p769-session-end-terminal-authority.spec.ts
 * uses `[data-testid="active-session-banner"]` — that attribute does not exist on
 * ActiveSessionBanner. The locator matches zero elements so `not.toBeVisible()`
 * passes trivially regardless of whether the bug is fixed. Every fix "passes"
 * without actually fixing anything; this is why the loop keeps re-opening.
 *
 * This file uses the component's actual DOM contract:
 *   <div role="status" aria-live="polite" aria-label="Active session notification">
 * and pairs each DOM assertion with a localStorage check, so we cannot be fooled
 * by a missed element again.
 *
 * Two scenarios, matching the two symptoms visible in the user's screenshots
 * (Apr 21 17:09 and 17:12):
 *   Scenario 1 — CREATOR: clicks End Session on /live, navigates to /letters during
 *     the 5s upload await. Banner must not render; localStorage must be cleared.
 *   Scenario 2 — JOINER PROPAGATION: creator ends the session; the joiner (still
 *     in /live) must transition to the "This session has ended" screen via
 *     Realtime + polling. This path is NOT covered by the existing P775 canary.
 */

import { test, expect } from '@playwright/test';
import { createTwoPartySessionRealistic } from './helpers/test-session';
import { waitForDBStateKey } from './helpers/test-realtime';

test.describe('P775 reproduce: banner race + joiner propagation', () => {
  test.setTimeout(90_000);

  test('creator ends on /live then navigates to /letters — banner must not render (real locator)', async ({ browser }) => {
    const session = await createTwoPartySessionRealistic(browser, {
      hostName: 'P775 Repro Host',
      guestName: 'P775 Repro Guest',
    });
    try {
      // Precondition: localStorage has the active session before click.
      // If this is null at baseline, the whole session setup is wrong — not a P775 bug.
      const before = await session.host.page.evaluate(() =>
        localStorage.getItem('cp_active_session'),
      );
      expect(before).not.toBeNull();

      const endButton = session.host.page
        .getByRole('button', { name: /end session/i })
        .first();
      await expect(endButton).toBeVisible({ timeout: 5_000 });
      await endButton.click();

      // Immediately navigate to /letters to simulate the user clicking a bottom-nav
      // link during the 5s upload await. This is the race window.
      await session.host.page.goto('/letters', { waitUntil: 'domcontentloaded' });

      // The P775 fix clears localStorage BEFORE the 5s await. If it fires,
      // cp_active_session is already null by the time /letters mounts.
      const after = await session.host.page.evaluate(() =>
        localStorage.getItem('cp_active_session'),
      );
      expect(after).toBeNull();

      // Real banner locator — matches the component's aria-label, not a missing testid.
      const banner = session.host.page.getByRole('status', {
        name: /active session notification/i,
      });
      await expect(banner).not.toBeVisible({ timeout: 2_000 });

      // Reload should not rehydrate — proves storage stayed cleared (not just React state).
      await session.host.page.reload();
      await session.host.page.waitForLoadState('networkidle');
      await expect(banner).not.toBeVisible({ timeout: 2_000 });
    } finally {
      await session.cleanup();
    }
  });

  test('joiner propagation: after creator ends, joiner /live transitions to ended screen', async ({ browser }) => {
    const session = await createTwoPartySessionRealistic(browser, {
      hostName: 'P775 Propagation Host',
      guestName: 'P775 Propagation Guest',
    });
    try {
      // Baseline: both users are on /live after the realistic two-party setup.
      // Creator clicks End Session.
      const endButton = session.host.page
        .getByRole('button', { name: /end session/i })
        .first();
      await expect(endButton).toBeVisible({ timeout: 5_000 });
      await endButton.click();

      // Confirm the DB write landed (otherwise the joiner has nothing to react to).
      await waitForDBStateKey(
        'clarity_sessions',
        'live_state',
        'sessionEnded',
        true,
        'id',
        session.sessionId,
        15_000,
      );

      // The joiner's clarity-live-page has two detection paths for
      // live_state.sessionEnded: postgres_changes subscriber (line ~1037) and
      // 1s polling fallback (line ~1213). At least one MUST deliver; the UI
      // MUST transition to either SessionEndedScreen ("This session has ended")
      // or the in-live-mode ended heading ("Session ended").
      const endedHeading = session.guest.page.getByRole('heading', {
        name: /(?:this session has ended|^session ended$)/i,
      });
      await expect(endedHeading).toBeVisible({ timeout: 10_000 });
    } finally {
      await session.cleanup();
    }
  });
});
