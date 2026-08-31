/**
 * @file p1076-org-invite-attribution-migration.spec.ts
 * @description Integration tests for the P1076 migration
 *   (supabase/migrations/20260813180000_p1076_org_invite_attribution.sql):
 *   `membership.invited_by` column, the `membership_validate_invited_by` trigger,
 *   and the column-gated SELECT grant.
 *
 * Two-client pattern (P270, mandatory): supabaseAdmin proves the schema/trigger
 * behavior directly; anon/user-scoped clients prove invited_by is not readable
 * through the ordinary RLS-gated read path (Non-Goal: "never display attribution").
 *
 * Must-fix items this file specifically proves (spec Risks):
 *   (A) A valid inviter id is stored on join.
 *   (B) A well-formed-but-nonexistent uuid is stored as NULL, never the raw value,
 *       and the join itself never fails because of it.
 *   (C) No ?from= (or an already-invalid one filtered client-side) joins identically.
 *   (D) invited_by is not selectable by anon/authenticated via direct REST — the
 *       column-gate grant — while the service-role admin client CAN read it.
 *
 * Also includes the ALLOWED_REDIRECT_PREFIXES regression test for '/org' (P458
 * precedent — the same allowlist-omission class that shipped 3 times before).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';
import {
  createTestOrganization,
  deleteTestOrganization,
  type TestOrganization,
} from '../helpers/test-organization';

function makeAnonClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function makeUserClient(email: string) {
  const tmp = makeAnonClient();
  const { data: signIn, error } = await tmp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !signIn.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

test.describe('P1076: membership.invited_by — column, trigger, column-gate', () => {
  test.describe.configure({ mode: 'serial' });

  let joinerId: string, joinerEmail: string;
  let inviterId: string;
  let org: TestOrganization;

  test.beforeAll(async () => {
    const joiner = await createTestUser({ name: 'P1076-int Joiner' });
    joinerId = joiner.user.id; joinerEmail = joiner.email;

    const inviter = await createTestUser({ name: 'P1076-int Inviter' });
    inviterId = inviter.user.id;

    org = await createTestOrganization({ name: 'P1076 Invite Attribution Org' });
  });

  test.afterAll(async () => {
    await deleteTestOrganization(org.id);
    await Promise.all([joinerId, inviterId].map((id) => deleteTestUser(id)));
  });

  test('invited_by column exists', async () => {
    const { error } = await supabaseAdmin
      .from('membership')
      .select('invited_by')
      .limit(1);
    expect(error, `Migration not applied: run ./scripts/migrate.sh. Error: ${error?.message}`).toBeNull();
  });

  test('valid inviter id is stored on join', async () => {
    const me = await makeUserClient(joinerEmail);
    const { error } = await me
      .from('membership')
      .insert({ org_id: org.id, user_id: joinerId, invited_by: inviterId });
    expect(error, `join with a valid invited_by must succeed: ${error?.message}`).toBeNull();

    const { data } = await supabaseAdmin
      .from('membership')
      .select('invited_by')
      .eq('org_id', org.id)
      .eq('user_id', joinerId)
      .single();
    expect(data?.invited_by, 'a valid inviter id must be stored verbatim').toBe(inviterId);

    await supabaseAdmin.from('membership').delete().eq('org_id', org.id).eq('user_id', joinerId);
  });

  test('forged/nonexistent invited_by is nulled — join still succeeds', async () => {
    const forgedButWellFormed = '00000000-0000-4000-8000-000000000000'; // valid UUID shape, no profiles row
    const me = await makeUserClient(joinerEmail);
    const { error } = await me
      .from('membership')
      .insert({ org_id: org.id, user_id: joinerId, invited_by: forgedButWellFormed });
    expect(error, `join must succeed even with a forged invited_by: ${error?.message}`).toBeNull();

    const { data } = await supabaseAdmin
      .from('membership')
      .select('invited_by')
      .eq('org_id', org.id)
      .eq('user_id', joinerId)
      .single();
    expect(data?.invited_by, 'trigger must null out a value that resolves to no profile').toBeNull();

    await supabaseAdmin.from('membership').delete().eq('org_id', org.id).eq('user_id', joinerId);
  });

  test('no invited_by (link stripped of ?from=) joins identically', async () => {
    const me = await makeUserClient(joinerEmail);
    const { data, error } = await me
      .from('membership')
      .insert({ org_id: org.id, user_id: joinerId })
      .select('role, terms_version')
      .single();
    expect(error, `join without invited_by must succeed: ${error?.message}`).toBeNull();
    expect(data?.role).toBe('member');

    const { data: check } = await supabaseAdmin
      .from('membership')
      .select('invited_by')
      .eq('org_id', org.id)
      .eq('user_id', joinerId)
      .single();
    expect(check?.invited_by).toBeNull();

    await supabaseAdmin.from('membership').delete().eq('org_id', org.id).eq('user_id', joinerId);
  });

  test('invited_by is NOT selectable by anon or authenticated (column-gate)', async () => {
    await supabaseAdmin.from('membership').insert({ org_id: org.id, user_id: joinerId, invited_by: inviterId });
    try {
      const anon = makeAnonClient();
      const { error: anonErr } = await anon.from('membership').select('invited_by').limit(1);
      expect(anonErr, 'anon must be denied SELECT on invited_by').not.toBeNull();
      expect(anonErr?.code).toBe('42501');

      const me = await makeUserClient(joinerEmail);
      const { error: authErr } = await me.from('membership').select('invited_by').limit(1);
      expect(authErr, 'authenticated must be denied SELECT on invited_by too').not.toBeNull();
      expect(authErr?.code).toBe('42501');

      // The safe column list must remain unaffected by the REVOKE/re-GRANT.
      const { error: safeErr } = await anon.from('membership').select('id, role, terms_version').limit(1);
      expect(safeErr, 'the pre-existing safe columns must still be readable').toBeNull();

      // The admin (service-role) client bypasses grants entirely — this is the
      // control proving the denial above is the grant, not a broken query.
      const { data: adminData, error: adminErr } = await supabaseAdmin
        .from('membership').select('invited_by').eq('org_id', org.id).eq('user_id', joinerId).single();
      expect(adminErr).toBeNull();
      expect(adminData?.invited_by).toBe(inviterId);
    } finally {
      await supabaseAdmin.from('membership').delete().eq('org_id', org.id).eq('user_id', joinerId);
    }
  });
});

test.describe('P1076: ALLOWED_REDIRECT_PREFIXES — /org must be present', () => {
  // Same class of gap as P458 (/point/, /chat) and P486 (/create): without /org in
  // the list, a signed-out visitor completing auto-join falls through to /feed
  // instead of landing on the org page. Source-read, no runtime needed.
  test('/org prefix is in ALLOWED_REDIRECT_PREFIXES (P1076 auto-join requires it)', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');

    const authCallbackPath = resolve(process.cwd(), 'src/auth/AuthCallbackPage.tsx');
    let source: string;
    try {
      source = readFileSync(authCallbackPath, 'utf-8');
    } catch {
      test.skip(true, 'AuthCallbackPage.tsx not found — cannot verify ALLOWED_REDIRECT_PREFIXES');
      return;
    }

    const match = source.match(/ALLOWED_REDIRECT_PREFIXES\s*=\s*\[([^\]]+)\]/);
    expect(match, 'ALLOWED_REDIRECT_PREFIXES constant not found in AuthCallbackPage.tsx').not.toBeNull();

    const prefixList = match![1];
    expect(
      prefixList,
      'ALLOWED_REDIRECT_PREFIXES must include /org — already-shared invite links still arrive on it, and this allowlist is checked BEFORE any router redirect can normalise the path',
    ).toContain('/org');
    // P1193: the renamed route. Without it, every auto-join from a link minted after
    // the rename fails the allowlist and drops the user on /feed.
    expect(
      prefixList,
      'ALLOWED_REDIRECT_PREFIXES must include /groups — required for P1076 auto-join after the P1193 rename',
    ).toContain('/groups');
  });

  // Code-review finding (2026-08-13): the first version of this gate checked
  // `redirectPath.includes('/join')` against the RAW string before splitting on
  // '?' — so `/org/cm?x=/join` (not the join page at all) matched, because the
  // literal substring '/join' appears inside the query string. Extracts the
  // ACTUAL shipped regex from source and applies it the same way the real code
  // does — split on '?' FIRST, then test only the path part — so this proves the
  // real two-step gate, not just the regex in isolation (which alone still matches
  // the unsplit bypass string, since '/join' legitimately sits at its end too).
  test('auto-join path match rejects a bypass redirect that only has "/join" in its query string', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const source = readFileSync(resolve(process.cwd(), 'src/auth/AuthCallbackPage.tsx'), 'utf-8');

    // Capture the pattern body only (between the / delimiters) — constructed via
    // `new RegExp(...)`, not eval, so this never executes source text as code.
    const match = source.match(/\/(\^\\\/\(org\|groups\)\\\/.*?\$)\//);
    expect(match, 'the org join-path regex was not found in AuthCallbackPage.tsx — did the pattern change?').not.toBeNull();
    const orgJoinPathRegex = new RegExp(match![1]);
    const matchesRealJoinPath = (redirectPath: string) => orgJoinPathRegex.test(redirectPath.split('?')[0]);

    expect(matchesRealJoinPath('/org/cm/join'), 'a real join path must match').toBe(true);
    expect(
      matchesRealJoinPath('/org/cm?x=/join'),
      'a redirect with "/join" only in its query string must NOT match — auto-join must never fire without a real join-page path',
    ).toBe(false);
    expect(matchesRealJoinPath('/org/cm/joinery'), 'a path merely starting with /join must NOT match').toBe(false);
    expect(matchesRealJoinPath('/org/cm/join/extra'), 'a path with trailing segments must NOT match').toBe(false);

    // P1193: the renamed path must match, and must inherit the SAME bypass rejections
    // rather than a looser second branch. Widening a security-relevant regex is exactly
    // where a new alternative gets added without the anchors that made the old one safe.
    expect(matchesRealJoinPath('/groups/cm/join'), 'the renamed join path must match').toBe(true);
    expect(
      matchesRealJoinPath('/groups/cm?x=/join'),
      'the query-string bypass must be rejected on the renamed path too',
    ).toBe(false);
    expect(matchesRealJoinPath('/groups/cm/joinery'), 'a path merely starting with /join must NOT match').toBe(false);
    expect(matchesRealJoinPath('/groups/cm/join/extra'), 'a path with trailing segments must NOT match').toBe(false);
    // Neither the old nor the new noun may be spelled as a free-for-all.
    expect(matchesRealJoinPath('/orgs/cm/join'), 'an unlisted noun must NOT match').toBe(false);
    expect(matchesRealJoinPath('/group/cm/join'), 'an unlisted noun must NOT match').toBe(false);
  });
});
