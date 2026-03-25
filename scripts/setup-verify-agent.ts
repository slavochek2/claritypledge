/**
 * Creates a permanent verify agent account for /verify visual QA sessions.
 *
 * This account is injected into Chrome tabs via javascript_tool so that
 * /verify can access authenticated pages without the user's session.
 *
 * Before running, add to .env.test.local:
 *   VERIFY_AGENT_EMAIL=e2e-verify-agent@claritypledge.com
 *   VERIFY_AGENT_PASSWORD=<your-chosen-password>
 *
 * Run: npx tsx scripts/setup-verify-agent.ts
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

const AGENT_EMAIL = process.env.VERIFY_AGENT_EMAIL;
if (!AGENT_EMAIL) {
  throw new Error('VERIFY_AGENT_EMAIL not set — add it to .env.test.local before running this script');
}

const AGENT_PASSWORD = process.env.VERIFY_AGENT_PASSWORD;
if (!AGENT_PASSWORD) {
  throw new Error('VERIFY_AGENT_PASSWORD not set — add it to .env.test.local before running this script');
}

const AGENT_NAME = 'Verify Agent';
const AGENT_SLUG = 'verify-agent';

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
  console.log('Checking for existing verify agent account...');

  const { data: { users }, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;

  const existing = users.find(u => u.email === AGENT_EMAIL);

  if (existing) {
    console.log(`✓ Verify agent account already exists: ${existing.id}`);
    console.log(`  Email: ${AGENT_EMAIL}`);
    return;
  }

  console.log('Creating verify agent account...');

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: AGENT_EMAIL,
    password: AGENT_PASSWORD,
    email_confirm: true,
    user_metadata: {
      name: AGENT_NAME,
      slug: AGENT_SLUG,
      role: 'QA Agent',
      linkedin_url: '',
      reason: 'Automated /verify visual QA testing',
      avatar_color: '#4A90E2',
    },
  });

  if (authError) throw authError;
  console.log(`✓ Auth user created: ${authData.user.id}`);

  // Sign in as new user to create profile with correct RLS
  const { data: signInData, error: signInError } = await admin.auth.signInWithPassword({
    email: AGENT_EMAIL,
    password: AGENT_PASSWORD,
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
    email: AGENT_EMAIL,
    name: AGENT_NAME,
    slug: AGENT_SLUG,
    role: 'QA Agent',
    linkedin_url: '',
    reason: 'Automated /verify visual QA testing',
    avatar_color: '#4A90E2',
    is_verified: true,
  }, { onConflict: 'id' });

  await admin.auth.signOut();

  if (profileError) throw profileError;
  console.log(`✓ Profile created: ${AGENT_SLUG}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Verify agent account created successfully.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Email:    ${AGENT_EMAIL}`);
  console.log(`  Password: (from VERIFY_AGENT_PASSWORD in .env.test.local)`);
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
