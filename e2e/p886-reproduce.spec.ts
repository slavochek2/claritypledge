/**
 * @file p886-reproduce.spec.ts
 * @description CANARY for P886 — the P877 profiles PII column gate was rolled back on PROD.
 *
 * Incident (2026-06-04): a backend-only ship swept the pending P877 migration onto prod
 * without its coupled RPC frontend → all logins 403'd for ~1.5h. The emergency mitigation
 * re-granted table-level SELECT on `profiles` to anon+authenticated, which re-opened the
 * P877 PII exposure (email, linkedin_url, reason bulk-readable via the public anon key).
 * Migration 20260602160000 is already recorded in prod's schema_migrations, so the gate
 * never re-applies by itself — P886 re-applies it as a NEW migration after the frontend ships.
 *
 * This file is the PROD twin of e2e/integration/p877-reproduce.spec.ts (which runs against
 * the test DB, where the gate is applied and the suite passes — useless as a P886 canary).
 * Differences from the test-DB twin: no fixture users are created (prod is read-only here);
 * assertions run against existing rows.
 *
 * S1–S4 FAIL now (PII readable) and PASS once the P886 migration re-applies section 3 of
 * the P877 migration (REVOKE table SELECT + column-level GRANT on non-sensitive columns).
 * S5–S6 pass before AND after — they guard against over-revoke and accessor rollback.
 *
 * NOTE: the permanent 403 canary lands in scripts/prod-smoke-test.mjs as part of the /fix —
 * but only AFTER the gate is live, because P887 auto-runs that smoke after every prod
 * migrate and a premature 403 assertion would fail unrelated migrations.
 *
 * Run: VERIFY_PROD=1 npx playwright test e2e/p886-reproduce.spec.ts
 * Env (from .env.local): PROD_SUPABASE_ANON_KEY, PROD_TEST_AGENT_EMAIL, PROD_TEST_AGENT_PASSWORD
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const PROD_URL = process.env.PROD_SUPABASE_URL ?? 'https://besjtuodziykmjidubzw.supabase.co';
const PROD_ANON_KEY = process.env.PROD_SUPABASE_ANON_KEY;
const AGENT_EMAIL = process.env.PROD_TEST_AGENT_EMAIL;
const AGENT_PASSWORD = process.env.PROD_TEST_AGENT_PASSWORD;

const PII_COLUMNS = ['email', 'linkedin_url', 'reason'] as const;

test.skip(!process.env.VERIFY_PROD, 'Set VERIFY_PROD=1 to run prod verification');

function makeAnonClient() {
  return createClient(PROD_URL, PROD_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeUserClient(accessToken: string) {
  return createClient(PROD_URL, PROD_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe('P886: prod profiles PII column gate is re-applied', () => {
  test.beforeAll(() => {
    expect(PROD_ANON_KEY, 'PROD_SUPABASE_ANON_KEY missing — source .env.local').toBeTruthy();
  });

  // S1, S2, S3 — anon key must NOT read PII columns off the raw table.
  // Pre-fix (mitigation state): error is null and all rows come back — the leak.
  for (const col of PII_COLUMNS) {
    test(`anon key cannot SELECT ${col} from prod profiles`, async () => {
      const anon = makeAnonClient();

      const { data, error } = await anon.from('profiles').select(col).limit(1);

      expect(
        error,
        `anon key was able to read profiles.${col} on prod — column gate is OFF`
      ).not.toBeNull();
      expect(error?.code).toMatch(/42501|PGRST301/);
      expect(data, `profiles.${col} rows leaked to the anon client`).toBeNull();
    });
  }

  // S4 — the revoke must hit the authenticated role too: a logged-in user cannot
  // read ANOTHER user's email. (Own-email reads go through get_profile_by_id.)
  test("authenticated user cannot SELECT another user's email on prod", async () => {
    expect(AGENT_EMAIL, 'PROD_TEST_AGENT_EMAIL missing — source .env.local').toBeTruthy();
    expect(AGENT_PASSWORD, 'PROD_TEST_AGENT_PASSWORD missing — source .env.local').toBeTruthy();

    const anon = makeAnonClient();
    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
      email: AGENT_EMAIL!,
      password: AGENT_PASSWORD!,
    });
    expect(signInErr, `prod test agent sign-in failed: ${signInErr?.message}`).toBeNull();

    const agentClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await agentClient
      .from('profiles')
      .select('email')
      .neq('id', signIn!.user!.id) // someone else's row
      .limit(1);

    expect(
      error,
      "authenticated role was able to read another user's email on prod — gate is OFF"
    ).not.toBeNull();
    expect(error?.code).toMatch(/42501|PGRST301/);
    expect(data, 'another user’s email row leaked to an authenticated client').toBeNull();
  });

  // S5 — over-revoke regression guard. Display columns MUST stay anon-readable
  // (avatars, names, the public wall). Passes before and after the fix; fails only
  // if the re-applied gate revokes too much (auth flows would 403 again → incident repeat).
  test('anon key CAN still SELECT display columns on prod (over-revoke guard)', async () => {
    const anon = makeAnonClient();

    const { data, error } = await anon
      .from('profiles')
      .select('id, name, slug, avatar_color, is_verified, has_pledged')
      .limit(1);

    expect(error, `display columns must remain anon-readable: ${error?.message}`).toBeNull();
    expect(data?.length, 'expected at least one readable profile row').toBeGreaterThan(0);
  });

  // S6 — accessor rollback guard. The P877 SECURITY DEFINER RPCs (sections 1–2 of the
  // migration) survived the mitigation and must keep working — the deployed frontend
  // depends on them. Passes before and after the fix.
  test('P877 RPC accessors are live on prod (get_featured_profiles)', async () => {
    const anon = makeAnonClient();

    const { data, error } = await anon.rpc('get_featured_profiles', { p_limit: 1 });

    expect(error, `get_featured_profiles failed on prod: ${error?.message}`).toBeNull();
    expect(Array.isArray(data), 'get_featured_profiles must return a JSONB array').toBe(true);
  });
});
