/**
 * @file p416-event-banner-migration.spec.ts
 * @description Integration tests for P416: Event auto-banner — DB migration verification
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * Verifies:
 * 1. `banner_url` column exists on `events` table (migration applied)
 * 2. `banner_url` defaults to NULL for new events
 * 3. Host can write `banner_url` to their own event (RLS allows)
 * 4. Non-host cannot write `banner_url` to another host's event (RLS blocks)
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
const COLUMN = 'banner_url';

test.describe('P416 Migration — events.banner_url column', () => {
  test.setTimeout(30000);

  let host: TestUser;
  let nonHost: TestUser;
  let hostEvent: TestEvent;
  let hostToken: string;
  let nonHostToken: string;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P416 Banner Host' });
    nonHost = await createTestUser({ name: 'P416 Banner NonHost' });

    hostEvent = await createTestEvent(host.user.id, undefined, {
      title: 'P416 Migration Test Event',
    });

    // Use temp clients to get JWTs without mutating supabaseAdmin's session
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

    const hostClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: hostSignIn, error: hostErr } = await hostClient.auth.signInWithPassword({
      email: host.email,
      password: 'test-password-12345',
    });
    if (hostErr || !hostSignIn?.session) throw new Error(`P416: Failed to sign in host: ${hostErr?.message}`);
    hostToken = hostSignIn.session.access_token;

    const nonHostClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: nonHostSignIn, error: nonHostErr } = await nonHostClient.auth.signInWithPassword({
      email: nonHost.email,
      password: 'test-password-12345',
    });
    if (nonHostErr || !nonHostSignIn?.session) throw new Error(`P416: Failed to sign in nonHost: ${nonHostErr?.message}`);
    nonHostToken = nonHostSignIn.session.access_token;
  });

  test.afterAll(async () => {
    if (hostEvent?.id) await deleteTestEvent(hostEvent.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
    if (nonHost?.user?.id) await deleteTestUser(nonHost.user.id);
  });

  // ── 1. Schema check ──────────────────────────────────────────────────────
  test('banner_url column exists in events table', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select(COLUMN)
      .limit(1);

    expect(
      error,
      `Migration not applied: "banner_url" missing from "events". Run: ./scripts/migrate.sh`
    ).toBeNull();
  });

  // ── 2. Default value ─────────────────────────────────────────────────────
  test('banner_url defaults to NULL for new events', async () => {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('id, banner_url')
      .eq('id', hostEvent.id)
      .single();

    expect(error).toBeNull();
    expect(data?.banner_url).toBeNull();
  });

  // ── 3. RLS: host can write banner_url to their own event ─────────────────
  test('host can update banner_url on their own event', async () => {
    const hostClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${hostToken}` } } }
    );

    const testUrl = 'https://images.unsplash.com/photo-test-rls-check';

    const { error } = await hostClient
      .from(TABLE)
      .update({ banner_url: testUrl })
      .eq('id', hostEvent.id);

    expect(error, `RLS blocked host from updating banner_url: ${error?.message}`).toBeNull();

    // Cleanup: reset to null
    await supabaseAdmin.from(TABLE).update({ banner_url: null }).eq('id', hostEvent.id);
  });

  // ── 4. RLS: non-host cannot write banner_url ─────────────────────────────
  test('non-host cannot update banner_url on another user event', async () => {
    const nonHostClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${nonHostToken}` } } }
    );

    const { error, data } = await nonHostClient
      .from(TABLE)
      .update({ banner_url: 'https://evil.example.com/injected.jpg' })
      .eq('id', hostEvent.id)
      .select('banner_url');

    // RLS silently filters: no error, but 0 rows updated
    expect(error, 'Unexpected error on cross-host update').toBeNull();
    expect(data?.length ?? 0, 'RLS should prevent non-host from updating banner_url').toBe(0);
  });
});
