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

import { Browser, BrowserContext, Page } from '@playwright/test';
import { getTestAuthContext } from './auth-context';
import { deleteClaritySession, type TestUser } from './test-user';
import { mockMicPermission } from './test-realtime';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

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
    getTestAuthContext('guest', browser, { name: guestName }),
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
