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

import { supabaseAdmin } from '../../src/lib/supabase-admin';
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
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return `${slug}-${timestamp}`;
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
  // This satisfies the "Users can insert their own profile" RLS policy (auth.uid() = id)
  // and avoids relying on the service_role bypass policy which has proven unreliable.
  const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });

  if (signInError || !signInData.session) {
    throw new Error(`[TEST HELPER] Failed to sign in new user for profile creation: ${signInError?.message}`);
  }

  // Create an authenticated client using the user's own JWT
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: profileError } = await userClient
    .from('profiles')
    .upsert({
      id: authData.user.id,
      email,
      name,
      slug,
      role: options.role || 'Test Engineer',
      linkedin_url: options.linkedinUrl || '',
      reason: options.reason || 'Testing the Clarity Pledge',
      avatar_color: '#4A90E2',
      is_verified: true,
    }, { onConflict: 'id' });

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
 * Sets a Supabase session directly in the browser for E2E tests
 * Uses password-based login to get a valid session instantly
 *
 * @param page - Playwright page object
 * @param email - Email of the test user
 */
export async function setTestSession(page: Page, email: string) {
  console.log(`[TEST HELPER] Creating session for: ${email}`);

  // Sign in with password to get a valid session
  // This is much more reliable than magic link token verification for E2E tests
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
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

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
  const session = JSON.stringify({
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: null, // Will be populated by Supabase
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
