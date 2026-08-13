/**
 * @file test-user.ts
 *
 * E2E Test Helpers for User Management
 *
 * These helpers use the Supabase Admin API to:
 * 1. Create test users without email verification
 * 2. Generate auth sessions for E2E tests
 * 3. Clean up test data after tests
 *
 * This allows us to test the full auth flow without needing
 * to click magic links in emails.
 */

import { supabaseAdmin } from './supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { Page } from '@playwright/test';
import { User } from '@supabase/supabase-js';

/** Return type for createTestUser helper */
export interface TestUser {
  user: User;
  email: string;
  slug: string;
  name: string;
}

/**
 * Generates a unique email for testing
 * Using a realistic domain that Supabase won't reject
 * Note: Supabase rejects obvious test domains like @example.com
 */
export function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  // Use gmail.com - a real, valid domain that Supabase accepts
  // These are fake addresses that won't actually receive emails
  // Since we use Admin API to create users, no emails are sent
  return `e2e-test-${timestamp}-${random}@gmail.com`;
}

/**
 * Generates a unique slug for testing
 */
export function generateTestSlug(name: string): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return `${slug}-${timestamp}-${random}`;
}

// Test password for all test users (never used in production)
export const TEST_PASSWORD = 'test-password-12345';

/**
 * P893: Supabase's auth token endpoint is rate-limited per IP. Under a
 * multi-file parallel batch, per-test signInWithPassword calls exceed the
 * limit and fail with "Request rate limit reached", cascading into
 * beforeAll failures ("did not run" blocks). Two mitigations:
 *
 * 1. signInWithRateLimitRetry — backoff-retry on rate-limit errors only
 * 2. a per-worker session cache in setTestSession (same user signs in once
 *    per worker process instead of once per test)
 */
async function signInWithRateLimitRetry(email: string, password: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  // P1043: the old ladder was [2s, 5s, 10s] — 17s total. Measured refill on the token
  // endpoint is ~0.5 tokens/sec (1800/hour, bursting to 30), so 17s buys ~8 tokens shared
  // across every worker retrying at once. Run 4 recorded 1279 retry lines and still hard-failed
  // 395 times. This ladder waits long enough for the bucket to actually refill.
  //
  // Jitter is the load-bearing part, not the length: without it, N workers that trip the
  // limit on the same burst all wake on the same schedule and collide again.
  const delays = [3000, 8000, 20000, 45000, 90000];
  const jitter = (ms: number) => Math.round(ms * (0.75 + Math.random() * 0.5));

  for (let attempt = 0; ; attempt++) {
    // Temp client per attempt — never mutate supabaseAdmin's session (see createTestUser note)
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // P1043: one line per REAL token call (retries included) so a run's auth demand is
    // countable straight from the log — `grep -c 'Auth token call'` — instead of inferred
    // from user-creation counts. This is the quantity the per-IP budget is spent on.
    console.log(`[TEST HELPER] Auth token call for: ${email}`);
    const result = await tempClient.auth.signInWithPassword({ email, password });

    const isRateLimit =
      result.error &&
      (result.error.status === 429 || /rate limit/i.test(result.error.message));

    if (!isRateLimit || attempt >= delays.length) return result;

    const wait = jitter(delays[attempt]);
    console.warn(
      `[TEST HELPER] Auth rate limit hit for ${email} — retrying in ${(wait / 1000).toFixed(1)}s (attempt ${attempt + 1}/${delays.length})`
    );
    await new Promise(resolve => setTimeout(resolve, wait));
  }
}

/**
 * P1043: a service_role client that NOTHING else can reach.
 *
 * The shared `supabaseAdmin` export is not safe for a privileged write. ~170 spec-level
 * call sites do `supabaseAdmin.auth.signInWithPassword(...)` (e.g.
 * e2e/integration/p425-stories-rls.spec.ts:371), which sets that client's in-memory
 * session — from then on its PostgREST requests carry the *user's* JWT instead of the
 * service key, so RLS applies and a profile insert fails with 42501. The old code was
 * immune by accident: it wrote through `upsert_my_profile`, a SECURITY DEFINER RPC.
 *
 * This client is module-local and never has `.auth` called on it, so no spec can mutate
 * it. Caught by a 531-test regression run, not by reasoning — two files failed exactly
 * this way when the write went through `supabaseAdmin`.
 */
