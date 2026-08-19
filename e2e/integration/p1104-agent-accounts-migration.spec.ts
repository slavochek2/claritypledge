/**
 * @file p1104-agent-accounts-migration.spec.ts
 * @description P270 migration integration test for P1104's `agent_accounts` table,
 * `create_or_reuse_agent_account` RPC, and the `Agent ·` prefix guard added to
 * `upsert_my_profile`.
 *
 * TWO-CLIENT PATTERN (mandatory — .claude/rules/tests.md P270, migration-template.spec.ts):
 * - supabaseAdmin (service_role): schema-level checks and the sanctioned write path.
 * - user-scoped / anon clients: RLS and column-GRANT assertions. Service role bypasses
 *   RLS, so a policy bug is invisible to it.
 */

import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestAgentAccount, deleteTestAgentAccount, type TestAgentAccount } from '../helpers/test-agent-account';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** Bare anon client — no session. Used for anon-role GRANT/RLS assertions. */
function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * A client carrying a real user JWT. Deliberately never signs in on `supabaseAdmin`
 * itself — that would mutate its in-memory session and every later admin call in this
 * file would run as that user instead of service_role.
 */
async function userClient(email: string): Promise<SupabaseClient> {
  const signInClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await signInClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) {
    throw new Error(`[TEST] Failed to sign in ${email}: ${error?.message}`);
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Mints an auth user so a RPC call has a valid, FK-satisfying profile id to propose. */
async function mintAuthUser(): Promise<string> {
  const email = `e2e-p1104-mig-${Date.now()}-${Math.floor(Math.random() * 100000)}@claritypledge-test.com`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: false });
  if (error || !data?.user) throw new Error(`mintAuthUser failed: ${error?.message}`);
  return data.user.id;
}

