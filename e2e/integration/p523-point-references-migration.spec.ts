/**
 * @file p523-point-references-migration.spec.ts
 * @description Integration tests for P523: Point references & atomic creation — DB migration verification
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * Verifies:
 * 1. `point_references` table exists with correct columns
 * 2. RPC `create_point_with_position` is callable
 * 3. RLS: verified user can create point via RPC
 * 4. RLS: unverified user CANNOT create point via RPC
 * 5. Self-reference prevented (CHECK constraint)
 * 6. Duplicate reference prevented (UNIQUE constraint)
 * 7. Statement length CHECK (> 1000 chars rejected)
 * 8. CASCADE: deleting a point cascades to its references
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped JWT client: RLS / RPC assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';

const TEST_PASSWORD = 'test-password-12345';

/** Helper: sign in and get JWT for a test user */
async function getJwtForUser(email: string): Promise<string> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

/** Helper: create an authenticated Supabase client from a JWT */
function createAuthClient(jwt: string) {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

// P1095 + P1217 (retirement lane): create_point_with_position was never shipped via a
// tracked migration — it existed only on TEST, out-of-band, and referenced points.context
// (dropped by P1095's migration). No client caller ever existed. Skipped rather than
// deleted per P1095's spec; a future retirement pass may remove this file entirely.
test.describe.skip('P523 Migration — point_references table + create_point_with_position RPC', () => {
  test.setTimeout(45000);

  let verifiedUser: TestUser;
  let unverifiedUser: TestUser;
  let verifiedJwt: string;
  let unverifiedJwt: string;
  let targetPoint: Awaited<ReturnType<typeof createTestPoint>>;
  const createdPointIds: string[] = [];

  test.beforeAll(async () => {
    // Create a verified test user
    verifiedUser = await createTestUser({ name: 'P523 Verified' });
    verifiedJwt = await getJwtForUser(verifiedUser.email);

    // Create an unverified test user (create normally, then set is_verified=false)
    unverifiedUser = await createTestUser({ name: 'P523 Unverified' });
    await supabaseAdmin
      .from('profiles')
      .update({ is_verified: false })
      .eq('id', unverifiedUser.user.id);
    unverifiedJwt = await getJwtForUser(unverifiedUser.email);

    // Create a target point for response tests
    targetPoint = await createTestPoint(verifiedUser.user.id, {
      statement: 'P523 target point for integration tests',
    });
  });

  test.afterAll(async () => {
    // Clean up created points
    for (const pointId of createdPointIds) {
      await deleteTestPoint(pointId);
    }
    await deleteTestPoint(targetPoint.id).catch(() => {});
    await deleteTestUser(verifiedUser.user.id);
    await deleteTestUser(unverifiedUser.user.id);
  });

  // ── 1. Schema: point_references table exists ──────────────────────────────

  test('point_references table exists with correct columns', async () => {
    const { data, error } = await supabaseAdmin
      .from('point_references')
      .select('id, source_point_id, target_point_id, created_at')
      .limit(0);

    expect(
      error,
      `point_references table not found — run migration.\nError: ${error?.message}`
    ).toBeNull();
    // data should be an empty array (no rows, but query succeeded = table exists)
    expect(data).toBeDefined();
  });

  // ── 2. RPC: create_point_with_position is callable ────────────────────────

  test('create_point_with_position RPC exists and returns a UUID', async () => {
    const client = createAuthClient(verifiedJwt);

    const { data, error } = await client.rpc('create_point_with_position', {
      p_statement: 'P523 RPC existence test point',
      p_position: 'agree',
      p_context: null,
      p_tags: ['test'],
      p_target_point_id: null,
    });

    expect(error, `RPC not found or failed: ${error?.message}`).toBeNull();
    expect(data).toBeTruthy();
    expect(typeof data).toBe('string');
    // UUID format check
    expect(data).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    createdPointIds.push(data as string);
  });

  // ── 3. RLS: verified user can create point via RPC ────────────────────────

  test('verified user can create point + position + reference atomically', async () => {
    const client = createAuthClient(verifiedJwt);

    const { data: newPointId, error } = await client.rpc('create_point_with_position', {
      p_statement: 'P523 response point — nuclear energy is the bridge',
      p_position: 'disagree',
      p_context: 'Energy policy',
      p_tags: ['energy', 'test'],
      p_target_point_id: targetPoint.id,
    });

    expect(error, `Verified user RPC failed: ${error?.message}`).toBeNull();
    expect(newPointId).toBeTruthy();
    createdPointIds.push(newPointId as string);

    // Verify point was created
    const { data: point } = await supabaseAdmin
      .from('points')
      .select('id, statement, first_validator_id')
      .eq('id', newPointId as string)
      .single();
    expect(point).toBeTruthy();
    expect(point!.statement).toBe('P523 response point — nuclear energy is the bridge');
    expect(point!.first_validator_id).toBe(verifiedUser.user.id);

    // Verify position was created
    const { data: positions } = await supabaseAdmin
      .from('point_positions')
      .select('position, user_id')
      .eq('point_id', newPointId as string)
      .eq('user_id', verifiedUser.user.id);
    expect(positions).toHaveLength(1);
    expect(positions![0].position).toBe('disagree');

    // Verify reference was created
    const { data: refs } = await supabaseAdmin
      .from('point_references')
      .select('source_point_id, target_point_id')
      .eq('source_point_id', newPointId as string);
    expect(refs).toHaveLength(1);
    expect(refs![0].target_point_id).toBe(targetPoint.id);
  });

  // ── 4. RLS: unverified user CANNOT create point via RPC ───────────────────

  test('unverified user is rejected by create_point_with_position RPC', async () => {
    const client = createAuthClient(unverifiedJwt);

    const { data, error } = await client.rpc('create_point_with_position', {
      p_statement: 'Unverified user should not create this',
      p_position: 'agree',
      p_context: null,
      p_tags: [],
      p_target_point_id: null,
    });

    expect(error).toBeTruthy();
    expect(error!.message).toContain('not verified');
    expect(data).toBeNull();
  });

  // ── 5. Self-reference prevented (CHECK constraint) ────────────────────────

  test('self-reference is prevented by CHECK constraint', async () => {
    // Try to insert a reference where source == target (via admin, bypassing RPC)
    const { error } = await supabaseAdmin
      .from('point_references')
      .insert({
        source_point_id: targetPoint.id,
        target_point_id: targetPoint.id,
      });

    expect(error).toBeTruthy();
    expect(
      error!.message,
      'CHECK constraint did not fire for self-reference'
    ).toMatch(/check|constraint|violat/i);
  });

  // ── 6. Duplicate reference prevented (UNIQUE constraint) ──────────────────

  test('duplicate reference (same source→target pair) is prevented', async () => {
    // First, create a valid reference via admin
    const sourcePoint = await createTestPoint(verifiedUser.user.id, {
      statement: 'P523 duplicate test source',
    });
    createdPointIds.push(sourcePoint.id);

    const { error: firstInsert } = await supabaseAdmin
      .from('point_references')
      .insert({
        source_point_id: sourcePoint.id,
        target_point_id: targetPoint.id,
      });
    expect(firstInsert).toBeNull();

    // Second insert with same pair should fail
    const { error: duplicateInsert } = await supabaseAdmin
      .from('point_references')
      .insert({
        source_point_id: sourcePoint.id,
        target_point_id: targetPoint.id,
      });

    expect(duplicateInsert).toBeTruthy();
    expect(
      duplicateInsert!.message,
      'UNIQUE constraint did not fire for duplicate reference'
    ).toMatch(/duplicate|unique|violat/i);
  });

  // ── 7. Statement length CHECK (> 1000 chars rejected) ─────────────────────

  test('statement exceeding 1000 characters is rejected by RPC', async () => {
    const client = createAuthClient(verifiedJwt);
    const longStatement = 'A'.repeat(1001);

    const { data, error } = await client.rpc('create_point_with_position', {
      p_statement: longStatement,
      p_position: 'agree',
      p_context: null,
      p_tags: [],
      p_target_point_id: null,
    });

    expect(error).toBeTruthy();
    expect(error!.message).toMatch(/1000|length|exceed/i);
    expect(data).toBeNull();
  });

  test('statement at exactly 1000 characters is accepted', async () => {
    const client = createAuthClient(verifiedJwt);
    const maxStatement = 'B'.repeat(1000);

    const { data, error } = await client.rpc('create_point_with_position', {
      p_statement: maxStatement,
      p_position: 'unsure',
      p_context: null,
      p_tags: [],
      p_target_point_id: null,
    });

    expect(error, `1000-char statement rejected: ${error?.message}`).toBeNull();
    expect(data).toBeTruthy();
    createdPointIds.push(data as string);
  });

  // ── 8. CASCADE: deleting a point cascades to its references ───────────────

  test('deleting a point cascades to its point_references rows', async () => {
    // Create source and target
    const sourceForCascade = await createTestPoint(verifiedUser.user.id, {
      statement: 'P523 cascade source — will be deleted',
    });
    const targetForCascade = await createTestPoint(verifiedUser.user.id, {
      statement: 'P523 cascade target — should survive',
    });

    // Create reference
    const { error: refError } = await supabaseAdmin
      .from('point_references')
      .insert({
        source_point_id: sourceForCascade.id,
        target_point_id: targetForCascade.id,
      });
    expect(refError).toBeNull();

    // Verify reference exists
    const { data: refsBefore } = await supabaseAdmin
      .from('point_references')
      .select('id')
      .eq('source_point_id', sourceForCascade.id);
    expect(refsBefore).toHaveLength(1);

    // Delete the source point
    await deleteTestPoint(sourceForCascade.id);

    // Verify reference was cascaded
    const { data: refsAfter } = await supabaseAdmin
      .from('point_references')
      .select('id')
      .eq('source_point_id', sourceForCascade.id);
    expect(refsAfter).toHaveLength(0);

    // Verify target point still exists
    const { data: targetStillExists } = await supabaseAdmin
      .from('points')
      .select('id')
      .eq('id', targetForCascade.id)
      .single();
    expect(targetStillExists).toBeTruthy();

    // Clean up target
    await deleteTestPoint(targetForCascade.id);
  });

  // ── 9. RLS: point_references are publicly readable ────────────────────────

  test('point_references SELECT is public (unauthenticated can read)', async () => {
    // Use anon client (no JWT)
    const anonClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await anonClient
      .from('point_references')
      .select('id, source_point_id, target_point_id')
      .limit(1);

    expect(error, `RLS blocked anon SELECT: ${error?.message}`).toBeNull();
    expect(data).toBeDefined();
  });
});