const profileWriter = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** P893: minimal user shape injected into the browser session (see setTestSession) */
type CachedSessionUser = {
  id: string;
  email?: string;
  created_at: string;
  app_metadata: object;
  user_metadata: object;
};

/** P893: per-worker session cache — email → session (avoids one token call per test) */
const sessionCache = new Map<
  string,
  {
    access_token: string;
    refresh_token: string;
    userId: string;
    expiresAt: number;
    user: CachedSessionUser;
  }
>();

/**
 * Creates a test user with Supabase Admin API
 * This bypasses email verification so we can test immediately
 */
export async function createTestUser(options: {
  name?: string;
  email?: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
} = {}): Promise<TestUser> {
  const name = options.name || 'Test User';
  const email = options.email || generateTestEmail();
  const slug = generateTestSlug(name);

  console.log(`[TEST HELPER] Creating test user: ${email}`);

  // P893: evict any stale cached session for this email up front — if a prior
  // user with the same email leaked (failed cleanup), its tokens must not
  // survive into this user's tests.
  sessionCache.delete(email);

  // Create auth user with admin API
  // Include password so we can use signInWithPassword in tests
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD, // Set password for test users
    email_confirm: true, // Skip email verification!
    user_metadata: {
      name,
      slug,
      role: options.role || 'Test Engineer',
      linkedin_url: options.linkedinUrl || '',
      reason: options.reason || 'Testing the Clarity Pledge',
      avatar_color: '#4A90E2',
    },
  });

  if (authError) {
    console.error('[TEST HELPER] Failed to create auth user:', authError);
    throw authError;
  }

  if (!authData.user) {
    throw new Error('[TEST HELPER] No user returned from createUser');
  }

  console.log(`[TEST HELPER] Auth user created: ${authData.user.id}`);

  // P1043: write the profile as service_role — NO sign-in.
  //
  // This used to sign the new user in and drive upsert_my_profile + mark_self_verified +
  // set_my_pledge with their own JWT, purely to satisfy the "Users can insert their own
  // profile" RLS policy. That cost one /auth/v1/token call per created user: 2311 of them
  // in the run-4 sweep, against a per-IP budget of 1800/hour that bursts to only 30. The
  // burst is what the suite actually exhausts, and this was ~77% of the demand.
  //
  // service_role bypasses RLS, and guard_profile_trust_columns() constrains only the
  // client roles — `IF current_user IN ('anon', 'authenticated')` — so is_verified /
  // has_pledged can be set directly here (20260605120000_p880_trust_column_guard.sql:68,
  // whose own comment names service_role as "the admin/test path").
  //
  // Verified equivalent, not assumed: .private/p1043-sweep/probe-profile-parity.cjs
  // created one user each way and diffed the resulting rows — all 24 non-identity
  // columns identical, with a control proving the diff was not blind.
  const { error: profileError } = await profileWriter.from('profiles').insert({
    id: authData.user.id,
    email,
    name,
    slug,
    role: options.role || 'Test Engineer',
    linkedin_url: options.linkedinUrl || '',
    reason: options.reason || 'Testing the Clarity Pledge',
    avatar_color: '#4A90E2',
    // Defaults that upsert_my_profile applied server-side; set explicitly to keep the
    // row identical to the pre-P1043 baseline.
    pledge_version: 2,
    accepted_terms_version: 'v1.3', // Skip terms dialog in E2E tests (keep in sync with CURRENT_TERMS_VERSION)
    banner_generation_attempted: false,
    // The verified + pledged baseline createTestUser has always produced. Previously
    // reached via mark_self_verified() then set_my_pledge(); both required the user's JWT.
    is_verified: true,
    has_pledged: true,
  });

  if (profileError) {
    console.error('[TEST HELPER] Failed to create profile:', profileError);
    throw profileError;
  }

  console.log(`[TEST HELPER] Profile created (verified + pledged) for slug: ${slug}`);

  return {
    user: authData.user,
    email,
    slug,
    name,
  };
}

/**
 * Generates a magic link token for a test user
 * This simulates clicking the magic link in email
 */
