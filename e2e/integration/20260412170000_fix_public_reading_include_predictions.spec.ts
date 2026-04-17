/**
 * @file 20260412170000_fix_public_reading_include_predictions.spec.ts
 * @description Integration test: verify get_letter_for_public_reading RPC returns
 *   a `predictions` array (shared letter_predictions with delivery_id IS NULL).
 *
 * This migration extends the SECURITY DEFINER RPC to include shared predictions
 * so that one-to-many readers can see the sender's prediction after rating.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import {
  createTestLetter,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

test.describe('Migration: get_letter_for_public_reading returns predictions', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let storyId: string;
  let docId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P270 Migration Sender' });

    const story = await createTestStory(sender.user.id, {
      title: 'Migration test story',
      content: 'Migration test story content.',
    });
    storyId = story.id;

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'Migration Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    await createTestStorySnapshot(letter.id, storyId, version.id, {
      position: 0,
      pointConfig: {
        storyTitle: 'Migration test story',
        storyText: 'Migration test story content.',
        points: [],
      },
    });

    await sealTestLetter(letter.id);

    // Insert a shared prediction (delivery_id IS NULL)
    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      story_id: storyId,
      sender_id: sender.user.id,
      prediction: 7,
      delivery_id: null,
    });
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
      await deleteTestLetter(letterId);
    }
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('RPC returns predictions array with shared prediction', async () => {
    const { data, error } = await supabaseAdmin.rpc('get_letter_for_public_reading', {
      p_letter_id: letterId,
    });

    expect(error, `RPC failed: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();

    const result = data as Record<string, unknown>;
    expect(result).toHaveProperty('letter');
    expect(result).toHaveProperty('snapshots');
    expect(result).toHaveProperty('predictions');

    const predictions = result.predictions as Array<{ story_id: string; prediction: number }>;
    expect(Array.isArray(predictions)).toBe(true);
    expect(predictions.length).toBeGreaterThan(0);

    const pred = predictions.find((p) => p.story_id === storyId);
    expect(pred, 'Shared prediction not found in RPC result').toBeDefined();
    expect(pred!.prediction).toBe(7);
  });

  test('RPC returns empty predictions array when no shared predictions exist', async () => {
    // Create a separate letter with no predictions
    const letter2 = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (version) {
      await createTestStorySnapshot(letter2.id, storyId, version.id, {
        position: 0,
        pointConfig: { storyTitle: 'Test', storyText: 'Test.', points: [] },
      });
    }
    await sealTestLetter(letter2.id);

    try {
      const { data, error } = await supabaseAdmin.rpc('get_letter_for_public_reading', {
        p_letter_id: letter2.id,
      });

      expect(error).toBeNull();
      const result = data as Record<string, unknown>;
      const predictions = result.predictions as unknown[];
      expect(Array.isArray(predictions)).toBe(true);
      expect(predictions.length).toBe(0);
    } finally {
      await deleteTestLetter(letter2.id);
    }
  });
});
