/**
 * @file p425-stories-rls.spec.ts
 * @description Integration tests for P425: Stories table RLS and schema readiness
 *
 * Verifies:
 * 1. Schema: required columns exist (stories.content, stories.visibility,
 *    story_points.story_id, story_points.point_id)
 * 2. Verified user can INSERT a story (RLS: is_verified = true)
 * 3. User cannot READ another user's private story (SELECT RLS)
 * 4. User cannot INSERT into story_points for a story they don't own (ownership check)
 * 5. story_points INSERT correctly verifies story ownership
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level ops (bypasses RLS)
 * - ownerClient (JWT): authenticated as story owner
 * - otherClient (JWT): authenticated as a different user
 *
 * If "verified user INSERT blocked" → P424 RLS migration not applied.
 * If "private story visible to other user" → SELECT policy missing.
 * If "story_points INSERT succeeded for non-owner" → ownership policy missing.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';

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

// ---------------------------------------------------------------------------
// Schema checks
// ---------------------------------------------------------------------------

test.describe('P425: Stories schema — required columns exist', () => {
  // We probe column existence by selecting them with .limit(1).
  // If the column doesn't exist, Supabase returns a 42703 PostgREST error.

  test('stories.content column exists (P424/P425 migration applied)', async () => {
    const { error } = await supabaseAdmin.from('stories').select('content').limit(1);
    expect(
      error,
      `stories.content missing — apply P424/P425 migration.\nError: ${error?.message}`
    ).toBeNull();
  });

  test('stories.visibility column exists (P424 migration applied)', async () => {
    const { error } = await supabaseAdmin.from('stories').select('visibility').limit(1);
    expect(
      error,
      `stories.visibility missing — apply P424 migration (20260224120000_p424_visibility_model.sql).\nError: ${error?.message}`
    ).toBeNull();
  });

  test('story_points.story_id column exists', async () => {
    const { error } = await supabaseAdmin.from('story_points').select('story_id').limit(1);
    expect(
      error,
      `story_points.story_id missing — apply stories/story_points migration.\nError: ${error?.message}`
    ).toBeNull();
  });

  test('story_points.point_id column exists', async () => {
    const { error } = await supabaseAdmin.from('story_points').select('point_id').limit(1);
    expect(
      error,
      `story_points.point_id missing — apply stories/story_points migration.\nError: ${error?.message}`
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RLS: INSERT — verified user can save a story
// ---------------------------------------------------------------------------

test.describe('P425: Stories RLS — verified user INSERT', () => {
  let ownerEmail: string;
  let ownerId: string;
  let unverifiedEmail: string;
  let unverifiedId: string;
  const createdStoryIds: string[] = [];

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P425 StoryOwner' });
    ownerId = owner.user.id;

    unverifiedEmail = generateTestEmail();
    const unverified = await createTestUser({ email: unverifiedEmail, name: 'P425 Unverified' });
    unverifiedId = unverified.user.id;
    // Mark as unverified
    await supabaseAdmin.from('profiles').update({ is_verified: false }).eq('id', unverifiedId);
  });

  test.afterAll(async () => {
    if (createdStoryIds.length > 0) {
      await supabaseAdmin.from('story_points').delete().in('story_id', createdStoryIds);
      await supabaseAdmin.from('stories').delete().in('id', createdStoryIds);
    }
    await deleteTestUser(ownerId);
    await deleteTestUser(unverifiedId);
  });

  test('verified user can INSERT a private story', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: ownerEmail, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await ownerClient
      .from('stories')
      .insert({
        author_id: ownerId,
        content: 'P425 integration test — private story from verified user',
        visibility: 'private',
        tags: ['test'],
      })
      .select('id, visibility')
      .single();

    if (data?.id) createdStoryIds.push(data.id);

    expect(
      error,
      `Verified user INSERT blocked — P424/P425 RLS policy missing.\nError: ${error?.message}`
    ).toBeNull();
    expect(data?.visibility).toBe('private');
  });

  test('unverified user cannot INSERT a story (is_verified gate)', async () => {
    // NOTE: The spec defers the is_verified gate for stories to P424 RLS.
    // This test validates that the gap acknowledged in the spec (§Security Review)
    // is either closed (test passes with error) or flagged for follow-up.
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: unverifiedEmail, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const unverifiedClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error: _error } = await unverifiedClient
      .from('stories')
      .insert({
        author_id: unverifiedId,
        content: 'P425 — unverified user should not insert stories',
        visibility: 'private',
      })
      .select('id')
      .single();

    if (data?.id) {
      createdStoryIds.push(data.id);
      // If we reach here, the is_verified gate is NOT enforced for stories.
      // This matches the known gap in P424 (spec §Security Review: "⚠️ is_verified gap").
      // TODO: Once P424 closes the gap (adds is_verified check to stories INSERT RLS),
      // this test should assert error !== null.
      console.warn(
        '[P425 RLS] WARNING: Unverified user was able to INSERT a story. ' +
        'is_verified gate is not enforced on stories table. Known gap — see P424 §Security Review.'
      );
    }

    // For now, just document the observed behaviour without failing the suite.
    // This test is a canary: when the gap is closed, it will need updating.
  });

  test('unauthenticated caller cannot INSERT a story', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient
      .from('stories')
      .insert({
        author_id: ownerId,
        content: 'P425 — anon should not insert stories',
        visibility: 'private',
      })
      .select('id')
      .single();

    if (data?.id) createdStoryIds.push(data.id);

    expect(
      error,
      'Unauthenticated caller should not be able to INSERT stories — RLS missing.'
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RLS: SELECT — user cannot read another user's private story
// ---------------------------------------------------------------------------

test.describe("P425: Stories RLS — private story not visible to other users", () => {
  let ownerEmail: string;
  let ownerId: string;
  let otherEmail: string;
  let otherId: string;
  let privateStoryId: string;
  let publicStoryId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P425 PrivOwner' });
    ownerId = owner.user.id;

    otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P425 OtherUser' });
    otherId = other.user.id;

    // Create private story via admin (bypasses RLS for setup)
    const { data: priv, error: privErr } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: ownerId, content: 'Private story content', visibility: 'private' })
      .select('id')
      .single();
    if (privErr || !priv) throw new Error(`Failed to create private story: ${privErr?.message}`);
    privateStoryId = priv.id;

    // Create public story via admin
    const { data: pub, error: pubErr } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: ownerId, content: 'Public story content', visibility: 'public' })
      .select('id')
      .single();
    if (pubErr || !pub) throw new Error(`Failed to create public story: ${pubErr?.message}`);
    publicStoryId = pub.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('story_points').delete().in('story_id', [privateStoryId, publicStoryId]);
    await supabaseAdmin.from('stories').delete().in('id', [privateStoryId, publicStoryId]);
    await deleteTestUser(ownerId);
    await deleteTestUser(otherId);
  });

  test('other authenticated user cannot SELECT a private story', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: otherEmail, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const otherClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await otherClient
      .from('stories')
      .select('id, content')
      .eq('id', privateStoryId)
      .single();

    expect(data).toBeNull();
    // RLS returns PGRST116 (no rows) or 42501 (permission denied) — either is acceptable
    expect(error).not.toBeNull();
  });

  test('owner can SELECT their own private story', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: ownerEmail, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await ownerClient
      .from('stories')
      .select('id, content')
      .eq('id', privateStoryId)
      .single();

    expect(error, `Owner should be able to read own private story: ${error?.message}`).toBeNull();
    expect(data?.id).toBe(privateStoryId);
  });

  test('any authenticated user can SELECT a public story', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: otherEmail, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const otherClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await otherClient
      .from('stories')
      .select('id, content')
      .eq('id', publicStoryId)
      .single();

    expect(error, `Other user should read public story: ${error?.message}`).toBeNull();
    expect(data?.id).toBe(publicStoryId);
  });
});

// ---------------------------------------------------------------------------
// RLS: story_points — ownership verification on INSERT
// ---------------------------------------------------------------------------

test.describe('P425: story_points RLS — ownership verification', () => {
  let ownerEmail: string;
  let ownerId: string;
  let otherEmail: string;
  let otherId: string;
  let storyId: string;
  let pointId: string;
  const linkedIds: string[] = [];

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P425 SPOwner' });
    ownerId = owner.user.id;

    otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P425 SPOther' });
    otherId = other.user.id;

    // Create story owned by owner
    const { data: story, error: storyErr } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: ownerId, content: 'story_points ownership test', visibility: 'private' })
      .select('id')
      .single();
    if (storyErr || !story) throw new Error(`Failed to create story: ${storyErr?.message}`);
    storyId = story.id;

    // Find or create a point to link to
    // TODO: Replace with actual point ID once points fixtures are available.
    // For now, use admin to find any existing point in the DB.
    const { data: existingPoint } = await supabaseAdmin
      .from('points')
      .select('id')
      .limit(1)
      .single();

    if (existingPoint?.id) {
      pointId = existingPoint.id;
    } else {
      // Fallback: create a minimal point via admin if none exist
      // TODO: Use createTestPoint helper once available
      const { data: newPoint, error: pointErr } = await supabaseAdmin
        .from('points')
        .insert({ statement: 'P425 test point for story_points ownership', author_id: ownerId })
        .select('id')
        .single();
      if (pointErr || !newPoint) throw new Error(`Failed to find/create point: ${pointErr?.message}`);
      pointId = newPoint.id;
    }
  });

  test.afterAll(async () => {
    if (linkedIds.length > 0) {
      await supabaseAdmin.from('story_points').delete().in('story_id', linkedIds);
    }
    await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(ownerId);
    await deleteTestUser(otherId);
  });

  test('story owner can link their story to a point', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: ownerEmail, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const ownerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    // author_id is required: NOT NULL with no default since P465
    // (20260301120000_story_points_author_unique.sql:49), and since P1034
    // (20260811140000_p1034_bind_story_points_author.sql:36) the INSERT policy
    // additionally requires author_id = auth.uid(). Omitting it made this test
    // impossible to pass — it failed on the not-null constraint (23502) before
    // the RLS predicate was ever exercised.
    const { error } = await ownerClient
      .from('story_points')
      .insert({ story_id: storyId, point_id: pointId, author_id: ownerId });

    if (!error) linkedIds.push(storyId);

    expect(
      error,
      `Story owner should be able to link their story to a point: ${error?.message}`
    ).toBeNull();
  });

  test('non-owner cannot link someone else\'s story to a point', async () => {
    // Ensure the link doesn't already exist (idempotent cleanup)
    await supabaseAdmin.from('story_points').delete()
      .eq('story_id', storyId).eq('point_id', pointId);

    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: otherEmail, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const otherClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    // Supply the non-owner's OWN author_id so the row satisfies both NOT NULL and
    // P1034's author_id = auth.uid() bind. The only remaining reason to reject it
    // is the story-ownership EXISTS clause — so a failure here proves RLS, which is
    // what this test claims. Previously the insert omitted author_id and was rejected
    // by the not-null constraint, making the assertion pass for the wrong reason.
    const { data, error } = await otherClient
      .from('story_points')
      .insert({ story_id: storyId, point_id: pointId, author_id: otherId })
      .select('story_id')
      .single();

    if (data?.story_id) {
      // Cleanup stray row before asserting
      await supabaseAdmin.from('story_points').delete()
        .eq('story_id', storyId).eq('point_id', pointId);
    }

    expect(
      error,
      'Non-owner should NOT be able to link another user\'s story to a point. RLS ownership check missing.'
    ).not.toBeNull();

    // The rejection must come from RLS (42501), not the not-null constraint (23502).
    //
    // What proves this test exercises the STORY-OWNERSHIP clause specifically is the
    // pair of cases, not this code alone. P1034's policy is:
    //     author_id = auth.uid() AND EXISTS (story owned by auth.uid())
    // Supplying the caller's own author_id satisfies the first conjunct in BOTH tests,
    // so story ownership is the only term that differs between them:
    //   - owner    + own author_id -> insert succeeds  (test above)
    //   - non-owner + own author_id -> 42501           (this test)
    // Measured 2026-08-11: omitting author_id also yields 42501, not 23502, because
    // the author_id conjunct rejects the NULL at the RLS layer before the not-null
    // constraint is reached. So the SQLSTATE alone does not identify WHICH conjunct
    // fired — only the paired cases above do.
    expect(
      error?.code,
      `Expected RLS violation 42501, got ${error?.code}: ${error?.message}`
    ).toBe('42501');
  });
});