export async function createMagicLinkToken(email: string): Promise<string> {
  console.log(`[TEST HELPER] Generating magic link for: ${email}`);

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error) {
    console.error('[TEST HELPER] Failed to generate magic link:', error);
    throw error;
  }

  if (!data.properties?.hashed_token) {
    throw new Error('[TEST HELPER] No token in magic link response');
  }

  console.log('[TEST HELPER] Magic link generated successfully');

  // Extract the token from the URL
  const url = new URL(data.properties.action_link);
  const token = url.searchParams.get('token');

  if (!token) {
    throw new Error('[TEST HELPER] Could not extract token from magic link');
  }

  return token;
}

/**
 * Generates a magic link URL via Supabase Admin API (no email sent).
 * Returns the full action_link that, when navigated to, performs token
 * verification and redirects to `redirectTo` with auth tokens in the hash.
 *
 * Use this for E2E tests that need the real Supabase token-exchange flow
 * (UAT-4.x / UAT-5.x: position auto-save after magic link login).
 */
export async function generateMagicLinkUrl(
  email: string,
  redirectTo: string,
): Promise<string> {
  console.log(`[TEST HELPER] Generating magic link URL for: ${email}, redirectTo: ${redirectTo}`);

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });

  if (error) {
    console.error('[TEST HELPER] Failed to generate magic link:', error);
    throw error;
  }

  if (!data.properties?.action_link) {
    throw new Error('[TEST HELPER] No action_link in generateLink response');
  }

  console.log('[TEST HELPER] Magic link URL generated successfully');
  return data.properties.action_link;
}

/**
 * Sets a Supabase session directly in the browser for E2E tests
 * Uses password-based login to get a valid session instantly
 *
 * @param page - Playwright page object
 * @param email - Email of the test user
 */
export async function setTestSession(page: Page, email: string) {
  console.log(`[TEST HELPER] Creating session for: ${email}`);

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;

  // P893: reuse a cached session when one exists with >5 min of life left —
  // one token call per user per worker instead of one per test. This keeps
  // multi-file parallel batches under Supabase's auth rate limit.
  let access_token: string;
  let refresh_token: string;
  let userId: string;
  let sessionUser: CachedSessionUser;

  const cached = sessionCache.get(email);
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) {
    ({ access_token, refresh_token, userId, user: sessionUser } = cached);
    console.log(`[TEST HELPER] Reusing cached session for: ${email}`);
  } else {
    // Temp anon client — never mutate supabaseAdmin's in-memory session.
    // Calling signOut on supabaseAdmin after signInWithPassword would revoke
    // the session server-side, causing auth.getUser() calls in the browser to
    // fail even though the JWT is still in localStorage.
    const { data, error } = await signInWithRateLimitRetry(email, TEST_PASSWORD);

    if (error) {
      console.error('[TEST HELPER] Failed to sign in:', error);
      throw error;
    }

    if (!data.session) {
      throw new Error('[TEST HELPER] No session returned from signInWithPassword');
    }

    ({ access_token, refresh_token } = data.session);
    userId = data.user.id;
    sessionUser = {
      id: data.user.id,
      email: data.user.email,
      created_at: data.user.created_at,
      app_metadata: data.user.app_metadata,
      user_metadata: data.user.user_metadata,
    };
    sessionCache.set(email, {
      access_token,
      refresh_token,
      userId,
      expiresAt: (data.session.expires_at ?? 0) * 1000,
      user: sessionUser,
    });
  }

  // Verify profile exists before proceeding (retry up to 5 times)
  let profileExists = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (profile && !profileError) {
      profileExists = true;
      console.log(`[TEST HELPER] Profile verified for user: ${userId} (attempt ${attempt})`);
      break;
    }

    if (attempt < 5) {
      console.warn(`[TEST HELPER] Profile not found yet, retrying... (attempt ${attempt})`);
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }

  if (!profileExists) {
    throw new Error(`[TEST HELPER] Profile not found after 5 attempts for user: ${userId}`);
  }

  const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
  const session = JSON.stringify({
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    // Include a minimal user object so the Supabase client has the user ID synchronously
    // on init. Without this, the client would need an extra async /auth/v1/user API call
    // to populate the user, creating a race where userId is undefined when components mount
    // (e.g. the story picker requires userId). Only include fields the auth library needs.
    user: {
      ...sessionUser,
      aud: 'authenticated',
      role: 'authenticated',
    },
  });

  // Inject session BEFORE every navigation so the Supabase client finds it
  // synchronously on init — eliminates the loading-state race with auth gates.
  await page.context().addInitScript(
    ({ key, value }) => { localStorage.setItem(key, value); },
    { key: storageKey, value: session }
  );

  console.log('[TEST HELPER] Session injected via addInitScript');

  // Navigate once to confirm the app picks up the session
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/**
 * Deletes a test user and their profile
 * Call this in afterEach to clean up test data
 */
