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
import { Page, test, expect } from '@playwright/test';
import { User } from '@supabase/supabase-js';
import { isLocalSupabaseUrl, isTestProjectUrl } from './e2e-namespace';
import { currentRunId, recordCreatedUser } from './run-ledger';

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

interface CreateTestUserOptions {
  name?: string;
  email?: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
}

/** What createUser stores as user_metadata for a test user (a claimed pooled user gets the same). */
function testUserMetadata(name: string, slug: string, options: CreateTestUserOptions) {
  return {
    name,
    slug,
    role: options.role || 'Test Engineer',
    linkedin_url: options.linkedinUrl || '',
    reason: options.reason || 'Testing the Clarity Pledge',
    avatar_color: '#4A90E2',
  };
}

/** The profile row every test user starts with, fresh or claimed from the pool (id and email aside). */
function testProfileRow(name: string, slug: string, options: CreateTestUserOptions) {
  return {
    name,
    slug,
    role: options.role || 'Test Engineer',
    linkedin_url: options.linkedinUrl || '',
    reason: options.reason || 'Testing the Clarity Pledge',
    avatar_color: '#4A90E2',
    // Defaults that upsert_my_profile applied server-side; set explicitly to keep the
    // row identical to the pre-P1043 baseline.
    pledge_version: 2,
    accepted_terms_version: 'v1.5', // Skip terms dialog in E2E tests (keep in sync with CURRENT_TERMS_VERSION)
    banner_generation_attempted: false,
    // The verified + pledged baseline createTestUser has always produced. Previously
    // reached via mark_self_verified() then set_my_pledge(); both required the user's JWT.
    is_verified: true,
    has_pledged: true,
  };
}

/**
 * P1532: a worker-scoped pool of test users.
 *
 * A full run used to mint ~1,500 users and delete each again: a GoTrue create, a profile insert,
 * usually a GoTrue sign-in, and the delete, each with its own request and log lines on the free-plan
 * quota the test project shares with production. Now deleteTestUser RELEASES a user this worker
 * created (e2e_release_test_user deletes every public row that references it, so it is invisible
 * while it waits), and the next createTestUser() in the same worker CLAIMS it: one request, and the
 * cached sign-in is reused while its session exists. The claim refuses any user whose auth state no
 * longer matches a fresh one (supabase/migrations/20261021130000_p1532_e2e_user_pool.sql lists the
 * checks); that user is left for the teardown and a fresh one is created.
 *
 * Only createTestUser() WITHOUT an email claims: a caller that passes an email keeps that email.
 * The pool is on only inside a Playwright run on the test project (the run ledger exists, so global
 * teardown deletes every user the run created, pooled ones included). Set P1532_POOL=off to opt out.
 */
const releasedPool: Array<{ id: string; email: string }> = [];
/** Users this worker created or claimed, by id: only these are released instead of deleted. */
const ownUsers = new Map<string, string>();

function poolActive(): boolean {
  return process.env.P1532_POOL !== 'off' && !!currentRunId() && isTestProjectUrl(process.env.VITE_SUPABASE_URL);
}

/** The session id a cached access token belongs to (the JWT's `session_id` claim). */
function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { session_id?: string };
    return claims.session_id ?? null;
  } catch {
    return null;
  }
}

async function claimPooledUser(name: string, slug: string, options: CreateTestUserOptions): Promise<TestUser | null> {
  while (releasedPool.length) {
    // Most recently released first: its cached sign-in is the likeliest to still be alive.
    const pooled = releasedPool.pop()!;
    const cached = sessionCache.get(pooled.email);
    const userMetadata = testUserMetadata(name, slug, options);
    const { data, error } = await profileWriter.rpc('e2e_claim_test_user', {
      p_user_id: pooled.id,
      p_profile: testProfileRow(name, slug, options),
      p_user_metadata: userMetadata,
      p_password: TEST_PASSWORD,
      p_session_id: cached ? sessionIdOf(cached.access_token) : null,
    });
    const r = data as { reusable: boolean; reason?: string; session_alive?: boolean; user?: User } | null;
    if (error || !r?.reusable || !r.user) {
      // Not reusable: the run's teardown deletes it with everything else this run created.
      console.log(`[TEST HELPER] Pooled user ${pooled.id} not reusable (${error?.message ?? r?.reason}); creating a fresh one`);
      ownUsers.delete(pooled.id);
      sessionCache.delete(pooled.email);
      continue;
    }
    // The server's email is the truth: a test may have changed it within the e2e namespace.
    const email = r.user.email ?? pooled.email;
    if (!r.session_alive || email !== pooled.email) sessionCache.delete(pooled.email);
    else if (cached) cached.user = { ...cached.user, user_metadata: userMetadata };
    ownUsers.set(pooled.id, email);
    console.log(`[TEST HELPER] Claimed pooled user ${pooled.id} (${email}) as slug: ${slug}`);
    return { user: r.user, email, slug, name };
  }
  return null;
}

