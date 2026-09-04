/**
 * @file p1212-db-schema.spec.ts
 * @description P1212 §4b: migration integration test — the sealed snapshot carries the
 * STORY's own author id.
 *
 * WHY THIS EXISTS. Before 20260903164500, `seal_and_send_letter` recorded storyText,
 * imageUrl, videoUrl and videoQuotes and NO author identity. The letter surface therefore
 * derived the byline from the letter's SENDER (`story-walk.tsx`: "Author of the story =
 * sender"). Sound for a sender's own stories — the only ones `doc_stories` INSERT lets a
 * user attach — but the disagreement pipeline writes through the service role, which
 * bypasses that RLS. A machine-authored reading then rendered under a human's name.
 *
 * THE ASSERTION THAT MATTERS is the third one: a story authored by someone OTHER than the
 * sender must snapshot that other author's id. A test where sender and author coincide
 * passes on the pre-migration function too — it cannot tell a correct value from a
 * defaulted one, which is the vacuity failure P1212's own canary file was defeated by.
 *
 * Also guards the P1141 keys against a future CREATE OR REPLACE dropping them, the
 * regression this function has suffered three times (P952, P749/P757, P833).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

const STORY_CONTENT = 'P1212: a reading authored by an account that is not the sender.';

test.describe('Migration p1212: seal_and_send_letter records the story author', () => {
  test.setTimeout(90000);

  let sender: TestUser;
  let author: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P1212-Integration-Sender' });
    // The whole point: the story's author is NOT the sender.
    author = await createTestUser({ name: 'P1212-Integration-Author' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P1212 integration doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(author.user.id, {
      content: STORY_CONTENT,
      visibility: 'public',
    });
    storyId = story.id;

    // Service-role attach — mirrors how the disagreement pipeline files a reading, and is
    // the exact path that bypasses the "sender owns the story" RLS the old byline assumed.
    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: sender.user.id, mode: 'one-to-one', status: 'draft' })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (storyId) await deleteTestStory(storyId);
    if (author?.user?.id) await deleteTestUser(author.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('sealed snapshot carries storyAuthorId, and it is the STORY author, not the sender', async () => {
    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: sender.email,
      password: TEST_PASSWORD,
    });
    if (signInErr || !signIn.session) throw new Error(`Sign-in failed: ${signInErr?.message}`);

    const senderClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: rpcErr } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [{ receiver_email: 'p1212-reader@example.com', receiver_name: 'Reader' }],
    });
    expect(rpcErr, `seal_and_send_letter failed: ${rpcErr?.message}`).toBeNull();

    const { data: snapshots, error: snapErr } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('point_config')
      .eq('letter_id', letterId);

    expect(snapErr).toBeNull();
    expect(snapshots!.length).toBeGreaterThan(0);

    const config = snapshots![0].point_config as Record<string, unknown>;

    // 1. The key exists at all. Absent ⟹ the migration did not run, or a later
    //    CREATE OR REPLACE rebuilt the function from a pre-P1212 base.
    expect(
      Object.prototype.hasOwnProperty.call(config, 'storyAuthorId'),
      'storyAuthorId missing from point_config — migration 20260903164500 not applied, or dropped by a later CREATE OR REPLACE',
    ).toBe(true);

    // 2. It is the STORY's author. This is the assertion the pre-migration function
    //    cannot satisfy, and the reason sender !== author in this fixture.
    expect(
      config.storyAuthorId,
      'storyAuthorId must be the story author, not the letter sender — a machine reading must not render under the sender name',
    ).toBe(author.user.id);

    // 3. And explicitly NOT the sender — stated separately so a future change that
    //    defaults the key to the sender fails loudly rather than passing assertion 1.
    expect(config.storyAuthorId).not.toBe(sender.user.id);

    // 4. P1141 keys survive — the drop-on-replace regression this function has had 3×.
    expect(config.storyText, 'storyText must still be populated (P1141 regression guard)').toBe(
      STORY_CONTENT,
    );
    expect(
      Object.prototype.hasOwnProperty.call(config, 'videoUrl'),
      'videoUrl key must survive (P1141 regression guard)',
    ).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(config, 'videoQuotes'),
      'videoQuotes key must survive (P1141 regression guard)',
    ).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(config, 'imageUrl'),
      'imageUrl key must survive (P819 regression guard)',
    ).toBe(true);
  });
});