export async function deleteTestUser(userId: string) {
  console.log(`[TEST HELPER] Deleting test user: ${userId}`);

  // P893: evict any cached session for this user — a recreated user with the
  // same email must not inherit stale tokens.
  for (const [email, entry] of sessionCache) {
    if (entry.userId === userId) sessionCache.delete(email);
  }

  // Pre-clean dependent records that might block cascade deletes or user deletion.
  // These are safe to run even if records don't exist (delete with no match is a no-op).
  await supabaseAdmin.from('story_verifications').delete()
    .or(`listener_id.eq.${userId},speaker_id.eq.${userId}`);
  await supabaseAdmin.from('stories').delete().eq('author_id', userId);

  // Delete profile (cascades remaining FK-linked records)
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (profileError) {
    console.warn('[TEST HELPER] Error deleting profile:', profileError);
    // Continue anyway - user might not have profile
  }

  // Delete auth user
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (authError) {
    // 404 = already deleted (idempotent cleanup — not an error)
    if (authError.status === 404) {
      console.warn(`[TEST HELPER] Auth user already deleted: ${userId}`);
    } else {
      // Log but don't throw: auth deletion failures leave orphaned auth rows but
      // don't affect test correctness. The profile and data are already cleaned up.
      console.warn('[TEST HELPER] Auth user deletion failed (non-blocking):', authError.message);
    }
  }

  console.log(`[TEST HELPER] Test user deleted: ${userId}`);
}

/**
 * Deletes a test user by email
 */
export async function deleteTestUserByEmail(email: string) {
  console.log(`[TEST HELPER] Finding user by email: ${email}`);

  // Get user by email
  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) {
    console.error('[TEST HELPER] Failed to list users:', error);
    throw error;
  }

  const user = users.find(u => u.email === email);

  if (!user) {
    console.warn(`[TEST HELPER] No user found with email: ${email}`);
    return;
  }

  await deleteTestUser(user.id);
}

/**
 * Deletes a clarity session by code
 * Call this in afterEach to clean up test sessions
 */
export async function deleteClaritySession(code: string) {
  console.log(`[TEST HELPER] Deleting clarity session: ${code}`);

  // Pre-clean story_verifications that reference this session (FK constraint)
  const { data: session } = await supabaseAdmin
    .from('clarity_sessions')
    .select('id')
    .eq('code', code)
    .single();

  if (session?.id) {
    await supabaseAdmin.from('story_verifications').delete().eq('session_id', session.id);
  }

  const { error } = await supabaseAdmin
    .from('clarity_sessions')
    .delete()
    .eq('code', code);

  if (error) {
    console.warn('[TEST HELPER] Error deleting session:', error);
    // Don't throw - session might already be deleted
  } else {
    console.log(`[TEST HELPER] Session deleted: ${code}`);
  }
}

/**
 * Cleans up all test users (emails starting with "test-")
 * Use with caution!
 */
export async function cleanupAllTestUsers() {
  console.log('[TEST HELPER] Cleaning up ALL test users...');

  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) {
    console.error('[TEST HELPER] Failed to list users:', error);
    throw error;
  }

  const testUsers = users.filter(u => u.email?.startsWith('test-'));

  console.log(`[TEST HELPER] Found ${testUsers.length} test users to delete`);

  for (const user of testUsers) {
    try {
      await deleteTestUser(user.id);
    } catch (err) {
      console.error(`[TEST HELPER] Failed to delete user ${user.id}:`, err);
      // Continue with next user
    }
  }

  console.log('[TEST HELPER] Cleanup complete');
}