/**
 * Creates a test user with Supabase Admin API
 * This bypasses email verification so we can test immediately
 */
export async function createTestUser(options: CreateTestUserOptions = {}): Promise<TestUser> {
  const name = options.name || 'Test User';
  const slug = generateTestSlug(name);

  if (!options.email && poolActive()) {
    const claimed = await claimPooledUser(name, slug, options);
    if (claimed) return claimed;
  }

  const email = options.email || generateTestEmail();
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
    user_metadata: testUserMetadata(name, slug, options),
  });

  if (authError) {
    console.error('[TEST HELPER] Failed to create auth user:', authError);
    throw authError;
  }

  if (!authData.user) {
    throw new Error('[TEST HELPER] No user returned from createUser');
  }

  console.log(`[TEST HELPER] Auth user created: ${authData.user.id}`);
  recordCreatedUser(authData.user.id);
  ownUsers.set(authData.user.id, email);

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
    ...testProfileRow(name, slug, options),
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
 * P1532: the shape `e2e_purge_test_users` returns
 * (supabase/migrations/20261021120000_p1532_e2e_purge_test_users.sql).
 */
interface PurgeResult {
  deleted: string[];
  refused: string[];
  missing: string[];
  failed: Array<{ id: string; sqlstate: string; message: string }>;
  /** Not tried: the server's per-user retry stopped before its statement timeout. Send again. */
  deferred?: string[];
  dependent_rows: number;
}

/** Users per purge request. The server takes at most 200 and must finish inside PostgREST's 8 s. */
export const PURGE_BATCH = 50;

/**
 * P1345: a failed cleanup step must FAIL THE TEST, not just log. A delete that matches no row is a
 * no-op and returns no error, so an error here is real, and the user it leaves behind outlives the
 * test: 38 users stranded by a console.warn went unseen for two days and then broke eight unrelated
 * tests. It must NOT throw inside a Playwright test, though: callers run several deletes in a row in
 * `finally`, and a throw on the first would skip the rest and ctx.close(), the very leak this exists
 * to stop. So expect.soft marks the test failed and cleanup carries on. Outside a Playwright test
 * (the Vitest integration lane, global teardown) there is no soft channel, so it throws.
 */
function cleanupFailure(label: string): (step: string, err: { message?: string }) => void {
  return (step, err) => {
    const msg = `[TEST HELPER] ${label} failed at ${step}: ${err.message ?? String(err)}`;
    let inPlaywrightTest = false;
    try { test.info(); inPlaywrightTest = true; } catch { /* not inside a Playwright test */ }
    if (!inPlaywrightTest) throw new Error(msg);
    console.error(msg);
    expect.soft(null, msg).toBeTruthy();
  };
}

/** P893: a recreated user with the same email must not inherit stale tokens. */
function evictCachedSessions(userIds: Iterable<string>) {
  const gone = new Set(userIds);
  for (const [email, entry] of sessionCache) {
    if (gone.has(entry.userId)) sessionCache.delete(email);
  }
}

/**
 * P1532: delete test users, one request per PURGE_BATCH users, with no request failing on the
 * normal path.
 *
 * On the test project this calls e2e_purge_test_users, which reads the FK order from the catalog
 * and deletes everything in one transaction, auth user included. The per-row path it replaces
 * (deleteTestUserPerRow, below) cost 6 + 2k requests per user (k = FK blockers) and found each
 * blocker by provoking a 23503 delete, which writes a Postgres ERROR and a gateway error line. Test
 * and prod share one free-plan organisation, so those requests and logs spend production's quota.
 *
 * The server only deletes e2e-namespace emails (generateTestEmail). A refused user goes through the
 * per-row path only if THIS process created it with createTestUser (a custom-email test user), never
 * an arbitrary id. Off the test project nothing is deleted at all, except against a local Supabase
 * (localhost), which is disposable: the per-row path is the only one there, and a remote project
 * that is not test is treated as production.
 */
