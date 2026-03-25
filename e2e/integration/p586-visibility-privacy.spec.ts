/**
 * @file p586-visibility-privacy.spec.ts
 * @description Integration tests for P586: Visibility & Privacy Foundation
 *
 * Verifies:
 * 1. Schema: points.visibility column exists, content_visibility enum type works
 * 2. Migration: existing points default to 'public', new points get 'public'
 * 3. Point visibility RLS: private points visible only to owner
 * 4. Cross-visibility constraint: public story cannot link to private point (BEFORE INSERT trigger)
 * 5. story_points SELECT RLS: junction rows scoped by story visibility
 * 6. point_positions SELECT RLS: inherits from point visibility
 * 7. Visibility immutability: BEFORE UPDATE triggers block visibility changes
 * 8. shared enum removal: 'shared' is no longer a valid visibility value
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level ops (bypasses RLS)
 * - ownerClient (JWT): authenticated as content owner
 * - otherClient (JWT): authenticated as a different user
 *
 * If "points.visibility column missing" → P586 migration not applied.
 * If "private point visible to other user" → point SELECT RLS not updated.
 * If "public story linked to private point" → cross-visibility trigger missing.
 * If "visibility UPDATE succeeded" → immutability trigger missing.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';
import { deleteTestPoint } from '../helpers/test-point';
import { createTestStory, deleteTestStory, linkStoryToPoint } from '../helpers/test-story';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

/** Build an authenticated Supabase client from a JWT access token. */
function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Sign in a user and return an authenticated client. Uses a temp client to avoid corrupting supabaseAdmin. */
async function signInAsUser(email: string): Promise<ReturnType<typeof makeUserClient>> {
  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`Failed to sign in ${email}: ${error?.message}`);
  }
  return makeUserClient(data.session.access_token);
}

/** Create an anonymous (unauthenticated) Supabase client. */
function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// 1. Schema checks
// ---------------------------------------------------------------------------

