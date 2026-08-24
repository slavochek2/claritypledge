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
      p_slug: `machine-should-not-be-created-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#0044CC',
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
      p_slug: `machine-service-role-test-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#0044CC',
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
      p_slug: `machine-no-operator-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#0044CC',
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
      p_slug: `machine-reuse-test-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#0044CC',
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
      p_slug: `machine-reuse-test-second-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#0044CC',
      // The SAME operator. Reuse under a different operator is now refused outright —
      // see 'reuse under a different operator is refused rather than silently
      // mislabelled'. This case is about reuse itself, not about operator identity.
      p_operator_name: 'Migration Test Operator',
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
      p_avatar_color: '#0044CC',
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

    // ── Second hardening pass (20260820091000 + 20260820092000) ──────────────
    // Every case above hides a character BETWEEN "Agent" and the separator. The guard was
    // still fully bypassable by hiding one INSIDE the word: the tokenizer split on any
    // non-alphanumeric run, so "Ag<invisible>ent" produced the head token 'ag', not 'agent',
    // and the name passed as ordinary. Found by /finish's migration reviewer and confirmed
    // against the live test DB — all five below returned NOT-reserved before the fix, while
    // rendering identically to the reserved marker in a browser.
    //
    // Direction of harm: this is the guard's INVERSE failure. It never let an agent escape the
    // marker; it let a HUMAN wear it, keeping a real pledge ring, round avatar and ear count.
    //
    // Written with explicit \u escapes on purpose — the first probe of this class used pasted
    // literals, two of which did not survive the file write and silently tested the wrong
    // string. Escapes are verifiable by reading; a pasted invisible is not.
    ['HARDENING-2: U+FE0F variation selector inside the word', 'Ag️ent · Real Public Figure'],
    ['HARDENING-2: U+FE0E variation selector inside the word', 'Ag︎ent · Real Public Figure'],
    ['HARDENING-2: U+E0067 Unicode tag character inside the word', 'Ag\u{E0067}ent · Real Public Figure'],
    ['HARDENING-2: U+200B zero-width INSIDE the word', 'Ag​ent · Real Public Figure'],
    ['HARDENING-2: U+200C zero-width non-joiner inside the word', 'Ag‌ent · Real Public Figure'],
    // A different class again: NFKC *composes* A + U+0301 into Á, which IS alphanumeric, so no
    // amount of stripping reaches it. 20260820092000 switches to NFKD so the combining mark
    // stays separate and the allow-list removes it.
    ['HARDENING-2: U+0301 combining acute on the A', 'Ágent · Real Public Figure'],
  ];

  // The guard must not become a land-grab on ordinary names. These stay AVAILABLE — asserted
  // because the fix widened what counts as "agent", and a widening with no counter-test is how
  // a guard quietly starts rejecting real people.
  const allowedNames: Array<[string, string]> = [
    ['Agent Smith — a surname, no separator', 'Agent Smith'],
    ['Agentic Systems — longer word', 'Agentic Systems'],
    ['agenda item — shares a prefix', 'agenda item'],
    ['bare Agent — the word alone', 'Agent'],
    ['Jane Agent — not the head token', 'Jane Agent'],
    ['Jose Garcia — diacritics must survive NFKD', 'José García'],
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

  // ── The reservation must hold at the TABLE, not only in the RPC ────────────
  // Adversarial review measured this: settings-page -> updateProfile writes
  // profiles.name with a DIRECT table update, and `authenticated` holds a table-level
  // UPDATE grant. Two rounds of regex hardening guarded upsert_my_profile — a function
  // the running product does not call to change a name. These cases bind the door that
  // is actually used.
  for (const [label, name] of rejectedNames) {
    test(`a DIRECT profiles.update is refused for the reserved form — ${label}`, async () => {
      const { error } = await authed.from('profiles').update({ name }).eq('id', authedUser.user.id);
      expect(error, `"${name}" must not be settable by a direct table update either`).not.toBeNull();
    });
  }

  for (const [label, name] of allowedNames) {
    test(`an ordinary name is still available — ${label}`, async () => {
      const { error } = await authed.rpc('upsert_my_profile', {
        p_data: {
          email: authedUser.email,
          name,
          slug: authedUser.slug,
          role: 'Test Engineer',
          avatar_color: '#4A90E2',
        },
      });

      expect(
        error,
        `"${name}" is an ordinary name and must stay settable — the reservation must not ` +
        `widen into a land-grab on real people's names`,
      ).toBeNull();
    });
  }


  // ── the reserved "machine-" slug namespace (P1104 continuation) ───────────
  //
  // The name guard above closed the display-name channel in both directions. The URL was
  // left free-text, and a pasted link is the ONE surface where none of the other markers
  // travel — no chip, no drained card, no footer, no "Operated by" line renders until
  // someone clicks. Measured 2026-08-24: three agent accounts for real living public
  // figures already held /p/sam-harris, /p/william-macaskill and /p/johntheduncan.
  //
  // Both directions are asserted, because a rule that only forbids humans the prefix
  // without requiring machines to carry it defends nothing — that asymmetry is exactly
  // what 20260819160000 had to come back and fix for the name.
  const reservedSlugs: Array<[string, string]> = [
    ['the plain reserved form', 'machine-real-public-figure'],
    ['underscore separator', 'machine_real_public_figure'],
    ['full-stop separator', 'machine.real.public.figure'],
    ['uppercase', 'MACHINE-REAL-PUBLIC-FIGURE'],
    // Cyrillic а (U+0430) and с (U+0441) — distinct codepoints NFKC does not fold, so a
    // naive `slug LIKE 'machine-%'` check passes this straight through.
    ['Cyrillic homoglyphs', 'mасhine-real-public-figure'],
    ['the bare word', 'machine'],
  ];

  for (const [label, slug] of reservedSlugs) {
    test(`upsert_my_profile rejects a slug in the reserved namespace — ${label}`, async () => {
      const { error } = await authed.rpc('upsert_my_profile', {
        p_data: {
          email: authedUser.email,
          name: 'P1104 Migration Authed User',
          slug,
          role: 'Test Engineer',
          avatar_color: '#4A90E2',
        },
      });

      expect(error, `"${slug}" must be refused — it claims a machine account's URL`).not.toBeNull();
      expect(error!.message).toMatch(/reserved/i);
    });

    test(`a DIRECT profiles.update is refused for a reserved slug — ${label}`, async () => {
      // upsert_my_profile is SECURITY DEFINER, so the trigger's client-role branch never
      // fires inside it. This is the path the running product actually takes
      // (settings-page -> updateProfile -> `.from('profiles').update(...)`), and it is the
      // path the FIRST two rounds of name hardening failed to cover.
      const { error } = await authed.from('profiles').update({ slug }).eq('id', authedUser.user.id);

      expect(error, `a direct table UPDATE to "${slug}" must be refused`).not.toBeNull();
    });
  }

  // The control. Without it the reservation could widen into a land-grab and nothing
  // would notice — "machinery" and "my-machine" are ordinary words.
  for (const slug of ['machinery-corp', 'my-machine', 'sam-harris']) {
    test(`an ordinary slug is still available — ${slug}`, async () => {
      const unique = `${slug}-${Date.now()}`;
      const { error } = await authed.rpc('upsert_my_profile', {
        p_data: {
          email: authedUser.email,
          name: 'P1104 Migration Authed User',
          slug: unique,
          role: 'Test Engineer',
          avatar_color: '#4A90E2',
        },
      });

      expect(
        error,
        `"${unique}" is an ordinary slug and must stay settable — the reservation must ` +
        `not widen into a land-grab on real words`,
      ).toBeNull();
    });
  }

  test('an agent account may NOT be created outside the reserved slug namespace', async () => {
    // The positive assertion. Mirrors the bare-name test above: forbidding humans the
    // prefix while leaving it optional for agents is the weakest of the four possible
    // arrangements, and it is the one that shipped.
    const proposedId = await mintAuthUser();
    strayAuthUserIds.push(proposedId);

    const { error } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: proposedId,
      p_subject_key: `p1104-bare-slug-${Date.now()}`,
      p_email: `p1104-bare-slug-${Date.now()}@claritypledge-test.com`,
      p_name: 'Agent · Real Public Figure',
      p_slug: `real-public-figure-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#0044CC',
      p_operator_name: 'Test Operator',
    });

    expect(error, 'an agent holding a bare person URL must be refused').not.toBeNull();
    expect(error!.message).toMatch(/machine-/);
  });

  test('the trust-column pinning still works — the name guard did not disable it', async () => {
    // The first attempt at the table-level guard added SECURITY DEFINER to
    // guard_profile_trust_columns, which makes current_user the owner and silently
    // switches OFF the entire guard — including the is_verified / has_pledged pinning
    // P880 and P878 depend on. This asserts the guard's original job still happens.
    await supabaseAdmin.from('profiles')
      .update({ is_verified: false, has_pledged: false }).eq('id', authedUser.user.id);

    await authed.from('profiles')
      .update({ is_verified: true, has_pledged: true }).eq('id', authedUser.user.id);

    const { data } = await supabaseAdmin.from('profiles')
      .select('is_verified, has_pledged').eq('id', authedUser.user.id).single();
    expect(data?.is_verified, 'a client must not be able to self-verify').toBe(false);
    expect(data?.has_pledged, 'a client must not be able to self-pledge').toBe(false);
  });

  test('an agent account MUST carry the marker in its name', async () => {
    // Humans were forbidden the marker while agents were not required to carry it, so a
    // caller bug could register an agent named plainly after the real person. The name is
    // the only channel that reaches off-platform surfaces.
    const proposedId = await mintAuthUser();
    strayAuthUserIds.push(proposedId);

    const { error } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: proposedId,
      p_subject_key: `p1104-bare-name-${Date.now()}`,
      p_email: `p1104-bare-${Date.now()}@claritypledge-test.com`,
      p_name: 'A Real Public Figure',
      p_slug: `machine-bare-${Date.now()}`,
      p_avatar_url: null,
      p_avatar_color: '#0044CC',
      p_operator_name: 'Test Operator',
    });

    expect(error, 'an agent registered under a bare person name must be refused').not.toBeNull();
    expect(error!.message).toMatch(/marker/i);
  });

  test('a registry row cannot be deleted while its profile exists', async () => {
    const { error } = await supabaseAdmin
      .from('agent_accounts').delete().eq('profile_id', fixtureAccount.profileId);
    expect(error, 'orphaning a profile would make it render as a person').not.toBeNull();

    const { data } = await supabaseAdmin
      .from('agent_accounts').select('profile_id').eq('profile_id', fixtureAccount.profileId).maybeSingle();
    expect(data?.profile_id).toBe(fixtureAccount.profileId);
  });

  test('subject_key is stored trimmed, so whitespace variants are one subject not two', async () => {
    // Untrimmed, " key" and "key" were distinct subjects — two agents for one person,
    // able to hold opposing positions on the same point without tripping
    // UNIQUE(point_id, user_id), because they are different users.
    const key = `p1104-trim-${Date.now()}`;
    const firstId = await mintAuthUser();
    strayAuthUserIds.push(firstId);

    const { data: first, error: e1 } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: firstId, p_subject_key: `  ${key}  `,
      p_email: `p1104-trim-a-${Date.now()}@claritypledge-test.com`,
      p_name: 'Agent · Trim Subject', p_slug: `machine-trim-a-${Date.now()}`,
      p_avatar_url: null, p_avatar_color: '#0044CC', p_operator_name: 'Test Operator',
    });
    expect(e1).toBeNull();
    createdProfileIds.push(first as string);

    const secondId = await mintAuthUser();
    strayAuthUserIds.push(secondId);
    const { data: second, error: e2 } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: secondId, p_subject_key: key,
      p_email: `p1104-trim-b-${Date.now()}@claritypledge-test.com`,
      p_name: 'Agent · Trim Subject', p_slug: `machine-trim-b-${Date.now()}`,
      p_avatar_url: null, p_avatar_color: '#0044CC', p_operator_name: 'Test Operator',
    });
    expect(e2).toBeNull();
    expect(second, 'a whitespace variant must resolve to the SAME agent').toBe(first);
  });

  test('reuse under a different operator is refused rather than silently mislabelled', async () => {
    // The reuse branch returned the existing id and discarded the supplied operator, so
    // operator B could file content that every surface attributes to operator A. The
    // public-figure policy approval is conditional on the operator being answerable.
    const { error } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: await mintAuthUser(),
      p_subject_key: fixtureAccount.subjectKey,
      p_email: `p1104-op-${Date.now()}@claritypledge-test.com`,
      p_name: 'Agent · Migration Fixture Subject',
      p_slug: `machine-op-${Date.now()}`,
      p_avatar_url: null, p_avatar_color: '#0044CC',
      p_operator_name: 'A Completely Different Operator',
    });

    expect(error, 'reuse must not publish one operator content under another name').not.toBeNull();
    expect(error!.message).toMatch(/different operator/i);
  });

  test('an agent with a LIVE SESSION cannot verify, position or pledge itself', async () => {
    // "An agent cannot take a position on its own behalf" was a property of the FIXTURE —
    // it minted with no password and email_confirm:false. Neither is forbidden anywhere,
    // so a production filer minting a confirmable mailbox would have reopened the whole
    // escalation chain. This fixture deliberately mints a LOGINABLE, CONFIRMED auth user
    // and drives the chain with a real session, which is the case the old fixture could
    // not express.
    const email = `p1104-session-agent-${Date.now()}@claritypledge-test.com`;
    const { data: minted } = await supabaseAdmin.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const agentId = minted!.user.id;
    strayAuthUserIds.push(agentId);

    const { error: rpcError } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
      p_profile_id: agentId,
      p_subject_key: `p1104-session-${Date.now()}`,
      p_email: email,
      p_name: 'Agent · Session Subject',
      p_slug: `machine-session-${Date.now()}`,
      p_avatar_url: null, p_avatar_color: '#0044CC', p_operator_name: 'Test Operator',
    });
    expect(rpcError).toBeNull();

    const agentClient = await userClient(email);

    expect(
      await agentClient.rpc('mark_self_verified').then(r => r.data),
      'an agent must never become a verified account',
    ).toBe(false);

    expect(
      await agentClient.rpc('set_my_pledge', { p_pledged: true }).then(r => r.data),
      'an agent must never hold a pledge',
    ).toBe(false);

    const { data: after } = await supabaseAdmin
      .from('profiles').select('is_verified, has_pledged, ears_count').eq('id', agentId).single();
    expect(after?.is_verified).toBe(false);
    expect(after?.has_pledged).toBe(false);
    expect(after?.ears_count).toBe(0);
  });

  test('a human is unaffected by the agent guard — it discriminates', async () => {
    // Without this, a guard that refused everyone would pass the test above.
    const email = `p1104-control-human-${Date.now()}@claritypledge-test.com`;
    const { data: minted } = await supabaseAdmin.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
    });
    const humanId = minted!.user.id;
    strayAuthUserIds.push(humanId);
    await supabaseAdmin.from('profiles').insert({
      id: humanId, email, name: 'P1104 Control Human', slug: `p1104-control-${Date.now()}`,
    });

    const humanClient = await userClient(email);
    expect(await humanClient.rpc('mark_self_verified').then(r => r.data)).toBe(true);
    expect(await humanClient.rpc('set_my_pledge', { p_pledged: true }).then(r => r.data)).toBe(true);
  });

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
