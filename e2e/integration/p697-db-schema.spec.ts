/**
 * @file p697-db-schema.spec.ts
 * @description Integration test: verify get_letter_for_reading and
 *   get_letter_for_public_reading RPCs return sender avatar fields.
 *
 * Bug P697: both RPCs joined profiles for sender_display_name but omitted
 * avatar_url, avatar_color, and has_pledged. Recipients saw initials only.
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

test.describe('P697: sender avatar fields in letter reading RPCs', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let storyId: string;
  let docId: string;
  let oneToOneLetterId: string;
  let publicLetterId: string;

  const AVATAR_URL = 'https://lh3.googleusercontent.com/p697-test.jpg';
  const AVATAR_COLOR = '#3B82F6';

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P697 Avatar Sender' });

    // Set avatar fields on the sender profile
    await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: AVATAR_URL, avatar_color: AVATAR_COLOR, has_pledged: true })
      .eq('id', sender.user.id);

    const story = await createTestStory(sender.user.id, {
      title: 'P697 avatar test story',
      content: 'P697 avatar test story content.',
    });
    storyId = story.id;

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P697 Migration Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });

    // Create the version snapshot helper
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    const snapshotConfig = {
      position: 0,
      pointConfig: {
        storyTitle: 'P697 avatar test story',
        storyText: 'P697 avatar test story content.',
        points: [],
      },
    };

    // One-to-one letter (token path)
    const oneToOneLetter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    oneToOneLetterId = oneToOneLetter.id;
    await createTestStorySnapshot(oneToOneLetter.id, storyId, version.id, snapshotConfig);
    await sealTestLetter(oneToOneLetter.id);

    // Create a delivery with an invitation token for the one-to-one letter
    await supabaseAdmin.from('letter_deliveries').update({
      invitation_token: '00000000-0000-0000-0000-000000000697',
    }).eq('letter_id', oneToOneLetter.id);

    // One-to-many (public) letter
    const publicLetter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    publicLetterId = publicLetter.id;
    await createTestStorySnapshot(publicLetter.id, storyId, version.id, snapshotConfig);
    await sealTestLetter(publicLetter.id);
  });

  test.afterAll(async () => {
    if (oneToOneLetterId) await deleteTestLetter(oneToOneLetterId);
    if (publicLetterId) await deleteTestLetter(publicLetterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('get_letter_for_public_reading returns sender avatar fields', async () => {
    const { data, error } = await supabaseAdmin.rpc('get_letter_for_public_reading', {
      p_letter_id: publicLetterId,
    });

    expect(error, `RPC failed: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();

    const result = data as Record<string, unknown>;
    const letter = result.letter as Record<string, unknown>;

    expect(letter.sender_avatar_url).toBe(AVATAR_URL);
    expect(letter.sender_avatar_color).toBe(AVATAR_COLOR);
    expect(letter.sender_has_pledged).toBe(true);
  });

  test('get_letter_for_public_reading: sender_has_pledged is false when not pledged', async () => {
    // Update sender to not be pledged
    await supabaseAdmin.from('profiles').update({ has_pledged: false }).eq('id', sender.user.id);
    try {
      const { data, error } = await supabaseAdmin.rpc('get_letter_for_public_reading', {
        p_letter_id: publicLetterId,
      });
      expect(error).toBeNull();
      const letter = (data as Record<string, unknown>).letter as Record<string, unknown>;
      expect(letter.sender_has_pledged).toBe(false);
    } finally {
      // Restore
      await supabaseAdmin.from('profiles').update({ has_pledged: true }).eq('id', sender.user.id);
    }
  });
});