export async function deleteTestUsers(userIds: string[]): Promise<{ deleted: number; failed: number }> {
  const ids = [...new Set(userIds)];
  evictCachedSessions(ids);
  // Users this process created: the only ones the per-row fallback may touch (see perRow below).
  const created = new Set(ids.filter((id) => ownUsers.has(id)));
  for (const id of ids) ownUsers.delete(id);
  for (let i = releasedPool.length - 1; i >= 0; i--) if (ids.includes(releasedPool[i]!.id)) releasedPool.splice(i, 1);
  // One id keeps the P1345 message shape: `deleteTestUser(<id>) failed at <step>`.
  const fail = cleanupFailure(ids.length === 1 ? `deleteTestUser(${ids[0]})` : `deleteTestUsers(${ids.length} users)`);
  const result = { deleted: 0, failed: 0 };
  const perRow = async (id: string) => {
    if (await deleteTestUserPerRow(id, fail)) result.deleted++;
    else result.failed++;
  };

  if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL)) {
    if (isLocalSupabaseUrl(process.env.VITE_SUPABASE_URL)) {
      for (const id of ids) await perRow(id);
    } else {
      result.failed += ids.length;
      fail('project check', { message: 'refused: VITE_SUPABASE_URL is neither the test project nor a local Supabase' });
    }
    return result;
  }
  const queue = [...ids];
  const deferredOnce = new Set<string>();
  let batchSize = PURGE_BATCH; // halved whenever the server defers part of a batch
  while (queue.length) {
    const batch = queue.splice(0, batchSize);
    const { data, error } = await profileWriter.rpc('e2e_purge_test_users', { p_user_ids: batch });
    if (error || !data) {
      result.failed += batch.length;
      fail('e2e_purge_test_users', error ?? { message: 'no result' });
      continue;
    }
    const r = data as PurgeResult;
    result.deleted += r.deleted.length + r.missing.length; // missing: already gone, cleanup is idempotent
    for (const f of r.failed) {
      result.failed++;
      fail(`e2e_purge_test_users(${f.id})`, { message: `${f.sqlstate} ${f.message}` });
    }
    if (r.deferred?.length) batchSize = Math.max(1, Math.floor(batchSize / 2));
    for (const id of r.deferred ?? []) {
      // One more try each, in a later (smaller) request; a second deferral is a failure.
      if (deferredOnce.has(id)) {
        result.failed++;
        fail(`e2e_purge_test_users(${id})`, { message: 'deferred twice: the batch keeps running out of time' });
      } else {
        deferredOnce.add(id);
        queue.push(id);
      }
    }
    for (const id of r.refused) {
      if (created.has(id)) await perRow(id);
      else {
        result.failed++;
        fail(`e2e_purge_test_users(${id})`, { message: 'refused: not an e2e-namespace user, and not one this process created' });
      }
    }
  }
  return result;
}

/**
 * Deletes a test user and everything that references them. Call this in afterEach.
 * P1532: one request on the test project. Inside a Playwright run a user this worker created is
 * released to the worker pool instead (see releasedPool): its public data is deleted at once, and
 * the auth user is reused by the next createTestUser() or deleted by the run's global teardown.
 * deleteTestUsers always deletes.
 */
export async function deleteTestUser(userId: string) {
  const email = ownUsers.get(userId);
  if (email && poolActive() && !releasedPool.some((p) => p.id === userId)) {
    const { data, error } = await profileWriter.rpc('e2e_release_test_user', { p_user_id: userId });
    const r = data as { released: boolean; reason?: string } | null;
    if (!error && r?.released) {
      releasedPool.push({ id: userId, email });
      console.log(`[TEST HELPER] Test user released to the worker pool: ${userId}`);
      return;
    }
    if (error) cleanupFailure(`deleteTestUser(${userId})`)('e2e_release_test_user', error);
    // Not releasable (missing, or its email left the e2e namespace): delete it outright.
  }
  console.log(`[TEST HELPER] Deleting test user: ${userId}`);
  await deleteTestUsers([userId]);
  console.log(`[TEST HELPER] Test user deleted: ${userId}`);
}

/**
 * P1522: delete `table` rows where `column` = `value`, first clearing any rows that block it
 * through a foreign key. Postgres names the blocking table and constraint in the error, so the
 * blockers are derived from the database instead of a list. Only default-named constraints
 * (`<table>_<column>_fkey[N]`) are resolved; anything else is returned as the original error, never
 * guessed at. Bounded: each step removes one blocker. Rows selected by a non-key column (a user's
 * stories by author_id) are resolved through their ids (P1523: stories in a sealed letter). Limits
 * (each fails closed): blockers that reference a non-`id` key, and names Postgres truncated at 63
 * bytes, are not resolved.
 *
 * P1532: every blocker costs a request that fails on purpose and writes error log lines. This now
 * serves only the per-row fallback (users outside the e2e namespace, or a project other than test).
 */
