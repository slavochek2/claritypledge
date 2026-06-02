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
const TEST_PASSWORD = 'test-password-12345';

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

  // Sign in as the new user to get their JWT — use it to create the profile.
  // This satisfies the "Users can insert their own profile" RLS policy (auth.uid() = id).
  //
  // IMPORTANT: Use a temp client (not supabaseAdmin) for sign-in. Calling
  // supabaseAdmin.auth.signInWithPassword() modifies supabaseAdmin's in-memory session
  // so that all subsequent requests run as the user (not service_role). The subsequent
  // signOut() call was supposed to restore service_role mode, but it doesn't reliably
  // do so — the client may fall back to anonymous mode, causing RLS violations on later
  // inserts (e.g. createTestStory with visibility: 'private' fails with code 42501).
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const tempSignInClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signInData, error: signInError } = await tempSignInClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });

  if (signInError || !signInData.session) {
    throw new Error(`[TEST HELPER] Failed to sign in new user for profile creation: ${signInError?.message}`);
  }

  // Create an authenticated client using the user's own JWT
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // P877: profiles email/linkedin_url/reason are revoked from authenticated, so a
  // direct .upsert() fails (it reads EXCLUDED.email). Write the own row through the
  // upsert_my_profile SECURITY DEFINER accessor — the same path production uses.
  const { error: profileError } = await userClient
    .rpc('upsert_my_profile', {
      p_data: {
        email,
        name,
        slug,
        role: options.role || 'Test Engineer',
        linkedin_url: options.linkedinUrl || '',
        reason: options.reason || 'Testing the Clarity Pledge',
        avatar_color: '#4A90E2',
        is_verified: true,
        accepted_terms_version: 'v1.3', // Skip terms dialog in E2E tests (keep in sync with CURRENT_TERMS_VERSION)
      },
    });

  if (profileError) {
    console.error('[TEST HELPER] Failed to create profile:', profileError);
    throw profileError;
  }

  console.log(`[TEST HELPER] Profile created for slug: ${slug}`);

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

  // Use a temporary anon client for sign-in so we don't mutate supabaseAdmin's
  // in-memory session. Calling signOut on supabaseAdmin after signInWithPassword
  // would revoke the session server-side, causing auth.getUser() calls in the
  // browser to fail even though the JWT is still in localStorage.
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });

  if (error) {
    console.error('[TEST HELPER] Failed to sign in:', error);
    throw error;
  }

  if (!data.session) {
    throw new Error('[TEST HELPER] No session returned from signInWithPassword');
  }

  const { access_token, refresh_token } = data.session;
  const userId = data.user.id;

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
      id: data.user.id,
      email: data.user.email,
      created_at: data.user.created_at,
      app_metadata: data.user.app_metadata,
      user_metadata: data.user.user_metadata,
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
