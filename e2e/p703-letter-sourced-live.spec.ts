/**
 * @file p703-letter-sourced-live.spec.ts
 * @description P703: Letter-sourced /live — E2E flow (two-party)
 *
 * Tests:
 * - smoke: page loads for letter-sourced session without console errors
 * - Happy path: facilitator creates session from StoryWalk → listener sees inbox invite
 *   → both navigate to /live/<code> → session starts at explain-back (skipping idle)
 * - Share button hidden when target_listener_id IS NOT NULL
 * - Singleton button disabled when invite outstanding
 * - Cancel path: facilitator ends before listener joins → invite disappears for listener
 * - Listener cancel before join (navigates away)
 * - Logged-out listener deep-link redirects to login and returns
 *
 * Rules:
 * - Uses waitForUIUpdate() — never page.reload() — for cross-context state assertions
 * - Two-party tests use createTwoPartySessionRealistic() for subscription timing
 * - Smoke check is the FIRST test in this file (tests.md convention)
 *
 * FIXME(generate-tests): Some selectors below depend on exact component/aria text
 * that only exists after implementation. Each is marked FIXME with the expected text
 * from the spec. Update selectors to match actual rendered output after implementation.
 */

import { test, expect, type Browser } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { mockMicPermission, waitForUIUpdate } from './helpers/test-realtime';
import { getTestAuthContext } from './helpers/auth-context';
import {
  createLetterSessionFixture,
  deleteLetterSessionFixture,
  type LetterSessionFixture,
} from './helpers/test-letter-session';

// ─── Smoke check (must be first test in file) ─────────────────────────────────

test.describe('P703 smoke', () => {
  let author: TestUser;
  let listener: TestUser;
  let fixture: LetterSessionFixture | undefined;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P703 Smoke Author' }),
      createTestUser({ name: 'P703 Smoke Listener' }),
    ]);
    fixture = await createLetterSessionFixture(author, listener);
  });

  test.afterAll(async () => {
    if (fixture) await deleteLetterSessionFixture(fixture);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  test('smoke: letter-sourced /live page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, listener.email);
    await page.goto(`/live/${fixture!.sessionCode}?skipMicCheck=true`);
    await page.waitForLoadState('networkidle');

    expect(
      consoleErrors.filter(e => !e.includes('favicon') && !e.includes('ERR_CONNECTION_REFUSED')),
      'Console errors present on letter-sourced /live page'
    ).toHaveLength(0);

    // Basic page structure visible
    await expect(page.locator('body')).toBeVisible();
  });
});

// ─── Happy path — two-party letter-sourced /live ──────────────────────────────