async function deleteClearingReferences(
  table: string,
  column: string,
  value: string,
  depth = 0,
): Promise<{ message?: string; code?: string } | null> {
  for (let step = 0; step < 12; step++) {
    const { error } = await profileWriter.from(table).delete().eq(column, value);
    if (!error) return null;
    const m = /violates foreign key constraint "([^"]+)" on table "([^"]+)"/.exec(error.message ?? '');
    if (error.code !== '23503' || !m || depth >= 4) return error;
    const [, constraint = '', blocker = ''] = m;
    const prefix = `${blocker}_`;
    // Default names, including the numbered `_fkey1` Postgres gives a second FK on one column.
    const named = /_fkey\d*$/.exec(constraint);
    if (!constraint.startsWith(prefix) || !named) return error;
    const blockerColumn = constraint.slice(prefix.length, named.index);
    if (column === 'id') {
      // The blocking rows point straight at the row being deleted.
      const nested = await deleteClearingReferences(blocker, blockerColumn, value, depth + 1);
      if (nested) return nested;
      continue;
    }
    // P1523: the rows being deleted were selected by a non-key column (a user's stories by
    // author_id), so the blockers point at their ids. Look those up, clear each one's blockers.
    const { data: rows, error: selectError } = await profileWriter.from(table).select('id').eq(column, value);
    if (selectError || !rows?.length) return error;
    for (const row of rows as Array<{ id: string }>) {
      const nested = await deleteClearingReferences(blocker, blockerColumn, row.id, depth + 1);
      if (nested) return nested;
    }
  }
  return { message: `deleteClearingReferences(${table}): gave up after 12 blockers` };
}

/**
 * The per-row delete for users the server-side purge will not take (see deleteTestUsers).
 * Returns false when any step failed (each failure is also reported through `fail`).
 */
async function deleteTestUserPerRow(
  userId: string,
  fail: (step: string, err: { message?: string }) => void,
): Promise<boolean> {
  let ok = true;
  const report = (step: string, err: { message?: string }) => {
    ok = false;
    fail(step, err);
  };

  // Pre-clean dependent records that might block cascade deletes or user deletion.
  const { error: verificationsError } = await supabaseAdmin.from('story_verifications').delete()
    .or(`listener_id.eq.${userId},speaker_id.eq.${userId}`);
  if (verificationsError) report('story_verifications pre-clean', verificationsError);
  // P1523: through deleteClearingReferences, so a story held by a sealed letter's snapshot does
  // not strand the user.
  const storiesError = await deleteClearingReferences('stories', 'author_id', userId);
  if (storiesError) report('stories pre-clean', storiesError);
  // Sessions this user created (a room capture opens one: P1307/P1388) block the profile delete
  // (clarity_sessions_creator_profile_id_fkey has no cascade). Their story_verifications go first,
  // as deleteClaritySession does; everything else on a session cascades or is set null.
  const { data: ownSessions } = await supabaseAdmin.from('clarity_sessions').select('id').eq('creator_profile_id', userId);
  const ownSessionIds = (ownSessions ?? []).map((r: { id: string }) => r.id);
  if (ownSessionIds.length) {
    await supabaseAdmin.from('story_verifications').delete().in('session_id', ownSessionIds);
    const { error: sessionsError } = await supabaseAdmin.from('clarity_sessions').delete().in('id', ownSessionIds);
    if (sessionsError) report('clarity_sessions pre-clean', sessionsError);
  }

  // Delete profile (cascades remaining FK-linked records).
  // P1137: via profileWriter, not supabaseAdmin. Clients have no DELETE on profiles, and many specs
  // sign in ON supabaseAdmin (see profileWriter above), after which its requests carry a user JWT.
  const profileError = await deleteClearingReferences('profiles', 'id', userId);
  if (profileError) report('profile delete', profileError);

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  // 404 = already deleted (idempotent cleanup). Anything else strands an auth user that a later
  // sweep pays for again, so it fails the test like every other step (P1532, finding C5).
  if (authError && authError.status !== 404) report('auth user delete', authError);
  return ok;
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
