/**
 * Creates a permanent partner account for two-party /verify sessions.
 *
 * This account is injected into Chrome tab 2 via javascript_tool so that
 * /verify can run two-party UAT scenarios for the agreement accept flow
 * without Playwright.
 *
 * Before running, add to .env.test.local:
 *   TEST_PARTNER_EMAIL=e2e-verify-partner@claritypledge.com
 *   TEST_PARTNER_PASSWORD=<your-chosen-password>
 *
 * Run: npx tsx scripts/setup-verify-partner.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.test.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

const PARTNER_EMAIL = process.env.TEST_PARTNER_EMAIL;
if (!PARTNER_EMAIL) {
  throw new Error('TEST_PARTNER_EMAIL not set — add it to .env.test.local before running this script');
}

const PARTNER_PASSWORD = process.env.TEST_PARTNER_PASSWORD;
if (!PARTNER_PASSWORD) {
  throw new Error('TEST_PARTNER_PASSWORD not set — add it to .env.test.local before running this script');
}

const PARTNER_NAME = 'Test Partner';
const PARTNER_SLUG = 'test-partner-verify';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  const missing = [
    !SUPABASE_URL && 'VITE_SUPABASE_URL',
    !SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    !ANON_KEY && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean).join(', ');
  console.error(`Missing required env vars: ${missing}. Check .env.test.local`);
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log('Checking for existing partner account...');

  // Check if account already exists
  const { data: { users }, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;

  const existing = users.find(u => u.email === PARTNER_EMAIL);

  if (existing) {
    console.log(`✓ Partner account already exists: ${existing.id}`);
    console.log(`  Email: ${PARTNER_EMAIL}`);
    console.log('\nAdd to .env.test.local:');
    console.log(`  TEST_PARTNER_EMAIL=${PARTNER_EMAIL}`);
    console.log(`  TEST_PARTNER_PASSWORD=${PARTNER_PASSWORD}`);
    return;
  }

  console.log('Creating partner account...');

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: PARTNER_EMAIL,
    password: PARTNER_PASSWORD,
    email_confirm: true,
    user_metadata: {
      name: PARTNER_NAME,
      slug: PARTNER_SLUG,
      role: 'E2E Test Partner',
      linkedin_url: '',
      reason: 'Automated two-party /verify UAT testing for agreement accept flow',
      avatar_color: '#E24A90',
    },
  });

  if (authError) throw authError;
  console.log(`✓ Auth user created: ${authData.user.id}`);

  // Sign in as new user to create profile with correct RLS
  const { data: signInData, error: signInError } = await admin.auth.signInWithPassword({
    email: PARTNER_EMAIL,
    password: PARTNER_PASSWORD,
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
    email: PARTNER_EMAIL,
    name: PARTNER_NAME,
    slug: PARTNER_SLUG,
    role: 'E2E Test Partner',
    linkedin_url: '',
    reason: 'Automated two-party /verify UAT testing for agreement accept flow',
    avatar_color: '#E24A90',
    is_verified: true,
  }, { onConflict: 'id' });

  await admin.auth.signOut();

  if (profileError) throw profileError;
  console.log(`✓ Profile created: ${PARTNER_SLUG}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Partner account created successfully.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Email:    ${PARTNER_EMAIL}`);
  console.log(`  Password: (from TEST_PARTNER_PASSWORD in .env.test.local)`);
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
