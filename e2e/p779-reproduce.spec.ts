/**
 * @file p779-reproduce.spec.ts
 *
 * P779 reproduce canary — letter-sourced /live session-end propagation to joiner.
 *
 * Why this file exists:
 * P775's joiner canary used `createTwoPartySessionRealistic`, which creates a generic
 * (non-letter-sourced) session. Two-party session-end propagation passed there, but
 * users still observe the bug in letter-sourced flows. The letter-sourced path goes
 * through `targetListenerId`-gated branches (clarity-live-page.tsx:2868, 3088, 3117,
 * 3301, 4185) that the generic helper does not exercise — so any regression in
 * those branches escapes P775's net.
 *
 * This canary uses `createLetterSessionFixture` (real letter + story + clarity_sessions
 * row with source_letter_id / source_story_id / target_listener_id) and the real P396
 * auto-join flow (authenticated listener arriving at /live/<code>?returnTo=... joins
 * automatically).
 *
 * Confirmed root cause (found during reproduction, 2026-04-21):
 *
 *   Layer 0 — LiveSessionBanner shortcut bypasses terminate():
 *     live-session-banner.tsx:58-73 — when returnTo is valid, the End Session
 *     button's onClick calls navigate(returnTo) DIRECTLY without calling onExit().
 *     onExit() is the only path into confirmExitMeeting() → terminate() → writing
 *     live_state.sessionEnded=true. So the creator "ends" the session by
 *     navigating away while the DB row remains live. The joiner has no signal.
 *     This is the root cause of the user's 17-09/17-12 screenshots — joiner
 *     stuck in "Explain back…" past 17s because sessionEnded was never written.
 *
 *   Layer 1 — joiner detection paths have no navigate(returnTo):
 *     Even if Layer 0 is fixed and sessionEnded writes to DB, the joiner's
 *     Realtime subscriber (line 1037–1051) and polling fallback (line 1213–1229)
 *     only call setSessionEnded(true) — they never navigate. Joiner would still
 *     need to click "Start new" on <PartnerLeftScreen> to reach returnTo.
 *
 * Why P775's joiner canary stayed green: createTwoPartySessionRealistic does not
 * set returnTo in the URL, so the banner's onClick falls through to onExit() and
 * terminate() fires correctly. Letter-sourced flow always carries returnTo, which
 * triggers the shortcut bug.
 *
 * Test failure sequence (observed):
 *   - Creator clicks End Session → browser navigates to /letters?tab=inbox
 *     (shortcut fires, terminate() does NOT run)
 *   - DB-state gate at line 131 times out after 15s — sessionEnded never writes
 *   - Joiner remains on /live in "Explain back…" state (visible in test-failed-1.png)
 *
 * After Layer-0 fix alone: DB gate passes, but primary URL assertion still fails
 * (Layer 1 alive). After Layer-0 + Layer-1 fix: both pass.
 *
 * Rules followed:
 *   - Uses waitForUIUpdate() — no page.reload() for cross-context sync (tests.md).
 *   - Real locator (ariaLabel / role), not data-testid (P775 lesson).
 *   - DB-state gate via waitForDBStateKey() proves creator's End write landed —
 *     isolates joiner-side failure from creator-side regression.
 */

import { test, expect, type Browser } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';
import { deleteTestUser, type TestUser } from './helpers/test-user';
import { mockMicPermission, waitForUIUpdate, waitForDBStateKey } from './helpers/test-realtime';
import {
  createLetterSessionFixture,
  deleteLetterSessionFixture,
  type LetterSessionFixture,
} from './helpers/test-letter-session';

