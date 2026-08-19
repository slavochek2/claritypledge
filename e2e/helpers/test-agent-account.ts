/**
 * @file test-agent-account.ts
 *
 * E2E fixtures for P1104 agent accounts.
 *
 * P1096's pipeline is unbuilt, so no real agent account exists and no avatar has been
 * generated. Every P1104 test therefore runs against a SEEDED FIXTURE account created
 * through the sanctioned path — `create_or_reuse_agent_account` (Decision 2) — rather
 * than a raw `profiles` insert, so the fixture exercises the same atomicity guarantee
 * the tests assert.
 *
 * Two-step by necessity, not by choice: `profiles.id` is
 * `uuid references auth.users on delete cascade primary key`
 * (20250101_initial_schema.sql:6) with no default, and Postgres cannot mint a GoTrue
 * user. The caller creates the auth user first — the scripts/bootstrap-align-agent.mjs
 * pattern — then hands its id to the RPC, which commits the profile row and the registry
 * row together.
 */

import { supabaseAdmin } from './supabase-admin';

export interface TestAgentAccount {
  profileId: string;
  subjectKey: string;
  email: string;
  name: string;
  slug: string;
  operatorName: string;
}

/**
 * Creates a fixture agent account. A distinct `subject_key` per call by default, so
 * parallel test files never collide on the reuse branch.
 */
export async function createTestAgentAccount(options: {
  subject?: string;
  subjectKey?: string;
  operatorName?: string;
  avatarUrl?: string;
  avatarColor?: string;
} = {}): Promise<TestAgentAccount> {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const subject = options.subject ?? `E2E Test Subject ${unique}`;
  const subjectKey = options.subjectKey ?? `e2e-test-subject-key-${unique}`;
  const operatorName = options.operatorName ?? 'E2E Test Operator';
  const name = `Agent · ${subject}`;
  const slug = `agent-e2e-${unique}`;
  const email = `e2e-agent-${unique}@claritypledge-test.com`;

  console.log(`[TEST HELPER] Creating test agent account: ${name} (subject_key=${subjectKey})`);

  const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: false,
  });
  if (authError || !created?.user) {
    throw new Error(`Failed to mint auth user for test agent account: ${authError?.message}`);
  }
  const proposedId = created.user.id;

  const { data, error } = await supabaseAdmin.rpc('create_or_reuse_agent_account', {
    p_profile_id: proposedId,
    p_subject_key: subjectKey,
    p_email: email,
    p_name: name,
    p_slug: slug,
    p_avatar_url: options.avatarUrl ?? null,
    // A SATURATED default on purpose. The frozen avatar-generation prompt uses a slate
    // palette, so a near-grey fixture would make the "avatar is not drained" assertion
    // pass even if the avatar were being drained — the measurement could not tell the
    // two apart. Fixtures must be able to fail the test they exist to prove.
    p_avatar_color: options.avatarColor ?? '#0044CC',
    p_operator_name: operatorName,
  });

  if (error) {
    // NEVER delete on a bare error. A lost response is indistinguishable from a refusal
    // at this layer: the RPC may have COMMITTED and the reply been dropped, in which case
    // proposedId now owns a real profile + registry row, and deleting the auth user
    // cascades both away — the error handler destroying the account the call created.
    // Check what actually landed before cleaning anything up.
    const { data: landed } = await supabaseAdmin
      .from('agent_accounts')
      .select('profile_id')
      .eq('profile_id', proposedId)
      .maybeSingle();

    if (landed?.profile_id) {
      console.warn('[TEST HELPER] RPC reported an error but the account exists — treating as success');
      return { profileId: proposedId, subjectKey, email, name, slug, operatorName };
    }

    await supabaseAdmin.auth.admin.deleteUser(proposedId);
    console.error('[TEST HELPER] Failed to create test agent account:', error);
    throw new Error(`Failed to create test agent account: ${error.message}`);
  }

  const profileId = data as string;

  // The reuse branch returns an EXISTING id; the auth user just minted is then surplus.
  // Callers of this helper always pass a fresh subject_key, so this is a safety net, not
  // an expected path — but leaving orphaned auth users behind would pollute the test DB.
  if (profileId !== proposedId) {
    await supabaseAdmin.auth.admin.deleteUser(proposedId);
  }

  console.log(`[TEST HELPER] Test agent account created: ${profileId}`);

  return { profileId, subjectKey, email, name, slug, operatorName };
}

/**
 * Deletes a fixture agent account.
 *
 * Deleting the auth user cascades to `profiles` (`references auth.users on delete
 * cascade`), which cascades to `agent_accounts` (`REFERENCES profiles(id) ON DELETE
 * CASCADE`) — verified against the live test DB. Dependent content rows are removed
 * first so no FK blocks the delete, matching this repo's cleanup order.
 */
export async function deleteTestAgentAccount(profileId: string): Promise<void> {
  console.log(`[TEST HELPER] Deleting test agent account: ${profileId}`);

  await supabaseAdmin.from('point_positions').delete().eq('user_id', profileId);
  await supabaseAdmin.from('story_points').delete().eq('author_id', profileId);
  await supabaseAdmin.from('stories').delete().eq('author_id', profileId);

  const { error } = await supabaseAdmin.auth.admin.deleteUser(profileId);
  if (error) {
    console.warn('[TEST HELPER] Error deleting agent account auth user:', error.message);
  } else {
    console.log(`[TEST HELPER] Test agent account deleted: ${profileId}`);
  }
}

/**
 * Seeds a position held by an agent account.
 *
 * `createTestPosition` cannot be used for an agent: it signs in as the user and inserts
 * with their JWT, and the `point_positions` INSERT policy requires
 * `auth.uid() = user_id AND is_verified = true`. An agent account has no password and is
 * created `is_verified = false` on purpose, so BOTH halves of that policy refuse it.
 *
 * That refusal is a property worth keeping, not a problem to work around — an agent
 * account cannot take a position on its own behalf through any client path. Only
 * service_role can, which is how P1096's filer will do it. This helper writes the same
 * way, so the fixture matches the mechanism rather than a convenient substitute.
 */
export async function seedAgentPosition(
  pointId: string,
  agentProfileId: string,
  position: 'agree' | 'disagree' | 'unsure',
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('point_positions')
    .upsert(
      { point_id: pointId, user_id: agentProfileId, position },
      { onConflict: 'point_id,user_id' },
    );

  if (error) {
    throw new Error(`Failed to seed agent position: ${error.message}`);
  }
}