test.describe('P586: Schema — points.visibility column and content_visibility enum', () => {
  test('points.visibility column exists (P586 migration applied)', async () => {
    const { error } = await supabaseAdmin.from('points').select('visibility').limit(1);
    expect(
      error,
      `points.visibility missing — apply P586 migration.\nError: ${error?.message}`
    ).toBeNull();
  });

  test('content_visibility enum accepts "public" value', async () => {
    // Verify the enum works by inserting a point with visibility = 'public'
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P586 EnumPublic' });
    try {
      const { data, error } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P586 enum test — public',
          first_validator_id: owner.user.id,
          visibility: 'public',
          tags: ['test'],
        })
        .select('id, visibility')
        .single();

      expect(error, `INSERT with visibility='public' failed: ${error?.message}`).toBeNull();
      expect(data?.visibility).toBe('public');

      if (data?.id) await deleteTestPoint(data.id);
    } finally {
      await deleteTestUser(owner.user.id);
    }
  });

  test('content_visibility enum accepts "private" value', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P586 EnumPrivate' });
    try {
      const { data, error } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P586 enum test — private',
          first_validator_id: owner.user.id,
          visibility: 'private',
          tags: ['test'],
        })
        .select('id, visibility')
        .single();

      expect(error, `INSERT with visibility='private' failed: ${error?.message}`).toBeNull();
      expect(data?.visibility).toBe('private');

      if (data?.id) await deleteTestPoint(data.id);
    } finally {
      await deleteTestUser(owner.user.id);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Migration check — existing points default to 'public'
// ---------------------------------------------------------------------------

test.describe('P586: Migration — default visibility is public', () => {
  test('existing points have visibility = public after migration', async () => {
    // Query any existing point — migration should have set all to 'public'
    const { data, error } = await supabaseAdmin
      .from('points')
      .select('id, visibility')
      .limit(5);

    expect(error, `Failed to query points: ${error?.message}`).toBeNull();

    if (data && data.length > 0) {
      for (const point of data) {
        expect(
          point.visibility,
          `Point ${point.id} should have visibility='public' after migration, got '${point.visibility}'`
        ).toBe('public');
      }
    }
    // If no points exist, the test passes vacuously — the column default is tested next.
  });

  test('new point gets visibility = public by default (no explicit value)', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P586 DefaultVis' });
    try {
      // Insert without specifying visibility — should default to 'public'
      const { data, error } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P586 default visibility test',
          first_validator_id: owner.user.id,
          tags: ['test'],
        })
        .select('id, visibility')
        .single();

      expect(error, `INSERT without visibility failed: ${error?.message}`).toBeNull();
      expect(
        data?.visibility,
        `New point should default to visibility='public', got '${data?.visibility}'`
      ).toBe('public');

      if (data?.id) await deleteTestPoint(data.id);
    } finally {
      await deleteTestUser(owner.user.id);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Point visibility RLS (TWO users: owner + other)
// ---------------------------------------------------------------------------

test.describe('P586: Point visibility RLS — private points hidden from non-owners', () => {
  let ownerEmail: string;
  let ownerId: string;
  let otherEmail: string;
  let otherId: string;
  let privatePointId: string;
  let publicPointId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P586 PointOwner' });
    ownerId = owner.user.id;

    otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P586 PointOther' });
    otherId = other.user.id;

    // Create a private point via admin (bypasses RLS)
    const { data: privPoint, error: privErr } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P586 private point — should be hidden from others',
        first_validator_id: ownerId,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();
    if (privErr || !privPoint) throw new Error(`Failed to create private point: ${privErr?.message}`);
    privatePointId = privPoint.id;

    // Create a public point via admin
    const { data: pubPoint, error: pubErr } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P586 public point — visible to everyone',
        first_validator_id: ownerId,
        visibility: 'public',
        tags: ['test'],
      })
      .select('id')
      .single();
    if (pubErr || !pubPoint) throw new Error(`Failed to create public point: ${pubErr?.message}`);
    publicPointId = pubPoint.id;
  });

  test.afterAll(async () => {
    await deleteTestPoint(privatePointId);
    await deleteTestPoint(publicPointId);
    await deleteTestUser(ownerId);
    await deleteTestUser(otherId);
  });

  test('owner can SELECT their own private point', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const { data, error } = await ownerClient
      .from('points')
      .select('id, statement, visibility')
      .eq('id', privatePointId)
      .single();

    expect(error, `Owner should be able to read own private point: ${error?.message}`).toBeNull();
    expect(data?.id, 'Owner should see their private point').toBe(privatePointId);
    expect(data?.visibility).toBe('private');
  });

  test('other user CANNOT SELECT a private point', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('points')
      .select('id, statement')
      .eq('id', privatePointId)
      .single();

    // RLS should filter out the private point — either no rows (PGRST116) or permission denied
    expect(data, 'Other user should NOT see a private point').toBeNull();
    expect(
      error,
      'Query for private point by non-owner should return an error (no rows or permission denied)'
    ).not.toBeNull();
  });

  test('any authenticated user can SELECT a public point', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('points')
      .select('id, statement, visibility')
      .eq('id', publicPointId)
      .single();

    expect(error, `Any user should read public point: ${error?.message}`).toBeNull();
    expect(data?.id, 'Public point should be visible to any authenticated user').toBe(publicPointId);
  });

  test('anonymous user can SELECT public points but NOT private', async () => {
    const anonClient = makeAnonClient();

    // Public point should be visible
    const { data: pubData, error: pubError } = await anonClient
      .from('points')
      .select('id')
      .eq('id', publicPointId)
      .single();
    expect(pubError, `Anon should read public point: ${pubError?.message}`).toBeNull();
    expect(pubData?.id, 'Anon should see public point').toBe(publicPointId);

    // Private point should be hidden
    const { data: privData, error: privError } = await anonClient
      .from('points')
      .select('id')
      .eq('id', privatePointId)
      .single();
    expect(privData, 'Anon should NOT see private point').toBeNull();
    expect(
      privError,
      'Query for private point by anon should return an error (no rows or permission denied)'
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Cross-visibility constraint (BEFORE INSERT trigger on story_points)
// ---------------------------------------------------------------------------

test.describe('P586: Cross-visibility constraint — public story cannot link to private point', () => {
  let ownerEmail: string;
  let ownerId: string;
  let publicStoryId: string;
  let privateStoryId: string;
  let publicPointId: string;
  let privatePointId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P586 CrossVis' });
    ownerId = owner.user.id;

    // Create stories and points via admin
    const publicStory = await createTestStory(ownerId, {
      title: 'P586 public story for cross-vis',
      visibility: 'public',
    });
    publicStoryId = publicStory.id;

    const privateStory = await createTestStory(ownerId, {
      title: 'P586 private story for cross-vis',
      visibility: 'private',
    });
    privateStoryId = privateStory.id;

    const { data: pubPt, error: pubPtErr } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P586 cross-vis public point',
        first_validator_id: ownerId,
        visibility: 'public',
        tags: ['test'],
      })
      .select('id')
      .single();
    if (pubPtErr || !pubPt) throw new Error(`Failed to create public point: ${pubPtErr?.message}`);
    publicPointId = pubPt.id;

    const { data: privPt, error: privPtErr } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P586 cross-vis private point',
        first_validator_id: ownerId,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();
    if (privPtErr || !privPt) throw new Error(`Failed to create private point: ${privPtErr?.message}`);
    privatePointId = privPt.id;
  });

  test.afterAll(async () => {
    // Clean up junction rows first, then stories and points
    await supabaseAdmin.from('story_points').delete().in('story_id', [publicStoryId, privateStoryId]);
    await deleteTestStory(publicStoryId);
    await deleteTestStory(privateStoryId);
    await deleteTestPoint(publicPointId);
    await deleteTestPoint(privatePointId);
    await deleteTestUser(ownerId);
  });

  test('public story CAN link to public point', async () => {
    const { error } = await supabaseAdmin
      .from('story_points')
      .insert({
        story_id: publicStoryId,
        point_id: publicPointId,
        author_id: ownerId,
      });

    expect(
      error,
      `Public story should be able to link to public point: ${error?.message}`
    ).toBeNull();

    // Clean up for next test
    await supabaseAdmin.from('story_points').delete()
      .eq('story_id', publicStoryId).eq('point_id', publicPointId);
  });

  test('private story CAN link to public point', async () => {
    const { error } = await supabaseAdmin
      .from('story_points')
      .insert({
        story_id: privateStoryId,
        point_id: publicPointId,
        author_id: ownerId,
      });

    expect(
      error,
      `Private story should be able to link to public point: ${error?.message}`
    ).toBeNull();

    await supabaseAdmin.from('story_points').delete()
      .eq('story_id', privateStoryId).eq('point_id', publicPointId);
  });

  test('private story CAN link to private point (same owner)', async () => {
    const { error } = await supabaseAdmin
      .from('story_points')
      .insert({
        story_id: privateStoryId,
        point_id: privatePointId,
        author_id: ownerId,
      });

    expect(
      error,
      `Private story should be able to link to private point (same owner): ${error?.message}`
    ).toBeNull();

    await supabaseAdmin.from('story_points').delete()
      .eq('story_id', privateStoryId).eq('point_id', privatePointId);
  });

  test('public story CANNOT link to private point (trigger rejects)', async () => {
    const { error } = await supabaseAdmin
      .from('story_points')
      .insert({
        story_id: publicStoryId,
        point_id: privatePointId,
        author_id: ownerId,
      });

    expect(
      error,
      'Public story should NOT be able to link to private point — cross-visibility trigger missing'
    ).not.toBeNull();
    // The trigger should raise an exception with a descriptive message
    expect(
      error?.message,
      'Error message should mention that a public story cannot link to a private point'
    ).toMatch(/private|visibility|cannot/i);
  });
});

