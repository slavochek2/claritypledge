/**
 * @file p1354-event-banner-mobile-url-migration.spec.ts
 * @description Integration tests for P1354: event phone banner — DB migration verification
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * Verifies:
 * 1. `banner_mobile_url` column exists on `events` table (migration applied)
 * 2. `banner_mobile_url` defaults to NULL for new events
 * 3. Host can write `banner_mobile_url` to their own event (same row-level RLS as banner_url —
 *    the app deliberately never writes this column through updateEvent, see events-service-real.ts,
 *    but the column itself is not more restricted than any other events column)
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped JWT client: RLS assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';

const TABLE = 'events';
const COLUMN = 'banner_mobile_url';

test.describe('P1354 Migration — events.banner_mobile_url column', () => {
  test.setTimeout(30000);

  let host: TestUser;
  let hostEvent: TestEvent;
  let hostToken: string;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1354 Phone Banner Host' });

    hostEvent = await createTestEvent(host.user.id, undefined, {
      title: 'P1354 Migration Test Event',
    });

    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

    const hostClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: hostSignIn, error: hostErr } = await hostClient.auth.signInWithPassword({
      email: host.email,
      password: 'test-password-12345',
    });
    if (hostErr || !hostSignIn?.session) throw new Error(`P1354: Failed to sign in host: ${hostErr?.message}`);
    hostToken = hostSignIn.session.access_token;
  });

  test.afterAll(async () => {
    if (hostEvent?.id) await deleteTestEvent(hostEvent.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  // ── 1. Schema check ──────────────────────────────────────────────────────
  test('banner_mobile_url column exists in events table', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select(COLUMN)
      .limit(1);

    expect(
      error,
      `Migration not applied: "banner_mobile_url" missing from "events". Run: ./scripts/migrate.sh`
    ).toBeNull();
  });

  // ── 2. Default value ─────────────────────────────────────────────────────
  test('banner_mobile_url defaults to NULL for new events', async () => {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('id, banner_mobile_url')
      .eq('id', hostEvent.id)
      .single();

    expect(error).toBeNull();
    expect(data?.banner_mobile_url).toBeNull();
  });

  // ── 3. RLS: host can write banner_mobile_url to their own event ──────────
  test('host can update banner_mobile_url on their own event', async () => {
    const hostClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${hostToken}` } } }
    );

    const testUrl = 'https://images.unsplash.com/photo-test-rls-check-mobile';

    const { error } = await hostClient
      .from(TABLE)
      .update({ banner_mobile_url: testUrl })
      .eq('id', hostEvent.id);

    expect(error, `RLS blocked host from updating banner_mobile_url: ${error?.message}`).toBeNull();

    // Cleanup: reset to null
    await supabaseAdmin.from(TABLE).update({ banner_mobile_url: null }).eq('id', hostEvent.id);
  });
});
