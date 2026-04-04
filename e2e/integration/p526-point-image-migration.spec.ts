/**
 * @file p526-point-image-migration.spec.ts
 * @description Integration tests for P526: Point Supporting Images — DB migration verification
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * Verifies:
 * 1. `image_url` column exists on `points` table
 * 2. `image_url` defaults to NULL for new points
 * 3. RPC function: `update_point_image()` works for author
 * 4. RPC function: `update_point_image()` fails for non-author
 * 5. RPC function: verify `statement` is NOT changed when image is updated
 * 6. Direct UPDATE on `points` is still blocked (no UPDATE RLS policy)
 * 7. Service role can update image_url directly (admin path)
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped JWT client: RLS / RPC assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestPoint, deleteTestPoint, type TestPoint } from '../helpers/test-point';

test.describe('P526 Migration — image_url column + update_point_image RPC', () => {
  test.setTimeout(45000);

  let author: TestUser;
  let nonAuthor: TestUser;
  let point: TestPoint;
  let tokenAuthor: string;
  let tokenNonAuthor: string;

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P526 Image Author' });
    nonAuthor = await createTestUser({ name: 'P526 Image NonAuthor' });

    point = await createTestPoint(author.user.id, {
      statement: 'P526 Migration Test Point — images strengthen claims',
    });

    // Get JWTs for RLS / RPC testing
    const clientA = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInA, error: errA } = await clientA.auth.signInWithPassword({
      email: author.email,
      password: 'test-password-12345',
    });
    if (errA || !signInA?.session) throw new Error(`P526: Failed to sign in author: ${errA?.message}`);
    tokenAuthor = signInA.session.access_token;

    const clientB = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInB, error: errB } = await clientB.auth.signInWithPassword({
      email: nonAuthor.email,
      password: 'test-password-12345',
    });
    if (errB || !signInB?.session) throw new Error(`P526: Failed to sign in nonAuthor: ${errB?.message}`);
    tokenNonAuthor = signInB.session.access_token;
  });

  test.afterAll(async () => {
    if (point?.id) await deleteTestPoint(point.id);
    if (author?.user?.id) await deleteTestUser(author.user.id);
    if (nonAuthor?.user?.id) await deleteTestUser(nonAuthor.user.id);
  });

  // ── 1. Schema check: column exists ──────────────────────────────────────

  test('image_url column exists on points table', async () => {
    const { error } = await supabaseAdmin
      .from('points')
      .select('image_url')
      .limit(1);

    expect(
      error,
      'Migration not applied: "image_url" missing from "points". Run: ./scripts/migrate.sh'
    ).toBeNull();
  });

  // ── 2. Default value ────────────────────────────────────────────────────

  test('image_url defaults to NULL for new points', async () => {
    const { data, error } = await supabaseAdmin
      .from('points')
      .select('id, image_url')
      .eq('id', point.id)
      .single();

    expect(error).toBeNull();
    expect(data?.image_url).toBeNull();
  });

  // ── 3. RPC: author can update image_url ─────────────────────────────────

  test('author can update image_url via update_point_image RPC', async () => {
    const authorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenAuthor}` } },
    });

    const testUrl = 'https://storage.googleapis.com/claritypledge-uploads/points/test/evidence.jpg';

    const { error } = await authorClient.rpc('update_point_image', {
      p_point_id: point.id,
      p_image_url: testUrl,
    });

    expect(error, `RPC update_point_image failed for author: ${error?.message}`).toBeNull();

    // Verify the update was applied
    const { data } = await supabaseAdmin
      .from('points')
      .select('image_url')
      .eq('id', point.id)
      .single();
    expect(data?.image_url).toBe(testUrl);

    // Cleanup: reset to null
    await supabaseAdmin.from('points').update({ image_url: null }).eq('id', point.id);
  });

  // ── 4. RPC: non-author is rejected ──────────────────────────────────────

  test('non-author cannot update image_url via update_point_image RPC', async () => {
    const nonAuthorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenNonAuthor}` } },
    });

    const { error } = await nonAuthorClient.rpc('update_point_image', {
      p_point_id: point.id,
      p_image_url: 'https://evil.example.com/injected.jpg',
    });

    // RPC should raise an exception for non-author
    expect(error, 'RPC should reject non-author').not.toBeNull();
    expect(error!.message).toContain('Not authorized');

    // Verify image_url was NOT changed
    const { data } = await supabaseAdmin
      .from('points')
      .select('image_url')
      .eq('id', point.id)
      .single();
    expect(data?.image_url).toBeNull();
  });

  // ── 5. RPC: statement is NOT mutated when image is updated ──────────────

  test('update_point_image does not change statement', async () => {
    const authorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenAuthor}` } },
    });

    // Record original statement
    const { data: before } = await supabaseAdmin
      .from('points')
      .select('statement, context, tags')
      .eq('id', point.id)
      .single();

    const testUrl = 'https://storage.googleapis.com/claritypledge-uploads/points/test/immutability-check.jpg';

    await authorClient.rpc('update_point_image', {
      p_point_id: point.id,
      p_image_url: testUrl,
    });

    // Verify immutable fields are unchanged
    const { data: after } = await supabaseAdmin
      .from('points')
      .select('statement, context, tags, image_url')
      .eq('id', point.id)
      .single();

    expect(after?.statement).toBe(before?.statement);
    expect(after?.context).toBe(before?.context);
    expect(after?.tags).toEqual(before?.tags);
    expect(after?.image_url).toBe(testUrl);

    // Cleanup
    await supabaseAdmin.from('points').update({ image_url: null }).eq('id', point.id);
  });

  // ── 6. RPC: author can set image_url to NULL (remove image) ─────────────

  test('author can remove image by setting image_url to NULL via RPC', async () => {
    // First set an image
    await supabaseAdmin
      .from('points')
      .update({ image_url: 'https://storage.googleapis.com/claritypledge-uploads/points/test/to-remove.jpg' })
      .eq('id', point.id);

    const authorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenAuthor}` } },
    });

    const { error } = await authorClient.rpc('update_point_image', {
      p_point_id: point.id,
      p_image_url: null,
    });

    expect(error, `RPC update_point_image failed when removing image: ${error?.message}`).toBeNull();

    // Verify image was removed
    const { data } = await supabaseAdmin
      .from('points')
      .select('image_url')
      .eq('id', point.id)
      .single();
    expect(data?.image_url).toBeNull();
  });

  // ── 7. Direct UPDATE on points is still blocked ─────────────────────────

  test('direct UPDATE on points.image_url is blocked by RLS (no UPDATE policy)', async () => {
    const authorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenAuthor}` } },
    });

    const { error, data } = await authorClient
      .from('points')
      .update({ image_url: 'https://example.com/direct-update-attempt.jpg' })
      .eq('id', point.id)
      .select('image_url');

    // Points have NO UPDATE policy — update should return 0 rows (RLS filter)
    // or an explicit RLS error
    if (error) {
      expect(error.code).toBeTruthy();
    } else {
      expect(data?.length ?? 0, 'Points should have no UPDATE policy — direct update must be blocked').toBe(0);
    }

    // Verify image_url was NOT changed
    const { data: check } = await supabaseAdmin
      .from('points')
      .select('image_url')
      .eq('id', point.id)
      .single();
    expect(check?.image_url).toBeNull();
  });

  // ── 8. Service role can update image_url directly ───────────────────────

  test('service_role can update image_url on points directly', async () => {
    const testUrl = 'https://storage.googleapis.com/claritypledge-uploads/points/service-role-test.jpg';

    const { error } = await supabaseAdmin
      .from('points')
      .update({ image_url: testUrl })
      .eq('id', point.id);

    expect(error, `service_role should be able to update image_url: ${error?.message}`).toBeNull();

    const { data } = await supabaseAdmin
      .from('points')
      .select('image_url')
      .eq('id', point.id)
      .single();
    expect(data?.image_url).toBe(testUrl);

    // Cleanup
    await supabaseAdmin.from('points').update({ image_url: null }).eq('id', point.id);
  });

  // ── 9. RPC for non-existent point ───────────────────────────────────────

  test('update_point_image fails for non-existent point', async () => {
    const authorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenAuthor}` } },
    });

    const { error } = await authorClient.rpc('update_point_image', {
      p_point_id: '00000000-0000-0000-0000-000000000000',
      p_image_url: 'https://example.com/nonexistent.jpg',
    });

    expect(error, 'RPC should reject non-existent point').not.toBeNull();
    expect(error!.message).toContain('Not authorized');
  });
});
