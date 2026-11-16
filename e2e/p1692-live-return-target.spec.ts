/**
 * @file p1692-live-return-target.spec.ts
 *
 * P1692 — on the live page, `returnTo` is a target only when the shared redirect check accepts it. An entry page
 * (sign-in, sign-up, the sign-in landing pages) is never a target, so a `returnTo` that names one behaves like a
 * missing `returnTo`: when the other person ends the session, the joiner stays on the live page and sees
 * "Session ended".
 *
 * This is the two-party browser run that .claude/rules/live.md requires for a live-page change. It drives the real
 * UI (the creator clicks End Session) and reads the joiner's page through the app's own delivery, never a reload.
 * The kept path (an allowed `returnTo` is followed) is e2e/p779-reproduce.spec.ts, with the same fixture.
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

test.describe('P1692 — the live page follows `returnTo` only to an allowed target', () => {
  test.setTimeout(120_000);

  test('a returnTo that names an entry page is ignored: the joiner stays on the live page when the session ends', async ({
    browser,
  }: { browser: Browser }) => {
    let fixture: LetterSessionFixture | undefined;
    let author: TestUser | undefined;
    let listener: TestUser | undefined;

    try {
      const [authorAuth, listenerAuth] = await Promise.all([
        getTestAuthContext('host', browser, { name: 'P1692 Return Author' }),
        getTestAuthContext('host', browser, { name: 'P1692 Return Listener' }),
      ]);
      author = authorAuth.user;
      listener = listenerAuth.user;

      fixture = await createLetterSessionFixture(author, listener);

      const authorPage = await authorAuth.context.newPage();
      const listenerPage = await listenerAuth.context.newPage();
      await Promise.all([mockMicPermission(authorPage), mockMicPermission(listenerPage)]);

      // The author's own address is the ordinary one; only the joiner's carries the entry page.
      const allowed = encodeURIComponent('/letters?tab=inbox');
      const entryPage = encodeURIComponent('/login');

      await authorPage.goto(`/live/${fixture.sessionCode}?skipMicCheck=true&returnTo=${allowed}`);
      await authorPage.waitForLoadState('networkidle');

      await listenerPage.goto(`/live/${fixture.sessionCode}?skipMicCheck=true&returnTo=${entryPage}`);
      await listenerPage.waitForLoadState('networkidle');

      // Both are in the session (the fixture starts at the explain-back phase).
      await waitForUIUpdate(authorPage, authorPage.getByText(/waiting for.*clarifying/i).first(), 30_000);
      await waitForUIUpdate(listenerPage, listenerPage.getByText(/explain back|paraphrase/i).first(), 30_000);
      expect(listenerPage.url()).toContain(`/live/${fixture.sessionCode}`);

      const endButton = authorPage.getByRole('button', { name: /end session/i }).first();
      await expect(endButton).toBeVisible({ timeout: 10_000 });
      await endButton.click();

      // The end was written, so what follows is about the joiner's page and nothing else.
      await waitForDBStateKey('clarity_sessions', 'live_state', 'sessionEnded', true, 'id', fixture.sessionId, 15_000);

      // The joiner's page noticed the end (so "stayed" is not "never noticed") and is still the live page. Read
      // together, through the app's own delivery, so a failure says which of the two did not hold.
      const livePath = `/live/${fixture.sessionCode}`;
      const joiner = async () => ({
        onLivePage: new URL(listenerPage.url()).pathname === livePath,
        seesSessionEnded: await listenerPage.getByText('Session ended').first().isVisible(),
      });
      await expect
        .poll(joiner, {
          timeout: 20_000,
          intervals: [500, 500, 1000, 1000, 2000],
          message: 'After the session ended the joiner should still be on the live page, seeing "Session ended".',
        })
        .toEqual({ onLivePage: true, seesSessionEnded: true });

      // … and it stays there: it did not follow the entry page a moment later.
      await listenerPage.waitForTimeout(3_000);
      expect(await joiner()).toEqual({ onLivePage: true, seesSessionEnded: true });
    } finally {
      if (fixture) await deleteLetterSessionFixture(fixture);
      if (author) await deleteTestUser(author.user.id).catch(() => {});
      if (listener) await deleteTestUser(listener.user.id).catch(() => {});
    }
  });
});
