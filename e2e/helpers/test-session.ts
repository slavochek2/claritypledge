/**
 * @file test-session.ts
 *
 * Reusable helpers for setting up two-party /live session state in E2E tests.
 *
 * # Purpose
 * Composes auth-context, test-user, and test-realtime helpers to create
 * a complete two-party session fixture: two authenticated browser contexts,
 * a session row in the DB, and both pages navigated to /live/{code}.
 *
 * # Usage
 * ```ts
 * import { createTwoPartySession } from './helpers/test-session';
 *
 * test('two users in a live session', async ({ browser }) => {
 *   const session = await createTwoPartySession(browser);
 *   try {
 *     // session.host.page and session.guest.page are ready on /live/{code}
 *     await expect(session.host.page.getByText('Session')).toBeVisible();
 *   } finally {
 *     await session.cleanup();
 *   }
 * });
 * ```
 */

import { Browser, BrowserContext, Page, expect } from '@playwright/test';
import { getTestAuthContext } from './auth-context';
import { deleteClaritySession, type TestUser } from './test-user';
import { mockMicPermission } from './test-realtime';
import { supabaseAdmin } from './supabase-admin';

/**
 * Verifies a page landed on the expected /live/{code} URL after navigation.
 * Uses a positive assertion (URL must contain /live/{code}) rather than a
 * blocklist — catches Google OAuth, app login routes, and any other redirect.
 * Throws immediately with a clear error instead of timing out 20s later.
 */
async function assertNoAuthRedirect(page: Page, sessionCode: string): Promise<void> {
  // Wait for network to settle before checking URL — ensures any auth-triggered
  // client-side redirect has completed, not just started. Using networkidle
  // because client-side redirects (React Router) happen after DOM load.
  // Note: Playwright docs say WebSocket connections don't count for networkidle,
  // so Supabase Realtime won't cause this to hang.
  await page.waitForLoadState('networkidle');
  const url = page.url();
  if (!url.includes(`/live/${sessionCode}`)) {
    throw new Error(
      `[test-session] Auth injection failed — page did not reach /live/${sessionCode}.\n` +
      `Actual URL: ${url}\n` +
      `The localStorage session was not injected before navigation.\n` +
      `This is a test infrastructure bug, not an app bug.`,
    );
  }
}

/**
 * Dismisses the "Updated Terms" dialog if it appears.
 * New test users trigger this on first visit to /live.
 * Baked into session helpers so individual tests don't need to handle it.
 */
async function dismissTermsDialog(page: Page): Promise<void> {
  try {
    await page.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
    await page.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No terms dialog — proceed
  }
}

/** Characters used for session codes — matches prod alphabet (no ambiguous chars) */
const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generates a random 6-character session code using the prod-safe alphabet. */
function generateSessionCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)];
  }
  return code;
}

/** Result of createTwoPartySession — everything needed for a two-party E2E test. */
export interface TwoPartySession {
  host: { context: BrowserContext; page: Page; user: TestUser };
  guest: { context: BrowserContext; page: Page; user: TestUser };
  sessionCode: string;
  sessionId: string;
  /**
   * Call in `finally` block or `afterEach`.
   * Deletes the session, closes both browser contexts, and deletes both test users.
   */
  cleanup: () => Promise<void>;
}

/** Options for createTwoPartySession */
export interface TwoPartySessionOptions {
  /** Custom host name (default: 'E2E Host') */
  hostName?: string;
  /** Custom guest name (default: 'E2E Guest') */
  guestName?: string;
  /** Skip navigating pages to /live/{code} (default: false) */
  skipNavigation?: boolean;
}

/**
 * Creates a complete two-party /live session fixture.
 *
 * 1. Creates two authenticated browser contexts (host + guest)
 * 2. Mocks mic permission on both pages
 * 3. Inserts a session row into the DB
 * 4. Navigates both pages to /live/{code}?skipMicCheck=true
 *
 * @param browser - Playwright Browser fixture
 * @param options - Optional overrides
 */
