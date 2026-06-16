/**
 * @file p940-ear-metric.spec.ts
 * @description P940 Integration Test — `update_profile_ears_count` trigger semantics.
 *
 * Verifies the redefined ear metric against the test DB:
 *  1. ears_count = COUNT(DISTINCT story_id) — 5 distinct rated stories ⇒ 5 ears.
 *  2. Per-story dedup — re-rating the SAME story 3× ⇒ still 1 ear.
 *  3. No verified gate — a sub-8 rating (accuracy_achieved = false) still counts ⇒ 1 ear.
 *     (Under the old trigger this would have been 0 — this is the core behavior change.)
 *
 * Single-client pattern: all writes use supabaseAdmin (service role). The trigger runs
 * SECURITY DEFINER, so it updates profiles regardless of the writer.
 *
 * If tests fail with stale counts: run `./scripts/migrate.sh` to apply the P940 migration.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

const createdStoryIds: string[] = [];
const createdUserIds: string[] = [];

/** Create a story (author=authorId) and return its id + auto-created version id. */
async function createStoryWithVersion(authorId: string): Promise<{ storyId: string; versionId: string }> {
  const { data: story, error: storyError } = await supabaseAdmin
    .from('stories')
    .insert({ author_id: authorId, content: 'P940 trigger test story', visibility: 'public' })
    .select('id')
    .single();
  if (storyError || !story) throw new Error(`createStory failed: ${storyError?.message}`);
  createdStoryIds.push(story.id);

  const { data: version, error: versionError } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();
  if (versionError || !version) throw new Error(`get version failed: ${versionError?.message}`);

  return { storyId: story.id, versionId: version.id };
}

async function insertVerification(v: {
  storyId: string;
  versionId: string;
  speakerId: string;
  listenerId: string;
  speakerRating: number;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('story_verifications').insert({
    story_id: v.storyId,
    version_id: v.versionId,
    speaker_id: v.speakerId,
    listener_id: v.listenerId,
    speaker_rating: v.speakerRating,
    listener_rating: 7,
  });
  if (error) throw new Error(`insert verification failed: ${error.message}`);
}

async function earsCountOf(profileId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('ears_count')
    .eq('id', profileId)
    .single();
  if (error || !data) throw new Error(`read ears_count failed: ${error?.message}`);
  return data.ears_count ?? 0;
}

test.describe('P940: ear metric trigger — per-story, no verified gate', () => {
  let speakerId: string;

  test.beforeAll(async () => {
    const speaker = await createTestUser({ name: 'P940 Speaker' });
    speakerId = speaker.user.id;
    createdUserIds.push(speakerId);
  });

  test.afterAll(async () => {
    // Stories cascade-delete their verifications (ON DELETE CASCADE).
    for (const storyId of createdStoryIds) {
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
    for (const userId of createdUserIds) {
      await deleteTestUser(userId);
    }
  });

  test('ears_count column exists on profiles (migration applied)', async () => {
    const { error } = await supabaseAdmin.from('profiles').select('ears_count').limit(1);
    expect(error, 'Migration not applied — run ./scripts/migrate.sh').toBeNull();
  });

  test('5 distinct rated stories ⇒ 5 ears (same speaker, no dedup-by-speaker)', async () => {
    const listener = await createTestUser({ name: 'P940 Listener Five' });
    createdUserIds.push(listener.user.id);

    for (let i = 0; i < 5; i++) {
      const { storyId, versionId } = await createStoryWithVersion(speakerId);
      await insertVerification({ storyId, versionId, speakerId, listenerId: listener.user.id, speakerRating: 9 });
    }

    expect(await earsCountOf(listener.user.id)).toBe(5);
  });

  test('re-rating the SAME story 3× ⇒ 1 ear (per-story dedup)', async () => {
    const listener = await createTestUser({ name: 'P940 Listener Dedup' });
    createdUserIds.push(listener.user.id);

    const { storyId, versionId } = await createStoryWithVersion(speakerId);
    for (let i = 0; i < 3; i++) {
      await insertVerification({ storyId, versionId, speakerId, listenerId: listener.user.id, speakerRating: 8 + i % 2 });
    }

    expect(await earsCountOf(listener.user.id)).toBe(1);
  });

  test('a sub-8 rating still counts ⇒ 1 ear (no verified gate)', async () => {
    const listener = await createTestUser({ name: 'P940 Listener LowScore' });
    createdUserIds.push(listener.user.id);

    const { storyId, versionId } = await createStoryWithVersion(speakerId);
    // speaker_rating 3 ⇒ accuracy_achieved = false. Old trigger: 0 ears. New: 1.
    await insertVerification({ storyId, versionId, speakerId, listenerId: listener.user.id, speakerRating: 3 });

    expect(await earsCountOf(listener.user.id)).toBe(1);
  });
});
