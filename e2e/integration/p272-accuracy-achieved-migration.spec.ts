/**
 * @file p272-accuracy-achieved-migration.spec.ts
 * @description Integration tests for P272: accuracy_achieved threshold migration
 *
 * Verifies:
 * 1. accuracy_achieved column exists on story_verifications (migration applied)
 * 2. accuracy_achieved is FALSE for speaker_rating = 8 (regression: old ≥8 threshold was true)
 * 3. accuracy_achieved is FALSE for speaker_rating = 9
 * 4. accuracy_achieved is TRUE for speaker_rating = 10 only
 * 5. RLS INSERT policy: authenticated user who is speaker_id can insert
 * 6. RLS INSERT policy: user who is neither speaker nor listener cannot insert (tightened policy)
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema checks, test data creation (bypasses RLS — proves column exists)
 * - user-scoped client: RLS assertions (proves actual user access is enforced)
 *
 * If tests fail with "column not found": apply migration
 * supabase/migrations/20260218_p272_accuracy_achieved_threshold.sql
 *
 * If test 6 (RLS) fails with "insert succeeded for non-participant": the tightened
 * INSERT policy was not applied — re-run the migration.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';

test.describe('P272: story_verifications.accuracy_achieved — threshold = 10', () => {
  let speakerUserId: string;
  let listenerUserId: string;
  let speakerEmail: string;
  let storyId: string | null = null;
  let versionId: string | null = null;
  const verificationIds: string[] = [];

  test.beforeAll(async () => {
    speakerEmail = generateTestEmail();
    const speakerUser = await createTestUser({ email: speakerEmail, name: 'P272 Speaker' });
    const listenerUser = await createTestUser({ name: 'P272 Listener' });
    speakerUserId = speakerUser.user.id;
    listenerUserId = listenerUser.user.id;

    // Create story + version for FK references in story_verifications
    const { data: story, error: storyError } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: speakerUserId,
        content: 'P272 integration test story — accuracy_achieved threshold check',
        visibility: 'public',
      })
      .select('id')
      .single();

    if (storyError || !story) {
      throw new Error(`Failed to create test story: ${storyError?.message}`);
    }
    storyId = story.id;

    // Version is auto-created by trigger after story insert
    const { data: version, error: versionError } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    if (versionError || !version) {
      throw new Error(`Failed to get story version: ${versionError?.message}`);
    }
    versionId = version.id;
  });

  test.afterAll(async () => {
    // Clean up in order: verifications → story (cascades versions) → users
    if (verificationIds.length > 0) {
      await supabaseAdmin.from('story_verifications').delete().in('id', verificationIds);
    }
    if (storyId) {
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
    await deleteTestUser(speakerUserId);
    await deleteTestUser(listenerUserId);
  });

  // ── 1. Schema check: column must exist ───────────────────────────────────
  test('accuracy_achieved column exists on story_verifications (P272 migration applied)', async () => {
    const { error } = await supabaseAdmin
      .from('story_verifications')
      .select('accuracy_achieved')
      .limit(1);

    expect(
      error,
      `P272 migration not applied — "accuracy_achieved" missing from "story_verifications".\n` +
      `Run: supabase db push\nError: ${error?.message}`
    ).toBeNull();
  });

  // ── 2. Threshold: speaker_rating = 8 → false (regression check) ──────────
  test('accuracy_achieved is false when speaker_rating = 8 (regression: old ≥8 threshold would be true)', async () => {
    const { data, error } = await supabaseAdmin
      .from('story_verifications')
      .insert({
        story_id: storyId,
        version_id: versionId,
        speaker_id: speakerUserId,
        listener_id: listenerUserId,
        speaker_rating: 8,
        listener_rating: 8,
      })
      .select('id, accuracy_achieved')
      .single();

    if (data?.id) verificationIds.push(data.id);
    expect(error).toBeNull();
    expect(data?.accuracy_achieved).toBe(false);
  });

  // ── 3. Threshold: speaker_rating = 9 → false ─────────────────────────────
  test('accuracy_achieved is false when speaker_rating = 9', async () => {
    const { data, error } = await supabaseAdmin
      .from('story_verifications')
      .insert({
        story_id: storyId,
        version_id: versionId,
        speaker_id: speakerUserId,
        listener_id: listenerUserId,
        speaker_rating: 9,
        listener_rating: 9,
      })
      .select('id, accuracy_achieved')
      .single();

    if (data?.id) verificationIds.push(data.id);
    expect(error).toBeNull();
    expect(data?.accuracy_achieved).toBe(false);
  });

  // ── 4. Threshold: speaker_rating = 10 → true ─────────────────────────────
  test('accuracy_achieved is true when speaker_rating = 10', async () => {
    const { data, error } = await supabaseAdmin
      .from('story_verifications')
      .insert({
        story_id: storyId,
        version_id: versionId,
        speaker_id: speakerUserId,
        listener_id: listenerUserId,
        speaker_rating: 10,
        listener_rating: 8,
      })
      .select('id, accuracy_achieved')
      .single();

    if (data?.id) verificationIds.push(data.id);
    expect(error).toBeNull();
    expect(data?.accuracy_achieved).toBe(true);
  });

  // ── 5. RLS INSERT: user as speaker_id can insert ──────────────────────────
  test('authenticated user who is speaker_id can insert a verification', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: speakerEmail,
      password: 'test-password-12345',
    });
    expect(signInError).toBeNull();

    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data, error } = await userClient
      .from('story_verifications')
      .insert({
        story_id: storyId,
        version_id: versionId,
        speaker_id: speakerUserId, // caller IS the speaker
        listener_id: listenerUserId,
        speaker_rating: 7,
        listener_rating: 7,
      })
      .select('id, accuracy_achieved')
      .single();

    if (data?.id) verificationIds.push(data.id);
    expect(error, `RLS blocked speaker from inserting: ${error?.message}`).toBeNull();
    expect(data?.accuracy_achieved).toBe(false);
  });

  // ── 6. RLS INSERT: non-participant cannot insert ──────────────────────────
  test('user who is neither speaker nor listener cannot insert a verification (tightened RLS)', async () => {
    const attackerEmail = generateTestEmail();
    const attackerUser = await createTestUser({ email: attackerEmail, name: 'P272 Attacker' });

    try {
      const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: attackerEmail,
        password: 'test-password-12345',
      });
      expect(signInError).toBeNull();

      const attackerClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
          auth: { autoRefreshToken: false, persistSession: false },
        }
      );

      // Attacker tries to insert for speakerUserId/listenerUserId — they are neither
      const { data, error } = await attackerClient
        .from('story_verifications')
        .insert({
          story_id: storyId,
          version_id: versionId,
          speaker_id: speakerUserId,   // attacker is NOT this user
          listener_id: listenerUserId, // attacker is NOT this user
          speaker_rating: 10,
          listener_rating: 10,
        })
        .select('id')
        .single();

      if (data?.id) {
        // Unexpected success — clean up and fail the test
        verificationIds.push(data.id);
      }

      // RLS WITH CHECK (auth.uid() = speaker_id OR auth.uid() = listener_id) must block this
      expect(error, 'Tightened RLS policy should have blocked insert by non-participant').not.toBeNull();

    } finally {
      await deleteTestUser(attackerUser.user.id);
    }
  });
});