export async function createTwoPartySession(
  browser: Browser,
  options: TwoPartySessionOptions = {},
): Promise<TwoPartySession> {
  const hostName = options.hostName ?? 'E2E Host';
  const guestName = options.guestName ?? 'E2E Guest';

  // Step 1: Create two authenticated browser contexts in parallel.
  const [hostAuth, guestAuth] = await Promise.all([
    getTestAuthContext('host', browser, { name: hostName }),
    getTestAuthContext('host', browser, { name: guestName }),
  ]);

  // Step 2: Create pages from both contexts.
  const hostPage = await hostAuth.context.newPage();
  const guestPage = await guestAuth.context.newPage();

  // Step 3: Mock mic permission on both pages.
  await Promise.all([
    mockMicPermission(hostPage),
    mockMicPermission(guestPage),
  ]);

  // Step 4: Generate a unique session code and insert into DB.
  const sessionCode = generateSessionCode();

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: sessionCode,
      creator_name: hostName,
      creator_profile_id: hostAuth.user.user.id,
      joiner_name: guestName,
      joiner_profile_id: guestAuth.user.user.id,
      live_state: { checksCount: 0 },
      last_activity_at: new Date().toISOString(),
    })
    .select('id, code')
    .single();

  if (sessionError || !session) {
    // Clean up auth contexts before throwing
    await hostAuth.cleanup();
    await guestAuth.cleanup();
    throw new Error(
      `[test-session] Failed to create session in DB: ${sessionError?.message ?? 'no data returned'}`,
    );
  }

  // Step 5: Navigate both pages to the live session (unless skipped).
  if (!options.skipNavigation) {
    await Promise.all([
      hostPage.goto(`/live/${sessionCode}?skipMicCheck=true`),
      guestPage.goto(`/live/${sessionCode}?skipMicCheck=true`),
    ]);

    // Step 5a: Verify auth injection worked (fail fast instead of mystery timeout).
    await assertNoAuthRedirect(hostPage, sessionCode);
    await assertNoAuthRedirect(guestPage, sessionCode);

    // Step 5b: Dismiss "Updated Terms" dialog on both pages.
    await Promise.all([
      dismissTermsDialog(hostPage),
      dismissTermsDialog(guestPage),
    ]);
  }

  // Step 6: Build cleanup function.
  const cleanup = async () => {
    await deleteClaritySession(sessionCode);
    // auth-context cleanup closes the context AND deletes the test user
    await hostAuth.cleanup();
    await guestAuth.cleanup();
  };

  return {
    host: { context: hostAuth.context, page: hostPage, user: hostAuth.user },
    guest: { context: guestAuth.context, page: guestPage, user: guestAuth.user },
    sessionCode,
    sessionId: session.id,
    cleanup,
  };
}

/**
 * Creates a two-party session that mimics the REAL join flow:
 *
 * 1. Creates session with host only (no joiner_name in DB)
 * 2. Navigates host to /live/{code} — host's Realtime subscription establishes
 * 3. Waits for host page to settle (session UI visible)
 * 4. THEN navigates guest to /live/{code} — simulates late join
 * 5. Waits for guest page to settle
 *
 * This exercises the real subscription timing path that createTwoPartySession
 * bypasses by pre-inserting both users and navigating simultaneously.
 *
 * Use this for tests that need to verify:
 * - Realtime subscription establishment ordering
 * - hasJoinerRef guard behavior
 * - State delivery from host to late-joining guest
 *
 * @param browser - Playwright Browser fixture
 * @param options - Optional overrides (same as createTwoPartySession)
 */