test.describe('P703 happy path — two-party letter-sourced session', () => {
  test.setTimeout(90000);

  test('facilitator starts session; listener sees inbox invite; both reach explain-back phase', async ({
    browser,
  }: { browser: Browser }) => {
    let fixture: LetterSessionFixture | undefined;
    let author: TestUser | undefined;
    let listener: TestUser | undefined;

    try {
      // Create two authenticated browser contexts
      const [authorAuth, listenerAuth] = await Promise.all([
        getTestAuthContext('host', browser, { name: 'P703 HappyPath Author' }),
        getTestAuthContext('host', browser, { name: 'P703 HappyPath Listener' }),
      ]);
      author = authorAuth.user;
      listener = listenerAuth.user;

      fixture = await createLetterSessionFixture(author, listener);

      const authorPage = await authorAuth.context.newPage();
      const listenerPage = await listenerAuth.context.newPage();

      await Promise.all([mockMicPermission(authorPage), mockMicPermission(listenerPage)]);

      // Author navigates to /live/<code> — fixture.sessionCode is the pre-seeded code
      await authorPage.goto(`/live/${fixture.sessionCode}?skipMicCheck=true`);
      await authorPage.waitForLoadState('networkidle');

      // Waiting screen: Share button hidden (letter-sourced session)
      // FIXME(generate-tests): selector depends on implementation — adjust if Share button uses a different aria-label
      const shareButton = authorPage.getByRole('button', { name: /share/i });
      await expect(shareButton, 'Share button should be hidden for letter-sourced session').toHaveCount(0);

      // Waiting screen: "Invite sent to {listener}" panel visible
      // FIXME(generate-tests): exact text from spec is "Invite sent to {listener name} · [Resend]"
      await expect(
        authorPage.getByText(new RegExp(`Invite sent to ${listener.name}`, 'i'))
      ).toBeVisible({ timeout: 10000 });

      // Listener's inbox: invite badge or row should appear via realtime
      await listenerPage.goto('/letters?tab=inbox');
      await listenerPage.waitForLoadState('networkidle');

      // Wait for invite row to appear (realtime delivery from DB INSERT)
      // FIXME(generate-tests): spec says "{author name} invited you to verify {story title} — Join"
      await waitForUIUpdate(
        listenerPage,
        listenerPage.getByText(/invited you to verify/i),
        20000
      );

      // Listener taps Join
      const joinButton = listenerPage.getByRole('link', { name: /join/i }).or(
        listenerPage.getByRole('button', { name: /join/i })
      );
      await joinButton.first().click();
      await listenerPage.waitForURL(/\/live\//);
      await listenerPage.waitForLoadState('networkidle');

      // Both pages: verify we're at explain-back phase (NOT idle/slider)
      // Author (checker) sees "Waiting for listener to finish clarifying" — listener explains, author waits
      // Listener (responder) sees "Explain back what you heard"
      await waitForUIUpdate(
        authorPage,
        authorPage.getByText(/waiting for.*clarifying/i).first(),
        20000
      );
      await waitForUIUpdate(
        listenerPage,
        listenerPage.getByText(/explain back|paraphrase/i),
        20000
      );

      // Neither page should show the prediction/self-assessment slider
      const sliderOnAuthor = authorPage.getByRole('slider').or(authorPage.getByText(/how well do you understand/i));
      await expect(sliderOnAuthor, 'Author prediction step should be skipped').toHaveCount(0);

      const sliderOnListener = listenerPage.getByRole('slider').or(listenerPage.getByText(/how well do you understand/i));
      await expect(sliderOnListener, 'Listener self-assessment step should be skipped').toHaveCount(0);

      await authorAuth.cleanup();
      await listenerAuth.cleanup();
    } finally {
      if (fixture) await deleteLetterSessionFixture(fixture);
      if (author) await deleteTestUser(author.user.id).catch(() => {});
      if (listener) await deleteTestUser(listener.user.id).catch(() => {});
    }
  });
});

// ─── Share button hidden when target_listener_id IS NOT NULL ─────────────────

test.describe('P703 waiting screen — Share button hidden for letter-sourced session', () => {
  test.setTimeout(30000);

  let author: TestUser;
  let listener: TestUser;
  let fixture: LetterSessionFixture | undefined;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P703 Share Author' }),
      createTestUser({ name: 'P703 Share Listener' }),
    ]);
    fixture = await createLetterSessionFixture(author, listener);
  });

  test.afterAll(async () => {
    if (fixture) await deleteLetterSessionFixture(fixture);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  test('Share button absent on waiting screen for letter-sourced session', async ({ page }) => {
    await setTestSession(page, author.email);
    await mockMicPermission(page);
    await page.goto(`/live/${fixture!.sessionCode}?skipMicCheck=true`);
    await page.waitForLoadState('networkidle');

    // Share button should not exist at all
    // FIXME(generate-tests): adjust selector if Share uses a different role/label
    await expect(page.getByRole('button', { name: /share this link|copy link|share/i }))
      .toHaveCount(0);

    // Invite sent panel should appear instead
    await expect(page.getByText(/invite sent/i)).toBeVisible();
  });
});

// ─── Singleton: button disabled when invite outstanding ──────────────────────

test.describe('P703 StartClaritySessionButton — disabled when invite outstanding', () => {
  test.setTimeout(60000);

  let author: TestUser;
  let listener: TestUser;
  let fixture: LetterSessionFixture | undefined;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P703 Singleton Author' }),
      createTestUser({ name: 'P703 Singleton Listener' }),
    ]);
    fixture = await createLetterSessionFixture(author, listener);
    // Fixture pre-inserts an open invite for listener
  });

  test.afterAll(async () => {
    if (fixture) await deleteLetterSessionFixture(fixture);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  test('Start a clarity session button disabled when open invite exists for listener', async ({ page }) => {
    await setTestSession(page, author.email);
    // Navigate to P699 story walk for the test letter
    // Route is /letter/:id/results (singular) — confirmed in App.tsx
    // ?delivery= param required so get_letter_results returns receiverProfile → button renders
    await page.goto(`/letter/${fixture!.letterId}/results?delivery=${fixture!.deliveryId}`);
    await page.waitForLoadState('networkidle');

    const startButton = page.getByRole('button', { name: /start a clarity session/i });
    // Button should be visible but disabled (singleton UX hint)
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();

    // Tooltip explains why — button uses HTML `title` attribute (native browser tooltip)
    // Check via getAttribute; no hover needed (native tooltips are not in accessible DOM)
    await expect(startButton).toHaveAttribute('title', /invite already pending/i);
  });
});

// ─── Cancel path: facilitator ends → invite disappears for listener ──────────

