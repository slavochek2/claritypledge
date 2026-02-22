/**
 * @file p413-db-schema.spec.ts
 * @description Integration tests for P413: nullable story_id/version_id on story_verifications
 *
 * Verifies:
 * 1. story_id and version_id are nullable (migration applied)
 * 2. Insert with null story_id/version_id succeeds (loose paraphrase exchange)
 * 3. Insert with story_id/version_id still works (formal story exchange)
 * 4. update_story_understood_count trigger does not error on null story_id
 *
 * If tests fail with NOT NULL constraint: apply migration
 * supabase/migrations/20260222120000_p413_nullable_story_verifications.sql
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';
import { createClient } from '@supabase/supabase-js';

test.describe('P413: story_verifications — nullable story_id/version_id', () => {
  let speakerUserId: string;
  let listenerUserId: string;
  let speakerEmail: string;
  let storyId: string | null = null;
  let versionId: string | null = null;
  const verificationIds: string[] = [];

  test.beforeAll(async () => {
    speakerEmail = generateTestEmail();
    const speakerUser = await createTestUser({ email: speakerEmail, name: 'P413 Speaker' });
    const listenerUser = await createTestUser({ name: 'P413 Listener' });
    speakerUserId = speakerUser.user.id;
    listenerUserId = listenerUser.user.id;

    // Create a story + version for tests that use a formal story
    const { data: story, error: storyError } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: speakerUserId,
        content: 'P413 integration test story — nullable story_id check',
        visibility: 'public',
      })
      .select('id')
      .single();

    if (storyError || !story) {
      throw new Error(`Failed to create test story: ${storyError?.message}`);
    }
    storyId = story.id;

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
    if (verificationIds.length > 0) {
      await supabaseAdmin.from('story_verifications').delete().in('id', verificationIds);
    }
    if (storyId) {
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
    await deleteTestUser(speakerUserId);
    await deleteTestUser(listenerUserId);
  });

  // ── 1. Schema: story_id is nullable ────────────────────────────────────────
  test('story_id column is nullable (P413 migration applied)', async () => {
    const { data, error } = await supabaseAdmin
      .from('story_verifications')
      .insert({
        story_id: null,
        version_id: null,
        speaker_id: speakerUserId,
        listener_id: listenerUserId,
        speaker_rating: 7,
        listener_rating: 7,
      })
      .select('id, story_id, version_id')
      .single();

    if (data?.id) verificationIds.push(data.id);
    expect(
      error,
      `P413 migration not applied — story_id is still NOT NULL.\n` +
      `Run: ./scripts/migrate.sh\nError: ${error?.message}`
    ).toBeNull();
    expect(data?.story_id).toBeNull();
    expect(data?.version_id).toBeNull();
  });

  // ── 2. Trigger safety: null story_id does not crash update_story_understood_count ──
  test('null story_id does not error in update_story_understood_count trigger', async () => {
    // Insert with speaker_rating=10 to trigger the understood_count update path
    const { data, error } = await supabaseAdmin
      .from('story_verifications')
      .insert({
        story_id: null,
        version_id: null,
        speaker_id: speakerUserId,
        listener_id: listenerUserId,
        speaker_rating: 10,
        listener_rating: 10,
      })
      .select('id, accuracy_achieved')
      .single();

    if (data?.id) verificationIds.push(data.id);
    expect(error, `Trigger errored on null story_id: ${error?.message}`).toBeNull();
    expect(data?.accuracy_achieved).toBe(true);
  });

  // ── 3. Formal story exchange still works ───────────────────────────────────
  test('verification with story_id/version_id still inserts correctly', async () => {
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
      .select('id, story_id, version_id')
      .single();

    if (data?.id) verificationIds.push(data.id);
    expect(error).toBeNull();
    expect(data?.story_id).toBe(storyId);
    expect(data?.version_id).toBe(versionId);
  });

  // ── 4. RLS: authenticated speaker can insert with null story_id ────────────
  test('authenticated speaker can insert a loose exchange (null story_id)', async () => {
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
        story_id: null,
        version_id: null,
        speaker_id: speakerUserId,
        listener_id: listenerUserId,
        speaker_rating: 6,
        listener_rating: 6,
      })
      .select('id, story_id')
      .single();

    if (data?.id) verificationIds.push(data.id);
    expect(error, `RLS blocked loose exchange insert: ${error?.message}`).toBeNull();
    expect(data?.story_id).toBeNull();
  });
});