// ---------------------------------------------------------------------------
// 5. story_points SELECT RLS — scoped by story visibility
// ---------------------------------------------------------------------------

test.describe('P586: story_points SELECT RLS — junction rows scoped by story visibility', () => {
  let ownerEmail: string;
  let ownerId: string;
  let otherEmail: string;
  let otherId: string;
  let privateStoryId: string;
  let publicStoryId: string;
  let publicPointId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P586 JunctionOwner' });
    ownerId = owner.user.id;

    otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P586 JunctionOther' });
    otherId = other.user.id;

    // Create a public point (both stories can link to it)
    const { data: pt, error: ptErr } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P586 junction test point',
        first_validator_id: ownerId,
        visibility: 'public',
        tags: ['test'],
      })
      .select('id')
      .single();
    if (ptErr || !pt) throw new Error(`Failed to create point: ${ptErr?.message}`);
    publicPointId = pt.id;

    // Create private and public stories, link both to the public point
    const privStory = await createTestStory(ownerId, {
      title: 'P586 private story for junction',
      visibility: 'private',
    });
    privateStoryId = privStory.id;

    const pubStory = await createTestStory(ownerId, {
      title: 'P586 public story for junction',
      visibility: 'public',
    });
    publicStoryId = pubStory.id;

    // Link both stories to the point via admin
    await linkStoryToPoint(privateStoryId, publicPointId);
    await linkStoryToPoint(publicStoryId, publicPointId);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('story_points').delete().in('story_id', [privateStoryId, publicStoryId]);
    await deleteTestStory(privateStoryId);
    await deleteTestStory(publicStoryId);
    await deleteTestPoint(publicPointId);
    await deleteTestUser(ownerId);
    await deleteTestUser(otherId);
  });

  test('other user CANNOT see story_points rows for a private story', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('story_points')
      .select('story_id, point_id')
      .eq('story_id', privateStoryId);

    expect(error, `story_points query should not error: ${error?.message}`).toBeNull();
    expect(
      data?.length ?? 0,
      `Other user should see 0 story_points rows for a private story, got ${data?.length}`
    ).toBe(0);
  });

  test('owner CAN see story_points rows for their private story', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const { data, error } = await ownerClient
      .from('story_points')
      .select('story_id, point_id')
      .eq('story_id', privateStoryId);

    expect(error, `Owner story_points query should not error: ${error?.message}`).toBeNull();
    expect(
      data?.length,
      'Owner should see story_points rows for their private story'
    ).toBeGreaterThan(0);
  });

  test('any user CAN see story_points rows for a public story', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('story_points')
      .select('story_id, point_id')
      .eq('story_id', publicStoryId);

    expect(error, `Public story_points query should not error: ${error?.message}`).toBeNull();
    expect(
      data?.length,
      'Any user should see story_points rows for a public story'
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. point_positions SELECT RLS — inherits from point visibility
// ---------------------------------------------------------------------------

test.describe('P586: point_positions SELECT RLS — inherits from point visibility', () => {
  let ownerEmail: string;
  let ownerId: string;
  let otherEmail: string;
  let otherId: string;
  let privatePointId: string;
  let publicPointId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P586 PosOwner' });
    ownerId = owner.user.id;

    otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P586 PosOther' });
    otherId = other.user.id;

    // Create private and public points
    const { data: privPt, error: privPtErr } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P586 private point for positions',
        first_validator_id: ownerId,
        visibility: 'private',
        tags: ['test'],
      })
      .select('id')
      .single();
    if (privPtErr || !privPt) throw new Error(`Failed to create private point: ${privPtErr?.message}`);
    privatePointId = privPt.id;

    const { data: pubPt, error: pubPtErr } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P586 public point for positions',
        first_validator_id: ownerId,
        visibility: 'public',
        tags: ['test'],
      })
      .select('id')
      .single();
    if (pubPtErr || !pubPt) throw new Error(`Failed to create public point: ${pubPtErr?.message}`);
    publicPointId = pubPt.id;

    // Create positions via admin (bypass RLS for setup)
    // Owner takes position on private point
    await supabaseAdmin.from('point_positions').upsert({
      point_id: privatePointId,
      user_id: ownerId,
      position: 'agree',
    }, { onConflict: 'point_id,user_id' });

    // Other user takes position on private point
    await supabaseAdmin.from('point_positions').upsert({
      point_id: privatePointId,
      user_id: otherId,
      position: 'disagree',
    }, { onConflict: 'point_id,user_id' });

    // Other user takes position on public point
    await supabaseAdmin.from('point_positions').upsert({
      point_id: publicPointId,
      user_id: otherId,
      position: 'agree',
    }, { onConflict: 'point_id,user_id' });
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('point_positions').delete().in('point_id', [privatePointId, publicPointId]);
    await deleteTestPoint(privatePointId);
    await deleteTestPoint(publicPointId);
    await deleteTestUser(ownerId);
    await deleteTestUser(otherId);
  });

  test('other user CANNOT see positions on a private point (except their own)', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('point_positions')
      .select('point_id, user_id, position')
      .eq('point_id', privatePointId);

    expect(error, `Position query should not error: ${error?.message}`).toBeNull();

    // Other user should see only their OWN position on the private point (Decision 6 allows this)
    // They should NOT see the owner's position
    const ownerPositions = (data ?? []).filter(p => p.user_id === ownerId);
    expect(
      ownerPositions.length,
      `Other user should NOT see owner's position on a private point, saw ${ownerPositions.length}`
    ).toBe(0);
  });

  test('position-taker CAN see their OWN position on a private point', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('point_positions')
      .select('point_id, user_id, position')
      .eq('point_id', privatePointId)
      .eq('user_id', otherId);

    expect(error, `Own position query should not error: ${error?.message}`).toBeNull();
    expect(
      data?.length,
      'Position-taker should see their own position on a private point'
    ).toBe(1);
    expect(data?.[0]?.position).toBe('disagree');
  });

  test('any user CAN see positions on a public point', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const { data, error } = await ownerClient
      .from('point_positions')
      .select('point_id, user_id, position')
      .eq('point_id', publicPointId);

    expect(error, `Public point position query should not error: ${error?.message}`).toBeNull();
    expect(
      data?.length,
      'Any user should see positions on a public point'
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Visibility immutability (BEFORE UPDATE triggers)
// ---------------------------------------------------------------------------

test.describe('P586: Visibility immutability — BEFORE UPDATE triggers block changes', () => {
  let ownerEmail: string;
  let ownerId: string;
  let storyId: string;
  let pointId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P586 Immutable' });
    ownerId = owner.user.id;

    const story = await createTestStory(ownerId, {
      title: 'P586 immutability test story',
      content: 'Original content',
      visibility: 'public',
    });
    storyId = story.id;

    const { data: pt, error: ptErr } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P586 immutability test point',
        first_validator_id: ownerId,
        visibility: 'public',
        tags: ['test'],
      })
      .select('id')
      .single();
    if (ptErr || !pt) throw new Error(`Failed to create point: ${ptErr?.message}`);
    pointId = pt.id;
  });

  test.afterAll(async () => {
    await deleteTestStory(storyId);
    await deleteTestPoint(pointId);
    await deleteTestUser(ownerId);
  });

  test('updating story visibility raises exception', async () => {
    // Use admin to attempt the update (bypasses RLS, but trigger still fires)
    const { error } = await supabaseAdmin
      .from('stories')
      .update({ visibility: 'private' })
      .eq('id', storyId);

    expect(
      error,
      'Updating story visibility should be blocked by BEFORE UPDATE trigger'
    ).not.toBeNull();
    expect(
      error?.message,
      'Error message should mention visibility immutability'
    ).toMatch(/visibility|immutable|cannot.*change/i);
  });

  test('updating point visibility raises exception', async () => {
    // Use admin to attempt the update (bypasses RLS, but trigger still fires)
    const { error } = await supabaseAdmin
      .from('points')
      .update({ visibility: 'private' })
      .eq('id', pointId);

    expect(
      error,
      'Updating point visibility should be blocked by BEFORE UPDATE trigger'
    ).not.toBeNull();
    expect(
      error?.message,
      'Error message should mention visibility immutability'
    ).toMatch(/visibility|immutable|cannot.*change/i);
  });

  test('updating story content (without visibility) succeeds', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const { error } = await ownerClient
      .from('stories')
      .update({ content: 'Updated content — visibility unchanged' })
      .eq('id', storyId);

    expect(
      error,
      `Content-only story update should succeed: ${error?.message}`
    ).toBeNull();

    // Verify the update took effect
    const { data } = await supabaseAdmin
      .from('stories')
      .select('content, visibility')
      .eq('id', storyId)
      .single();
    expect(data?.content).toContain('Updated content');
    expect(data?.visibility, 'Visibility should remain unchanged').toBe('public');
  });
});