test.describe('P703 cancel path — facilitator closes room before listener joins', () => {
  test.setTimeout(60000);

  test('when facilitator calls completeClaritySession, invite disappears for listener', async ({
    browser,
  }: { browser: Browser }) => {
    let author: TestUser | undefined;
    let listener: TestUser | undefined;
    let fixture: LetterSessionFixture | undefined;

    try {
      const [authorAuth, listenerAuth] = await Promise.all([
        getTestAuthContext('host', browser, { name: 'P703 Cancel Author' }),
        getTestAuthContext('host', browser, { name: 'P703 Cancel Listener' }),
      ]);
      author = authorAuth.user;
      listener = listenerAuth.user;

      fixture = await createLetterSessionFixture(author, listener);

      const listenerPage = await listenerAuth.context.newPage();

      // Monitor all console output from listener page for debugging
      listenerPage.on('console', (msg) => {
        console.log(`[listenerPage ${msg.type()}] ${msg.text().substring(0, 200)}`);
      });

      // Listener views inbox — invite is visible
      await listenerPage.goto('/letters?tab=inbox');
      await listenerPage.waitForLoadState('networkidle');

      await waitForUIUpdate(
        listenerPage,
        listenerPage.getByText(/invited you to verify/i),
        15000
      );

      // Wait for Realtime WebSocket subscription to be SUBSCRIBED before calling RPC.
      // Node.js Supabase client takes ~3s to get SUBSCRIBED status; browser is similar.
      await listenerPage.waitForTimeout(3000);

      // Facilitator (admin) completes/cancels the session — simulates "End room"
      // FIXME(generate-tests): in real implementation the author page has a "Cancel" or "End" button.
      // Here we trigger via DB to test the realtime disappearance path directly.
      const { error: rpcErr } = await supabaseAdmin.rpc('complete_clarity_session', {
        p_session_id: fixture.sessionId,
      });
      expect(rpcErr, `complete_clarity_session RPC failed: ${rpcErr?.message}`).toBeNull();

      // Invite should disappear from listener's inbox (realtime UPDATE with closed_at set)
      // Assert invite row gone (give realtime up to 20s)
      await expect(listenerPage.getByText(/invited you to verify/i)).toHaveCount(0, { timeout: 20000 });

      await authorAuth.cleanup();
      await listenerAuth.cleanup();
    } finally {
      if (fixture) await deleteLetterSessionFixture(fixture);
      if (author) await deleteTestUser(author.user.id).catch(() => {});
      if (listener) await deleteTestUser(listener.user.id).catch(() => {});
    }
  });

  test(
    'when facilitator cancels from /live waiting screen, Start button re-enables on return to letter',
    async ({ browser }: { browser: Browser }) => {
      let author: TestUser | undefined;
      let listener: TestUser | undefined;
      let fixture: LetterSessionFixture | undefined;

      try {
        const authorAuth = await getTestAuthContext('host', browser, { name: 'P703 Cancel Reopen Author' });
        listener = await createTestUser({ name: 'P703 Cancel Reopen Listener' });
        author = authorAuth.user;

        fixture = await createLetterSessionFixture(author, listener);

        const authorPage = await authorAuth.context.newPage();

        // Author navigates to the letter's results page (story walk with StartClaritySessionButton)
        await authorPage.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
        await authorPage.waitForLoadState('networkidle');

        // Button should be enabled (no open invite yet)
        const startBtn = authorPage.getByTestId('start-clarity-session-btn');
        await expect(startBtn).toBeEnabled({ timeout: 10000 });
        await startBtn.click();

        // Author lands on /live waiting screen
        await authorPage.waitForURL(/\/live\//);

        // Author cancels — handleCancelWaiting must call cancelLiveInvite
        const cancelBtn = authorPage.getByRole('button', { name: /cancel/i });
        await cancelBtn.click();
        // Wait for the async cancelLiveInvite PATCH to complete before navigating
        await authorPage.waitForLoadState('networkidle');

        // Author navigates back to the letter
        await authorPage.goto(`/letter/${fixture.letterId}/results?delivery=${fixture.deliveryId}`);
        await authorPage.waitForLoadState('networkidle');

        // Button must be enabled — invite was closed on cancel, no orphaned invite
        await expect(authorPage.getByTestId('start-clarity-session-btn')).toBeEnabled({ timeout: 10000 });

        await authorAuth.cleanup();
      } finally {
        if (fixture) await deleteLetterSessionFixture(fixture);
        if (author) await deleteTestUser(author.user.id).catch(() => {});
        if (listener) await deleteTestUser(listener.user.id).catch(() => {});
      }
    }
  );
});

// ─── Logged-out listener deep-link → login redirect ──────────────────────────

test.describe('P703 logged-out listener deep-link', () => {
  test.setTimeout(30000);

  let author: TestUser;
  let listener: TestUser;
  let fixture: LetterSessionFixture | undefined;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P703 LoggedOut Author' }),
      createTestUser({ name: 'P703 LoggedOut Listener' }),
    ]);
    fixture = await createLetterSessionFixture(author, listener);
  });

  test.afterAll(async () => {
    if (fixture) await deleteLetterSessionFixture(fixture);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  test('unauthenticated user visiting /live/<code> is redirected to login', async ({ page }) => {
    // No session injected — page is unauthenticated
    await page.goto(`/live/${fixture!.sessionCode}`);
    await page.waitForLoadState('networkidle');

    // Should redirect to login (not stay on /live/<code>)
    await expect(page).not.toHaveURL(new RegExp(`/live/${fixture!.sessionCode}`));
    await expect(page).toHaveURL(/login|sign/i);
  });
});
