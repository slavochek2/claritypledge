/**
 * Creates a permanent listener account for two-party /verify sessions.
 *
 * This account is injected into Chrome tab 2 via javascript_tool so that
 * /verify can run two-party UAT scenarios without Playwright.
 *
 * Before running, add to .env.test.local:
 *   TEST_LISTENER_EMAIL=e2e-verify-listener@gmail.com
 *   TEST_LISTENER_PASSWORD=<your-chosen-password>
 *
 * Run: npx tsx scripts/setup-verify-listener.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.test.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const LISTENER_EMAIL = process.env.TEST_LISTENER_EMAIL;
if (!LISTENER_EMAIL) {
  throw new Error('TEST_LISTENER_EMAIL not set — add it to .env.test.local before running this script');
}

const LISTENER_PASSWORD = process.env.TEST_LISTENER_PASSWORD;
if (!LISTENER_PASSWORD) {
  throw new Error('TEST_LISTENER_PASSWORD not set — add it to .env.test.local before running this script');
}

const LISTENER_NAME = 'Test Listener';
const LISTENER_SLUG = 'test-listener-verify';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing required env vars. Check .env.test.local');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log('Checking for existing listener account...');

  // Check if account already exists
  const { data: { users }, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;

  const existing = users.find(u => u.email === LISTENER_EMAIL);

  if (existing) {
    console.log(`✓ Listener account already exists: ${existing.id}`);
    console.log(`  Email: ${LISTENER_EMAIL}`);
    console.log('\nAdd to .env.test.local:');
    console.log(`  TEST_LISTENER_EMAIL=${LISTENER_EMAIL}`);
    console.log(`  TEST_LISTENER_PASSWORD=${LISTENER_PASSWORD}`);
    return;
  }

  console.log('Creating listener account...');

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: LISTENER_EMAIL,
    password: LISTENER_PASSWORD,
    email_confirm: true,
    user_metadata: {
      name: LISTENER_NAME,
      slug: LISTENER_SLUG,
      role: 'E2E Test Listener',
      linkedin_url: '',
      reason: 'Automated two-party /verify UAT testing',
      avatar_color: '#E24A90',
    },
  });

  if (authError) throw authError;
  console.log(`✓ Auth user created: ${authData.user.id}`);

  // Sign in as new user to create profile with correct RLS
  const { data: signInData, error: signInError } = await admin.auth.signInWithPassword({
    email: LISTENER_EMAIL,
    password: LISTENER_PASSWORD,
  });

  if (signInError || !signInData.session) {
    throw new Error(`Sign-in failed: ${signInError?.message}`);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: profileError } = await userClient.from('profiles').upsert({
    id: authData.user.id,
    email: LISTENER_EMAIL,
    name: LISTENER_NAME,
    slug: LISTENER_SLUG,
    role: 'E2E Test Listener',
    linkedin_url: '',
    reason: 'Automated two-party /verify UAT testing',
    avatar_color: '#E24A90',
    is_verified: true,
  }, { onConflict: 'id' });

  await admin.auth.signOut();

  if (profileError) throw profileError;
  console.log(`✓ Profile created: ${LISTENER_SLUG}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Listener account created successfully.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Email:    ${LISTENER_EMAIL}`);
  console.log(`  Password: (from TEST_LISTENER_PASSWORD in .env.test.local)`);
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
