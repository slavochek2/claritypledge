/**
 * Integration test: the consent audit trail cannot be forged.
 *
 * Migration: 20260903140000_p1235_bind_consent_insert_to_acting_user.sql
 *
 * P1235: the INSERT policies on `terms_acceptances` and `session_consents` verified only that the
 * caller was authenticated, never that the row's `user_id` named that caller — so any authenticated
 * user could write a consent record naming any other user. These rows are the GDPR Art. 7(1)
 * "demonstrate consent" evidence, so an unbound writer voids the evidence.
 *
 * Both directions are asserted deliberately. A guard exercised only against inputs it should
 * reject has an unmeasured false-positive rate, and the three legitimate writer classes here
 * (self-record from the client, the terms-acceptance gate's insert, and the service-role edge
 * functions that record on behalf of another user) are exactly what a too-narrow predicate breaks.
 *
 * Run: npx playwright test --project=integration e2e/integration/20260903140000_p1235_consent_insert_bound_to_actor.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

// `fullyParallel: true` runs the tests in this file across separate workers, each with its own
// beforeAll fixture users. No test may therefore read a row another test wrote: every test tags
// its own rows with a unique marker and asserts only on those.
const PROBE_PREFIX = 'p1235-probe';
const mark = (name: string) => `${PROBE_PREFIX}-${name}`;

async function makeUserClient(email: string): Promise<SupabaseClient> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const tempClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await tempClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

test.describe('P1235: consent audit INSERT is bound to the acting user', () => {
  test.describe.configure({ timeout: 60000 });

  let actorId: string;
  let victimId: string;
  let actorClient: SupabaseClient;

  test.beforeAll(async () => {
    const actorEmail = generateTestEmail();
    const victimEmail = generateTestEmail();
    actorId = (await createTestUser({ email: actorEmail })).user.id;
    victimId = (await createTestUser({ email: victimEmail })).user.id;
    actorClient = await makeUserClient(actorEmail);
  });

  test.afterAll(async () => {
    // Remove every row this file could have written, under the service role, then
    // assert by count that nothing survived — including rows an unexpected pass left behind.
    for (const table of ['terms_acceptances', 'session_consents']) {
      await supabaseAdmin.from(table).delete().like('terms_version', `${PROBE_PREFIX}%`);
      const { count } = await supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .like('terms_version', `${PROBE_PREFIX}%`);
      expect(count, `${table}: probe rows leaked past cleanup`).toBe(0);
    }
    if (actorId) await deleteTestUser(actorId);
    if (victimId) await deleteTestUser(victimId);
  });

  test('smoke: both consent tables are reachable and the fixture users exist', async () => {
    for (const table of ['terms_acceptances', 'session_consents']) {
      const { error } = await supabaseAdmin.from(table).select('id').limit(1);
      expect(error, `${table} inaccessible: ${error?.message}`).toBeNull();
    }
    expect(actorId).toBeTruthy();
    expect(victimId).toBeTruthy();
    expect(actorId).not.toBe(victimId);
  });

  // ── The defect ────────────────────────────────────────────────────────────
  // Before the migration both of these INSERTs succeeded.

  test('an authenticated user CANNOT record a terms acceptance naming another user', async () => {
    const { error } = await actorClient.from('terms_acceptances').insert({
      user_id: victimId,
      terms_version: mark('forge-terms'),
      user_agent: 'p1235-forgery-probe',
    });

    expect(error, 'forged terms_acceptances row was accepted — RLS is not binding user_id').not.toBeNull();
    expect(error?.code, `expected an RLS violation, got: ${error?.message}`).toBe('42501');

    // The actor cannot SELECT the victim's rows, so a client-side read would report success
    // either way. Count under the service role instead.
    const { count } = await supabaseAdmin
      .from('terms_acceptances')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', victimId)
      .eq('terms_version', mark('forge-terms'));
    expect(count, 'a forged terms_acceptances row reached the table').toBe(0);
  });

  test('an authenticated user CANNOT record a session consent naming another user', async () => {
    const { error } = await actorClient.from('session_consents').insert({
      session_id: 'P1235X',
      user_id: victimId,
      terms_version: mark('forge-consent'),
      user_agent: 'p1235-forgery-probe',
    });

    expect(error, 'forged session_consents row was accepted — RLS is not binding user_id').not.toBeNull();
    expect(error?.code, `expected an RLS violation, got: ${error?.message}`).toBe('42501');

    const { count } = await supabaseAdmin
      .from('session_consents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', victimId)
      .eq('terms_version', mark('forge-consent'));
    expect(count, 'a forged session_consents row reached the table').toBe(0);
  });

  // ── The legitimate paths ──────────────────────────────────────────────────
  // These measure the false-positive rate of the guard above.

  test('a user CAN still record their own terms acceptance (client + gate path)', async () => {
    const { error } = await actorClient.from('terms_acceptances').insert({
      user_id: actorId,
      terms_version: mark('legit-terms'),
      user_agent: 'p1235-legit-probe',
    });
    expect(error, `self-record was rejected — the predicate is too narrow: ${error?.message}`).toBeNull();

    // The gate reads its own row back through the SELECT policy; prove that still works.
    const { data } = await actorClient
      .from('terms_acceptances')
      .select('user_id, terms_version')
      .eq('terms_version', mark('legit-terms'));
    expect(data, 'user cannot read back their own acceptance').toHaveLength(1);
    expect(data![0].user_id).toBe(actorId);
  });

  test('a user CAN still record their own session consent', async () => {
    const { error } = await actorClient.from('session_consents').insert({
      session_id: 'P1235X',
      user_id: actorId,
      terms_version: mark('legit-consent'),
      user_agent: 'p1235-legit-probe',
    });
    expect(error, `self-record was rejected — the predicate is too narrow: ${error?.message}`).toBeNull();
  });

  test('the service role CAN still record on behalf of another user (edge-function path)', async () => {
    // create-and-sign, create-and-open-letter and confirm-letter-response all write
    // terms_acceptances for a user they just created. They bypass RLS by design.
    const { error } = await supabaseAdmin.from('terms_acceptances').insert({
      user_id: victimId,
      terms_version: mark('service-role'),
      user_agent: 'p1235-service-role-probe',
    });
    expect(error, `service-role write-on-behalf broke: ${error?.message}`).toBeNull();
  });

  // ── The policy itself ─────────────────────────────────────────────────────

  test('neither table has an UPDATE or DELETE policy (audit trail stays append-only)', async () => {
    // A subject who can rewrite their own consent record defeats the audit trail as
    // thoroughly as a third party who can forge one.
    for (const table of ['terms_acceptances', 'session_consents']) {
      const marker = mark(`append-only-${table}`);
      const row: Record<string, unknown> = {
        user_id: actorId,
        terms_version: marker,
        user_agent: 'p1235-append-only-probe',
      };
      if (table === 'session_consents') row.session_id = 'P1235X';

      const { error: insErr } = await actorClient.from(table).insert(row);
      expect(insErr, `${table}: could not seed own row: ${insErr?.message}`).toBeNull();

      const { error } = await actorClient
        .from(table)
        .delete()
        .eq('terms_version', marker)
        .eq('user_id', actorId)
        .select('id');

      // With no DELETE policy, RLS filters every row: the call reports no error and
      // removes nothing. Assert on the surviving row, not on the absence of an error.
      const { count } = await supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('terms_version', marker)
        .eq('user_id', actorId);
      expect(count, `${table}: a user deleted their own audit row (error: ${error?.message})`).toBe(1);
    }
  });
});
