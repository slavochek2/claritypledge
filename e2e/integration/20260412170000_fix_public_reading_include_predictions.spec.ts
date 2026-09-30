/**
 * @file 20260412170000_fix_public_reading_include_predictions.spec.ts
 * @description Integration test: verify get_letter_for_public_reading RPC returns
 *   a `predictions` array (shared letter_predictions with delivery_id IS NULL).
 *
 * This migration extends the SECURITY DEFINER RPC to include shared predictions
 * so that one-to-many readers can see the sender's prediction after rating.
 *
 * P1379 (2026-09-30) REVERSES the display half of this: a one-to-many letter never
 * discloses the author's prediction. The `predictions` key stays (shape unchanged),
 * but is always '[]' — even for an old letter that still stores a shared prediction.
 * See 20260930120000_p1379_public_letters_no_author_prediction.sql.
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
    // P1379: `sender_id` is not a letter_predictions column — the insert used to fail
    // silently (unchecked), so no shared prediction was ever seeded. Checked now.
    const { error: predErr } = await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      story_id: storyId,
      prediction: 7,
      delivery_id: null,
    });
    if (predErr) throw new Error(`shared prediction seed failed: ${predErr.message}`);
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

  test('P1379: RPC returns an EMPTY predictions array even when a shared prediction is stored', async () => {
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
    expect(predictions, 'P1379: a one-to-many letter must not disclose the author prediction').toEqual([]);

    // Known-bad input control: the shared prediction IS still stored (no data deleted).
    const { data: stored } = await supabaseAdmin
      .from('letter_predictions')
      .select('prediction')
      .eq('letter_id', letterId)
      .eq('story_id', storyId);
    expect(stored).toEqual([{ prediction: 7 }]);
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
