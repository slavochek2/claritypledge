/**
 * @file supabase-admin.ts
 *
 * Supabase Admin Client - FOR TESTING ONLY
 *
 * This client uses the service_role key which bypasses Row Level Security (RLS).
 * NEVER use this in production code - only for E2E test helpers.
 *
 * Capabilities:
 * - Create users without email verification
 * - Delete users directly
 * - Bypass all RLS policies
 * - Full database access
 */

import { createClient } from '@supabase/supabase-js';

// Use process.env for Node context (E2E tests)
// import.meta.env only works in Vite browser context
const supabaseUrl = process.env.VITE_SUPABASE_URL || import.meta.env?.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env?.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
    'This is required for E2E tests. Add it to .env.test.local'
  );
}

/**
 * Admin client with full access.
 * WARNING: This bypasses all security policies.
 * Only use in test helpers!
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
