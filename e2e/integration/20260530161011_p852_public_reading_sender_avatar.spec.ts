/**
 * @file 20260530161011_p852_public_reading_sender_avatar.spec.ts
 * @description Integration test: verify get_letter_for_public_reading RPC returns
 *   sender_avatar_url, sender_avatar_color, sender_has_pledged on the letter object.
 *
 * P852 Phase-3 fix: the public RPC previously stripped these three fields. Result
 * — a sender opening their own one-to-many letter cover saw default-blue initials
 * instead of their Google photo + pledge ring. The authenticated reading RPC
 * (get_letter_for_reading) already returns them (P697 + P725); this migration
 * restores symmetry on the public path.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import {
  createTestLetter,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

test.describe('Migration: get_letter_for_public_reading returns sender avatar fields', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let storyId: string;
  let docId: string;
  let letterId: string;

  const TEST_AVATAR_URL = 'https://lh3.googleusercontent.com/a/MIGRATION-TEST-AVATAR';
  const TEST_AVATAR_COLOR = '#FF6B6B';

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P852 Migration Sender' });

    // Patch the sender profile with avatar_url + has_pledged after creation
    // (createTestUser sets a default avatar_color but not the other two).
    const { error: patchError } = await supabaseAdmin
      .from('profiles')
      .update({
        avatar_url: TEST_AVATAR_URL,
        avatar_color: TEST_AVATAR_COLOR,
        has_pledged: true,
      })
      .eq('id', sender.user.id);
    if (patchError) throw new Error(`Failed to patch sender profile: ${patchError.message}`);

    const story = await createTestStory(sender.user.id, {
      title: 'P852 migration story',
      content: 'P852 migration story content.',
    });
    storyId = story.id;

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P852 Migration Doc' })
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
        storyTitle: 'P852 migration story',
        storyText: 'P852 migration story content.',
        points: [],
      },
    });

    await sealTestLetter(letter.id);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('RPC returns sender_avatar_url on the letter object', async () => {
    const { data, error } = await supabaseAdmin.rpc('get_letter_for_public_reading', {
      p_letter_id: letterId,
    });
    expect(error, `RPC failed: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();

    const result = data as Record<string, unknown>;
    const letter = result.letter as Record<string, unknown>;

    expect(letter).toHaveProperty('sender_avatar_url');
    expect(letter.sender_avatar_url).toBe(TEST_AVATAR_URL);
  });

  test('RPC returns sender_avatar_color on the letter object', async () => {
    const { data } = await supabaseAdmin.rpc('get_letter_for_public_reading', {
      p_letter_id: letterId,
    });
    const letter = (data as Record<string, unknown>).letter as Record<string, unknown>;

    expect(letter).toHaveProperty('sender_avatar_color');
    expect(letter.sender_avatar_color).toBe(TEST_AVATAR_COLOR);
  });

  test('RPC returns sender_has_pledged=true on the letter object', async () => {
    const { data } = await supabaseAdmin.rpc('get_letter_for_public_reading', {
      p_letter_id: letterId,
    });
    const letter = (data as Record<string, unknown>).letter as Record<string, unknown>;

    expect(letter).toHaveProperty('sender_has_pledged');
    expect(letter.sender_has_pledged).toBe(true);
  });

  test('RPC is callable by the anon role and returns avatar fields without auth', async () => {
    // The migration's GRANT EXECUTE TO anon is the entire point of this fix —
    // without it, public (unauthenticated) readers can't load the letter cover.
    // supabaseAdmin uses service_role, which bypasses GRANTs, so the four tests
    // above would pass even if the GRANT line were missing or wrong. This case
    // exercises the anon path explicitly.
    const anonClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await anonClient.rpc('get_letter_for_public_reading', {
      p_letter_id: letterId,
    });
    expect(error, `Anon RPC failed: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();

    const letter = (data as Record<string, unknown>).letter as Record<string, unknown>;
    expect(letter.sender_avatar_url).toBe(TEST_AVATAR_URL);
    expect(letter.sender_avatar_color).toBe(TEST_AVATAR_COLOR);
    expect(letter.sender_has_pledged).toBe(true);
  });

  test('RPC returns sender_has_pledged=false when sender profile has it unset', async () => {
    // Create a second sender with has_pledged=false and a separate letter.
    const sender2 = await createTestUser({ name: 'P852 Unpledged Sender' });
    let letter2Id: string | undefined;
    let story2Id: string | undefined;
    let doc2Id: string | undefined;
    try {
      await supabaseAdmin
        .from('profiles')
        .update({ has_pledged: false })
        .eq('id', sender2.user.id);

      const story2 = await createTestStory(sender2.user.id, {
        title: 'Unpledged story',
        content: 'Unpledged story content.',
      });
      story2Id = story2.id;

      const { data: doc2 } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ owner_id: sender2.user.id, title: 'Unpledged Doc' })
        .select('id')
        .single();
      if (!doc2) throw new Error('Doc2 creation failed');
      doc2Id = doc2.id;
      await supabaseAdmin
        .from('doc_stories')
        .insert({ doc_id: doc2Id, story_id: story2Id, position: 0 });

      const letter2 = await createTestLetter(sender2.user.id, doc2Id, { mode: 'one-to-many' });
      letter2Id = letter2.id;

      const { data: version2 } = await supabaseAdmin
        .from('story_versions')
        .select('id')
        .eq('story_id', story2Id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!version2) throw new Error('Story2 version not found');

      await createTestStorySnapshot(letter2.id, story2Id, version2.id, {
        position: 0,
        pointConfig: { storyTitle: 'Unpledged story', storyText: 'Unpledged.', points: [] },
      });
      await sealTestLetter(letter2.id);

      const { data } = await supabaseAdmin.rpc('get_letter_for_public_reading', {
        p_letter_id: letter2.id,
      });
      const letter = (data as Record<string, unknown>).letter as Record<string, unknown>;

      expect(letter.sender_has_pledged).toBe(false);
    } finally {
      if (letter2Id) await deleteTestLetter(letter2Id);
      if (story2Id) await deleteTestStory(story2Id);
      if (doc2Id) {
        await supabaseAdmin.from('doc_stories').delete().eq('doc_id', doc2Id);
        await supabaseAdmin.from('clarity_docs').delete().eq('id', doc2Id);
      }
      await deleteTestUser(sender2.user.id);
    }
  });
});