export async function createTwoPartySessionRealistic(
  browser: Browser,
  options: TwoPartySessionOptions = {},
): Promise<TwoPartySession> {
  const hostName = options.hostName ?? 'E2E Host';
  const guestName = options.guestName ?? 'E2E Guest';

  // Step 1: Create two authenticated browser contexts in parallel.
  const [hostAuth, guestAuth] = await Promise.all([
    getTestAuthContext('host', browser, { name: hostName }),
    getTestAuthContext('guest', browser, { name: guestName }),
  ]);

  const hostPage = await hostAuth.context.newPage();
  const guestPage = await guestAuth.context.newPage();

  await Promise.all([
    mockMicPermission(hostPage),
    mockMicPermission(guestPage),
  ]);

  // Step 2: Insert session with HOST ONLY — no joiner yet.
  // This mimics real behavior where the host creates the session and the
  // guest hasn't joined yet.
  const sessionCode = generateSessionCode();

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: sessionCode,
      creator_name: hostName,
      creator_profile_id: hostAuth.user.user.id,
      // No joiner_name or joiner_profile_id — guest joins later
      live_state: { checksCount: 0 },
      last_activity_at: new Date().toISOString(),
    })
    .select('id, code')
    .single();

  if (sessionError || !session) {
    await hostAuth.cleanup();
    await guestAuth.cleanup();
    throw new Error(
      `[test-session] Failed to create realistic session: ${sessionError?.message ?? 'no data returned'}`,
    );
  }

  if (!options.skipNavigation) {
    // Step 3: Navigate HOST first. Wait for session UI to settle.
    await hostPage.goto(`/live/${sessionCode}?skipMicCheck=true`);
    await assertNoAuthRedirect(hostPage, sessionCode);
    await dismissTermsDialog(hostPage);

    // Wait for meaningful session UI to render — proves the page loaded the session
    // and the Realtime subscription hook has mounted. The "Invite" text or session
    // code only renders after the session data is loaded and the component tree is
    // fully mounted (including the useEffect that establishes the Realtime channel).
    await expect(
      hostPage.locator(`text=/${sessionCode}|Invite|Speak|Waiting/i`).first()
    ).toBeVisible({ timeout: 15000 });

    // Step 4: NOW navigate guest — simulates late join.
    // The guest joining will update joiner_name in DB, which the host
    // should receive via Realtime/drift polling.
    await guestPage.goto(`/live/${sessionCode}?skipMicCheck=true`);
    await assertNoAuthRedirect(guestPage, sessionCode);
    await dismissTermsDialog(guestPage);

    await expect(guestPage.locator('body')).toBeVisible({ timeout: 10000 });
  }

  const cleanup = async () => {
    await deleteClaritySession(sessionCode);
    await hostAuth.cleanup();
    await guestAuth.cleanup();
  };

  return {
    host: { context: hostAuth.context, page: hostPage, user: hostAuth.user },
    guest: { context: guestAuth.context, page: guestPage, user: guestAuth.user },
    sessionCode,
    sessionId: session.id,
    cleanup,
  };
}

/** Result of createTestSessionInDB — a DB-only session fixture. */
export interface TestSessionInDB {
  sessionId: string;
  sessionCode: string;
  /**
   * Call in `finally` block or `afterEach`.
   * Deletes the session row from the DB.
   */
  cleanup: () => Promise<void>;
}

/**
 * Creates a session row in the DB without any browser contexts.
 *
 * Useful for testing banners, rejoin prompts, session history, etc.
 * where you just need a session to exist in the DB (and optionally
 * reference it via localStorage).
 *
 * @param hostProfileId - Profile ID of the session creator
 * @param guestName     - Display name for the joiner
 * @param options       - Optional overrides
 */
export async function createTestSessionInDB(
  hostProfileId: string,
  guestName: string,
  options: {
    hostName?: string;
    guestProfileId?: string;
  } = {},
): Promise<TestSessionInDB> {
  const sessionCode = generateSessionCode();
  const hostName = options.hostName ?? 'Test Host';

  const { data: session, error } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: sessionCode,
      creator_name: hostName,
      creator_profile_id: hostProfileId,
      joiner_name: guestName,
      ...(options.guestProfileId ? { joiner_profile_id: options.guestProfileId } : {}),
      live_state: { checksCount: 0 },
      last_activity_at: new Date().toISOString(),
    })
    .select('id, code')
    .single();

  if (error || !session) {
    throw new Error(
      `[test-session] Failed to create DB-only session: ${error?.message ?? 'no data returned'}`,
    );
  }

  const cleanup = async () => {
    await deleteClaritySession(sessionCode);
  };

  return {
    sessionId: session.id,
    sessionCode: session.code,
    cleanup,
  };
}
