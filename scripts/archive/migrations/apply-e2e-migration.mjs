#!/usr/bin/env node
/**
 * Apply E2E Test Infrastructure Migration
 * This script applies the RLS policies and helper functions needed for E2E tests
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envFile = join(__dirname, '../.env.test.local');
const envContent = readFileSync(envFile, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) {
    envVars[match[1]] = match[2];
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.test.local');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Read migration SQL
const migrationPath = join(__dirname, '../supabase/migrations/20260214_e2e_test_rls_complete_fix.sql');
const migrationSQL = readFileSync(migrationPath, 'utf-8');

console.log('Applying E2E Test Infrastructure Migration...');
console.log('Database:', supabaseUrl);
console.log('');

// Execute migration
const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL }).catch(() => {
  // If exec_sql doesn't exist, try direct query
  return supabase.from('_migrations').select('*').limit(0);
});

// Since we can't execute arbitrary SQL via Supabase JS client, we need to use Postgres directly
// Let's split the migration into individual statements and execute them
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Executing ${statements.length} SQL statements...`);

let successCount = 0;
let errorCount = 0;

for (const [index, statement] of statements.entries()) {
  if (statement.includes('DROP POLICY')) {
    console.log(`[${index + 1}/${statements.length}] Dropping old policy...`);
  } else if (statement.includes('CREATE POLICY')) {
    console.log(`[${index + 1}/${statements.length}] Creating new policy...`);
  } else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
    console.log(`[${index + 1}/${statements.length}] Creating helper function...`);
  } else if (statement.includes('GRANT EXECUTE')) {
    console.log(`[${index + 1}/${statements.length}] Granting permissions...`);
  }

  try {
    // Unfortunately, Supabase JS client doesn't support arbitrary SQL execution
    // We would need to use the REST API or PostgreSQL client directly
    console.log(`   ⚠️  Cannot execute via Supabase JS - need direct PostgreSQL access`);
    errorCount++;
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    errorCount++;
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('MIGRATION REQUIRES MANUAL APPLICATION');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('The Supabase JS client cannot execute DDL statements (CREATE POLICY, etc.)');
console.log('');
console.log('Please apply the migration manually using ONE of these methods:');
console.log('');
console.log('METHOD 1: Supabase Dashboard SQL Editor');
console.log('  1. Go to: https://supabase.com/dashboard/project/gfjctyxqlwexxwsmkakq/sql/new');
console.log('  2. Copy the contents of: supabase/migrations/20260214_e2e_test_rls_complete_fix.sql');
console.log('  3. Paste and run');
console.log('');
console.log('METHOD 2: PostgreSQL CLI (psql)');
console.log('  psql "postgresql://postgres.gfjctyxqlwexxwsmkakq:eGAHIuvnciA3mxWs@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \\');
console.log('    -f supabase/migrations/20260214_e2e_test_rls_complete_fix.sql');
console.log('');
console.log('═══════════════════════════════════════════════════════════');

process.exit(1);