// ---------------------------------------------------------------------------
// 8. shared enum removal — 'shared' is no longer valid
// ---------------------------------------------------------------------------

test.describe('P586: shared enum removal — INSERT with shared fails', () => {
  let ownerId: string;

  test.beforeAll(async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P586 SharedRemoval' });
    ownerId = owner.user.id;
  });

  test.afterAll(async () => {
    await deleteTestUser(ownerId);
  });

  test('INSERT story with visibility="shared" fails (enum value removed)', async () => {
    const { data, error } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: ownerId,
        content: 'P586 — shared should be rejected',
        visibility: 'shared' as string, // Cast to bypass TS type checking
        tags: ['test'],
      })
      .select('id')
      .single();

    // Clean up if it somehow succeeded
    if (data?.id) {
      await supabaseAdmin.from('stories').delete().eq('id', data.id);
    }

    expect(
      error,
      'INSERT with visibility="shared" should fail — enum value should have been removed by P586 migration'
    ).not.toBeNull();
  });

  test('INSERT point with visibility="shared" fails (enum value never existed for points)', async () => {
    const { data, error } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P586 — shared point should be rejected',
        first_validator_id: ownerId,
        visibility: 'shared' as string, // Cast to bypass TS type checking
        tags: ['test'],
      })
      .select('id')
      .single();

    // Clean up if it somehow succeeded
    if (data?.id) {
      await deleteTestPoint(data.id);
    }

    expect(
      error,
      'INSERT point with visibility="shared" should fail — content_visibility enum has only public/private'
    ).not.toBeNull();
  });
});