test.describe('P779 reproduce — letter-sourced /live session-end propagation', () => {
  test.setTimeout(120_000);

  test('creator ends letter-sourced session → joiner auto-navigates to returnTo', async ({
    browser,
  }: { browser: Browser }) => {
    let fixture: LetterSessionFixture | undefined;
    let author: TestUser | undefined;
    let listener: TestUser | undefined;

    try {
      // ── Setup: two authenticated contexts + letter-sourced session fixture ──
      const [authorAuth, listenerAuth] = await Promise.all([
        getTestAuthContext('host', browser, { name: 'P779 Repro Author' }),
        getTestAuthContext('host', browser, { name: 'P779 Repro Listener' }),
      ]);
      author = authorAuth.user;
      listener = listenerAuth.user;

      fixture = await createLetterSessionFixture(author, listener);

      const authorPage = await authorAuth.context.newPage();
      const listenerPage = await listenerAuth.context.newPage();

      await Promise.all([mockMicPermission(authorPage), mockMicPermission(listenerPage)]);

      // returnTo is the letter inbox — matches production invite URL shape (P754).
      // `/letters?tab=inbox` needs the full path+query preserved through encode/decode.
      const returnTo = '/letters?tab=inbox';
      const returnToEncoded = encodeURIComponent(returnTo);

      // ── Author navigates first — bootstraps letter-sourced live_state ──
      // P396 auto-join handles authenticated creator arriving at their own session link.
      await authorPage.goto(
        `/live/${fixture.sessionCode}?skipMicCheck=true&returnTo=${returnToEncoded}`,
      );
      await authorPage.waitForLoadState('networkidle');

      // ── Listener joins via P396 auto-join ──
      // (Not going through /letters?tab=inbox → Join click. The bug is in the session-end
      // detection, not the invite flow — so direct /live URL with auto-join is sufficient
      // and exercises the same joiner code paths.)
      await listenerPage.goto(
        `/live/${fixture.sessionCode}?skipMicCheck=true&returnTo=${returnToEncoded}`,
      );
      await listenerPage.waitForLoadState('networkidle');

      // ── Both parties reach explain-back phase ──
      // Fixture pre-writes ratingPhase='explain-back', so once joiner auto-joins,
      // both should see the active-session UI. This confirms we're testing the
      // post-join state transition, not a join-flow failure.
      await waitForUIUpdate(
        authorPage,
        authorPage.getByText(/waiting for.*clarifying/i).first(),
        30_000,
      );
      await waitForUIUpdate(
        listenerPage,
        listenerPage.getByText(/explain back|paraphrase/i).first(),
        30_000,
      );

      // ── Baseline: joiner is on /live/<code>, not the returnTo ──
      // Proves the subsequent URL change is caused by end-of-session, not by some
      // unrelated redirect.
      expect(listenerPage.url()).toContain(`/live/${fixture.sessionCode}`);
      expect(listenerPage.url()).not.toContain('/letters');

      // ── Creator clicks End Session ──
      const endButton = authorPage.getByRole('button', { name: /end session/i }).first();
      await expect(endButton).toBeVisible({ timeout: 10_000 });
      await endButton.click();

      // ── DB gate: confirm live_state.sessionEnded=true landed ──
      // If this fails, the creator's terminate() call didn't write — which is a
      // different bug (P775-class regression). Isolating it here keeps the primary
      // assertion's failure mode unambiguously a joiner-side issue.
      await waitForDBStateKey(
        'clarity_sessions',
        'live_state',
        'sessionEnded',
        true,
        'id',
        fixture.sessionId,
        15_000,
      );

      // ── PRIMARY ASSERTION: joiner auto-navigates to returnTo ──
      // Window budget: ~10s. Realtime typically delivers in <1s; polling fallback
      // ticks every 1s; P775 measured ~17.9s for the generic helper. The letter-sourced
      // path should match that, plus a navigate() should be synchronous once the
      // state update fires. 10s is generous enough to avoid flake but tight enough
      // that a missing navigate() clearly fails.
      //
      // On failure modes:
      //   - URL stays /live/<code> and page shows "Explain back…" → Layer 2 alive
      //     (detection never fired in letter-sourced flow)
      //   - URL stays /live/<code> and page shows PartnerLeftScreen → Layer 1 alive
      //     (detection fired but no navigate; this is the code-reading hypothesis)
      //   - URL becomes /letters?tab=inbox → bug is not present; either already fixed
      //     or the canary is not exercising the right path
      await expect
        .poll(() => listenerPage.url(), {
          timeout: 10_000,
          intervals: [500, 500, 1000, 1000, 2000, 2000],
          message:
            'Expected joiner to auto-navigate to /letters?tab=inbox after creator ended session, but URL did not change.',
        })
        .toMatch(/\/letters\?tab=inbox/);
    } finally {
      if (fixture) await deleteLetterSessionFixture(fixture);
      if (author) await deleteTestUser(author.user.id).catch(() => {});
      if (listener) await deleteTestUser(listener.user.id).catch(() => {});
    }
  });
});
