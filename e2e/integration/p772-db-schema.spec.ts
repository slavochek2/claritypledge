/**
 * P772: DB integration test — resolve_letter_shortcode RPC
 *
 * Verifies the RPC function was applied and is callable.
 * Column-style checks don't apply here; we verify the function exists
 * by calling it with a dummy shortcode (expects null, not an error).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

test.describe('Migration: p772 — resolve_letter_shortcode RPC', () => {
  test('RPC exists and returns null for unknown shortcode', async () => {
    const { data, error } = await supabaseAdmin.rpc('resolve_letter_shortcode', {
      p_code: 'nonexistent-shortcode-xyz',
      p_sender_slug: 'nobody',
    });

    // Error means function doesn't exist; null data means it exists but found nothing
    expect(error, `RPC not found — migration not applied: ${error?.message}`).toBeNull();
    expect(data).toBeNull();
  });

  test('RPC is callable by anon role (SECURITY DEFINER)', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!
    );

    const { data, error } = await anonClient.rpc('resolve_letter_shortcode', {
      p_code: 'st5',
      p_sender_slug: 'nobody',
    });

    expect(error, `Anon cannot call RPC — SECURITY DEFINER missing: ${error?.message}`).toBeNull();
    expect(data).toBeNull();
  });
});
