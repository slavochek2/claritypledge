/**
 * @file auth-context.ts
 *
 * Playwright Auth Context Helper — P496: E2E Programmatic Auth Bypass
 *
 * # Purpose
 * Returns a Playwright `BrowserContext` with valid Supabase auth tokens
 * pre-injected into localStorage, bypassing Google OAuth entirely.
 *
 * # How it works
 * 1. Creates a temporary test user via Supabase Admin API (no email verification)
 * 2. Signs the user in with password to obtain a valid JWT (not service_role)
 * 3. Injects the session into a new BrowserContext via `addInitScript`
 *    so the Supabase client finds valid tokens synchronously on every page load
 * 4. Returns the context along with user info and a cleanup function
 *
 * # RLS behaviour
 * Test execution uses the user's own JWT (not service_role), so all RLS
 * policies are exercised exactly as they would be in production.
 *
 * # Usage
 * ```ts
 * import { test, expect } from '@playwright/test';
 * import { getTestAuthContext } from './helpers/auth-context';
 *
 * test('authenticated user can access /live', async ({ browser }) => {
 *   const { context, user, cleanup } = await getTestAuthContext('host', browser);
 *   const page = await context.newPage();
 *
 *   try {
 *     await page.goto('/live');
 *     await expect(page).toHaveURL('/live');
 *   } finally {
 *     await cleanup(); // deletes test user + closes context
 *   }
 * });
 * ```
 *
 * # Role semantics
 * - `'host'`  — verified user (is_verified: true). Can access /live, /agreements, /stories.
 * - `'guest'` — authenticated but not verified (is_verified: false). Triggers verification
 *               gates where they exist (e.g. cannot create stories or points).
 */

import { createClient } from '@supabase/supabase-js';
import { Browser, BrowserContext } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './test-user';

/** All test users are created with this password by createTestUser */
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'e2e-test-pw';

/** Result returned by getTestAuthContext */
export interface TestAuthContext {
  /** Playwright BrowserContext with auth tokens pre-injected into localStorage */
  context: BrowserContext;
  /** The test user that was created and authenticated */
  user: TestUser;
  /**
   * Call this in your test's `finally` block or `afterEach`.
   * Deletes the test user from Supabase and closes the browser context.
   */
  cleanup: () => Promise<void>;
}

/**
 * Creates a Playwright BrowserContext pre-authenticated as a test user.
 *
 * @param role     - `'host'` (verified) or `'guest'` (not verified)
 * @param browser  - Playwright Browser fixture (`{ browser }` in test args)
 * @param options  - Optional overrides for test user properties
 *
 * @example
 * ```ts
 * test('host sees start session button', async ({ browser }) => {
 *   const { context, cleanup } = await getTestAuthContext('host', browser);
 *   const page = await context.newPage();
 *   try {
 *     await page.goto('/live');
 *     await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
 *   } finally {
 *     await cleanup();
 *   }
 * });
 * ```
 */
export async function getTestAuthContext(
  role: 'host' | 'guest',
  browser: Browser,
  options: {
    name?: string;
    /** Extra user_metadata fields passed to createTestUser */
    userRole?: string;
  } = {},
): Promise<TestAuthContext> {
  const label = role === 'host' ? 'P496 Host' : 'P496 Guest';
  const userName = options.name ?? label;

  // Step 1: Create a test user via Admin API (no email verification required).
  // createTestUser always sets is_verified: true in the profile. For the 'guest'
  // role we patch that to false after creation.
  const testUser = await createTestUser({
    name: userName,
    role: options.userRole ?? (role === 'host' ? 'Founder' : 'Observer'),
  });

  if (role === 'guest') {
    // Patch is_verified to false so the guest hasn't completed verification.
    // Use supabaseAdmin (service_role) to bypass the "own profile only" RLS write policy.
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await adminClient
      .from('profiles')
      .update({ is_verified: false })
      .eq('id', testUser.user.id);
  }

  // Step 2: Sign in with password to get a real user JWT.
  // Using a separate anon client to avoid mutating any shared admin client state.
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

  const signinClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signInData, error: signInError } = await signinClient.auth.signInWithPassword({
    email: testUser.email,
    password: TEST_PASSWORD,
  });

  if (signInError || !signInData?.session) {
    await deleteTestUser(testUser.user.id);
    throw new Error(
      `[auth-context] Failed to sign in test user (${role}): ${signInError?.message}`,
    );
  }

  const { access_token, refresh_token } = signInData.session;

  // Step 3: Build the localStorage session object that the Supabase JS client expects.
  // The key format is: sb-{project-ref}-auth-token
  // Project ref is the subdomain of the Supabase URL.
  const projectRef = supabaseUrl.split('//')[1].split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  const sessionPayload = JSON.stringify({
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    // Include minimal user object so Supabase client has user.id synchronously on init.
    // Without this the client needs an extra async /auth/v1/user round-trip, creating
    // a race condition where userId is undefined when auth-gated components first render.
    user: {
      id: signInData.user.id,
      email: signInData.user.email,
      created_at: signInData.user.created_at,
      app_metadata: signInData.user.app_metadata,
      user_metadata: signInData.user.user_metadata,
      aud: 'authenticated',
      role: 'authenticated',
    },
  });

  // Step 4: Create a new BrowserContext and inject the session before every navigation.
  // addInitScript runs before the page's own scripts on every new page in this context,
  // so the Supabase client always finds the session in localStorage synchronously.
  const context = await browser.newContext();
  await context.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: storageKey, value: sessionPayload },
  );

  // Step 5: Build the cleanup function — always call this to avoid orphaned test data.
  const cleanup = async () => {
    await context.close();
    await deleteTestUser(testUser.user.id);
  };

  return { context, user: testUser, cleanup };
}