test.describe('Migration: P1104 agent_accounts table + RPCs', () => {
  test.describe.configure({ timeout: 90000 });

  let authedUser: TestUser;
  let authed: SupabaseClient;
  let fixtureAccount: TestAgentAccount;
  const createdProfileIds: string[] = [];
  const strayAuthUserIds: string[] = [];

  test.beforeAll(async () => {
    authedUser = await createTestUser({ name: 'P1104 Migration Authed User' });
    authed = await userClient(authedUser.email);

    fixtureAccount = await createTestAgentAccount({ subject: 'P1104 Migration Fixture Subject' });
    createdProfileIds.push(fixtureAccount.profileId);
  });

  test.afterAll(async () => {
    for (const profileId of createdProfileIds) await deleteTestAgentAccount(profileId);
    for (const id of strayAuthUserIds) await supabaseAdmin.auth.admin.deleteUser(id);
    if (authedUser?.user?.id) await deleteTestUser(authedUser.user.id);
  });

  // ── Schema existence (service role) ──────────────────────────────────────

  test('agent_accounts table exists with expected columns', async () => {
    const { error } = await supabaseAdmin
      .from('agent_accounts')
      .select('profile_id, subject_key, operator_name, created_at')
      .limit(1);

    expect(error, 'Migration not applied: agent_accounts missing expected columns. Run ./scripts/migrate.sh').toBeNull();
  });

  // ── Column-level GRANT (Decision 1) ──────────────────────────────────────

  test('authenticated client CAN select profile_id and operator_name', async () => {
    const { error } = await authed.from('agent_accounts').select('profile_id, operator_name').limit(1);
    expect(error).toBeNull();
  });

  test('authenticated client CANNOT select subject_key — returns 42501', async () => {
    const { error } = await authed.from('agent_accounts').select('subject_key').limit(1);
    expect(error, 'subject_key must not be client-readable (P1104 Decision 1)').not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  test('authenticated client select(*) fails loud rather than silently dropping subject_key', async () => {
    const { error } = await authed.from('agent_accounts').select('*').limit(1);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  test('anon client CAN select profile_id and operator_name, CANNOT select subject_key', async () => {
    const anon = anonClient();

    const { error: allowedError } = await anon.from('agent_accounts').select('profile_id, operator_name').limit(1);
    expect(allowedError, 'the client-side registry lookup depends on anon being able to read these').toBeNull();

    const { error: deniedError } = await anon.from('agent_accounts').select('subject_key').limit(1);
    expect(deniedError).not.toBeNull();
    expect(deniedError!.code).toBe('42501');
  });

  // ── Write path is service_role only ──────────────────────────────────────

  test('authenticated client cannot INSERT into agent_accounts', async () => {
    const { error } = await authed.from('agent_accounts').insert({
      profile_id: authedUser.user.id,
      subject_key: `p1104-should-not-insert-${Date.now()}`,
      operator_name: 'Should Not Work',
    });
    expect(error, 'no authenticated user may self-register as an agent').not.toBeNull();
  });

  test('anon client cannot INSERT into agent_accounts', async () => {
    const { error } = await anonClient().from('agent_accounts').insert({
      profile_id: authedUser.user.id,
      subject_key: `p1104-anon-should-not-insert-${Date.now()}`,
      operator_name: 'Should Not Work',
    });
    expect(error).not.toBeNull();
  });

  test('authenticated client cannot UPDATE an existing agent_accounts row', async () => {
    const { error } = await authed
      .from('agent_accounts')
      .update({ operator_name: 'Hijacked Operator' })
      .eq('profile_id', fixtureAccount.profileId);
    expect(error).not.toBeNull();

    const { data } = await supabaseAdmin
      .from('agent_accounts').select('operator_name').eq('profile_id', fixtureAccount.profileId).single();
    expect(data?.operator_name).toBe(fixtureAccount.operatorName);
  });

  test('authenticated client cannot DELETE an agent_accounts row', async () => {
    const { error } = await authed.from('agent_accounts').delete().eq('profile_id', fixtureAccount.profileId);
    expect(error).not.toBeNull();

    const { data } = await supabaseAdmin
      .from('agent_accounts').select('profile_id').eq('profile_id', fixtureAccount.profileId).single();
    expect(data?.profile_id, 'deleting the registry row would make this account render as a person').toBe(fixtureAccount.profileId);
  });

  // ── create_or_reuse_agent_account: EXECUTE grant (Decision 2) ─────────────

  test('authenticated client cannot execute create_or_reuse_agent_account', async () => {
    const { error } = await authed.rpc('create_or_reuse_agent_account', {
      p_profile_id: authedUser.user.id,
      p_subject_key: `p1104-authed-rpc-should-fail-${Date.now()}`,
      p_email: authedUser.email,
      p_name: 'Agent · Should Not Be Created',
      p_slug: `agent-should-not-be-created-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#39424B',
      p_operator_name: 'Should Not Work',
    });
    expect(error, 'create_or_reuse_agent_account must be service_role-only (P1104 Decision 2)').not.toBeNull();
  });

  test('service_role can execute create_or_reuse_agent_account', async () => {
    const proposedId = await mintAuthUser();
    strayAuthUserIds.push(proposedId);

    const { data, error } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: proposedId,
      p_subject_key: `p1104-service-role-rpc-${Date.now()}`,
      p_email: `p1104-sr-${Date.now()}@claritypledge-test.com`,
      p_name: 'Agent · Service Role Test Subject',
      p_slug: `agent-service-role-test-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#39424B',
      p_operator_name: 'Migration Test Operator',
    });

    expect(error).toBeNull();
    expect(data).toBe(proposedId);
    if (data) createdProfileIds.push(data as string);
  });

  // ── The Non-Goal enforced at the data layer ──────────────────────────────

  test('a created agent account holds no pledge, no verification and no reputation', async () => {
    // profiles.has_pledged DEFAULTS TO TRUE (20250101_initial_schema.sql:15). An RPC that
    // omits the column creates every agent already holding a pledge, which lights the
    // pledger ring before any UI is involved and violates the spec's Non-Goal directly.
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('has_pledged, is_verified, ears_count')
      .eq('id', fixtureAccount.profileId)
      .single();

    expect(error).toBeNull();
    expect(data?.has_pledged, 'an agent account must never hold a pledge').toBe(false);
    expect(data?.is_verified).toBe(false);
    expect(data?.ears_count, 'an agent account must never hold a reputation count').toBe(0);
  });

  test('the RPC refuses an empty operator_name and leaves no profile behind', async () => {
    // The public-figure policy approval is conditional on a named operator, so an agent
    // with none is refused in the function rather than left to caller discipline.
    const proposedId = await mintAuthUser();
    strayAuthUserIds.push(proposedId);

    const { error } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: proposedId,
      p_subject_key: `p1104-empty-operator-${Date.now()}`,
      p_email: `p1104-eo-${Date.now()}@claritypledge-test.com`,
      p_name: 'Agent · No Operator',
      p_slug: `agent-no-operator-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#39424B',
      p_operator_name: '   ',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/operator_name/i);

    const { data: orphan } = await supabaseAdmin
      .from('profiles').select('id').eq('id', proposedId).maybeSingle();
    expect(orphan, 'a refused call must leave no profile row').toBeNull();
  });

  // ── Reuse semantics ──────────────────────────────────────────────────────

  test('two calls with the same subject_key reuse the row and create exactly one profile', async () => {
    const subjectKey = `p1104-reuse-test-${Date.now()}`;
    const firstId = await mintAuthUser();
    strayAuthUserIds.push(firstId);

    const { data: first, error: firstError } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: firstId,
      p_subject_key: subjectKey,
      p_email: `p1104-reuse-a-${Date.now()}@claritypledge-test.com`,
      p_name: 'Agent · Reuse Test Subject',
      p_slug: `agent-reuse-test-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#39424B',
      p_operator_name: 'Migration Test Operator',
    });
    expect(firstError).toBeNull();
    createdProfileIds.push(first as string);

    const secondId = await mintAuthUser();
    strayAuthUserIds.push(secondId);

    const { data: second, error: secondError } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: secondId,
      p_subject_key: subjectKey,
      // Deliberately different name/slug/operator: if this created a second row rather
      // than reusing, these values would have to land somewhere.
      p_email: `p1104-reuse-b-${Date.now()}@claritypledge-test.com`,
      p_name: 'Agent · Reuse Test Subject (second call)',
      p_slug: `agent-reuse-test-second-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#39424B',
      p_operator_name: 'A Different Operator',
    });
    expect(secondError).toBeNull();
    expect(second, 'reuse must return the id from the FIRST call, not the proposed one').toBe(first);
    expect(second).not.toBe(secondId);

    const { data: registryRows } = await supabaseAdmin
      .from('agent_accounts').select('profile_id').eq('subject_key', subjectKey);
    expect(registryRows?.length).toBe(1);

    // The second call's name must NOT have overwritten the first — reuse short-circuits
    // before any write.
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('name').eq('id', first as string).single();
    expect(profile?.name).toBe('Agent · Reuse Test Subject');

    // And the second call must not have created a profile for its own proposed id.
    const { data: secondProfile } = await supabaseAdmin
      .from('profiles').select('id').eq('id', secondId).maybeSingle();
    expect(secondProfile, 'the reuse branch must not create a second profile').toBeNull();
  });

  // ── Atomicity ────────────────────────────────────────────────────────────

  test('a failing call (duplicate slug) leaves no orphan profiles row and no orphan registry row', async () => {
    // profiles.slug is UNIQUE (20250101_initial_schema.sql:7) and NOT NULL since P736.
    // Reusing the fixture's slug under a NEW subject_key makes the profiles INSERT inside
    // the function body raise, so the whole transaction must roll back.
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles').select('slug').eq('id', fixtureAccount.profileId).single();
    const collidingSlug = existingProfile!.slug as string;

    const newSubjectKey = `p1104-atomicity-test-${Date.now()}`;
    const proposedId = await mintAuthUser();
    strayAuthUserIds.push(proposedId);

    const { data, error } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: proposedId,
      p_subject_key: newSubjectKey,
      p_email: `p1104-atom-${Date.now()}@claritypledge-test.com`,
      p_name: 'Agent · Atomicity Test Subject',
      p_slug: collidingSlug, // deliberate collision
      p_avatar_url: null,
      p_avatar_color: '#39424B',
      p_operator_name: 'Migration Test Operator',
    });

    expect(error, 'duplicate slug must raise, not silently succeed').not.toBeNull();
    expect(data).toBeFalsy();

    const { data: profilesWithSlug } = await supabaseAdmin
      .from('profiles').select('id').eq('slug', collidingSlug);
    expect(profilesWithSlug?.length, 'no orphan profiles row for the failed attempt').toBe(1);
    expect(profilesWithSlug?.[0]?.id).toBe(fixtureAccount.profileId);

    const { data: registryRows } = await supabaseAdmin
      .from('agent_accounts').select('profile_id').eq('subject_key', newSubjectKey);
    expect(registryRows?.length, 'no orphan agent_accounts row for the failed attempt').toBe(0);
  });

  // ── upsert_my_profile: reserved "Agent ·" prefix guard (Decision 4) ───────

  // Every entry below renders visually identical (or near-identical) to the reserved
  // "Agent · " form. The nine marked HARDENING were ACCEPTED by the guard as originally
  // written and were caught by probing the live DB during adversarial review, not by any
  // test — invisible characters split the token so the regex never saw the prefix.
  // 20260819140000 normalizes them away before matching. Do not narrow this list.
  const rejectedNames: Array<[string, string]> = [
    ['the exact reserved form', 'Agent · Real Public Figure'],
    ['no space, lowercase', 'agent·no space variant'],
    ['leading whitespace, uppercase', '   AGENT · Whitespace And Case Variant'],
    ['double space — collapses to the reserved form when rendered as HTML', 'Agent  · Double Space Variant'],
    ['tab separator', 'Agent\t· Tab Variant'],
    ['bullet homoglyph', 'Agent • Bullet Variant'],
    ['HARDENING: U+200B zero-width space', 'Agent​· Real Public Figure'],
    ['HARDENING: U+200D zero-width joiner', 'Agent‍· Real Public Figure'],
    ['HARDENING: U+200F right-to-left mark', 'Agent‏· Real Public Figure'],
    ['HARDENING: U+2060 word joiner', 'Agent⁠· Real Public Figure'],
    ['HARDENING: leading zero-width before Agent', '​Agent · Real Public Figure'],
    ['HARDENING: Cyrillic А homoglyph', 'Аgent · Real Public Figure'],
    ['HARDENING: fullwidth Ａ', 'Ａgent · Real Public Figure'],
    ['HARDENING: U+2024 one-dot leader', 'Agent ․ Real Public Figure'],
    ['HARDENING: U+FF65 halfwidth katakana middle dot', 'Agent ･ Real Public Figure'],
  ];

  for (const [label, name] of rejectedNames) {
    test(`upsert_my_profile rejects a display name using the reserved prefix — ${label}`, async () => {
      const { error } = await authed.rpc('upsert_my_profile', {
        p_data: {
          email: authedUser.email,
          name,
          slug: authedUser.slug,
          role: 'Test Engineer',
          avatar_color: '#4A90E2',
        },
      });

      expect(error, `"${name}" must not be settable by a human account`).not.toBeNull();
      expect(error!.message).toMatch(/reserved/i);
    });
  }

  test('upsert_my_profile still accepts an ordinary display name', async () => {
    const newName = `P1104 Migration Ordinary Name ${Date.now()}`;
    const { error } = await authed.rpc('upsert_my_profile', {
      p_data: {
        email: authedUser.email,
        name: newName,
        slug: authedUser.slug,
        role: 'Test Engineer',
        avatar_color: '#4A90E2',
      },
    });

    expect(error, 'the guard must not block names that merely contain the word agent').toBeNull();

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('name').eq('id', authedUser.user.id).single();
    expect(profile?.name).toBe(newName);
  });

  // The guard must DISCRIMINATE, not blanket-reject. Without these, a guard that rejected
  // every name would pass every rejection case above and look correct.
  const acceptedNames: Array<[string, string]> = [
    ['a name that merely contains "agent"', 'Agentina Testperson'],
    ['"Agent" with no separator at all', 'Agent Smith'],
    ['a real name containing a middle dot', 'Jean · Pierre'],
    ['a name starting with another word plus a middle dot', 'Author · Someone'],
  ];

  for (const [label, base] of acceptedNames) {
    test(`upsert_my_profile still accepts ${label}`, async () => {
      const { error } = await authed.rpc('upsert_my_profile', {
        p_data: {
          email: authedUser.email,
          name: `${base} ${Date.now()}`,
          slug: authedUser.slug,
          role: 'Test Engineer',
          avatar_color: '#4A90E2',
        },
      });
      expect(error, 'the guard is a prefix+separator reservation, not a word ban').toBeNull();
    });
  }
});
