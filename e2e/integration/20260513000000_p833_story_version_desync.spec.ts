/**
 * @file 20260513000000_p833_story_version_desync.spec.ts
 * @description P833: Migration integration test — seal_and_send_letter desync fix.
 *
 * Two canaries (both FAIL before the migration is applied, PASS after):
 *
 * 1. Invariant trigger: directly bumping stories.current_version past
 *    max(story_versions.version_number) must raise an exception.
 *
 * 2. Seal fail-loud: sealing a letter whose doc contains a story with a
 *    missing story_versions row (simulating historical desync) must raise
 *    a 'story_versions desync' exception — never silently succeed.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

// =============================================================================
// 1. Invariant trigger: bumping current_version past max(version_number) raises
// =============================================================================

test.describe('P833: stories.current_version invariant trigger', () => {
  test.setTimeout(30000);

  let sender: TestUser;
  let storyId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P833-Invariant-Test' });
    const story = await createTestStory(sender.user.id, {
      content: 'Invariant trigger test story',
    });
    storyId = story.id;
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('direct UPDATE setting current_version > max(version_number) raises exception', async () => {
    // Verify the story was created with the expected invariant state.
    const { data: before } = await supabaseAdmin
      .from('stories')
      .select('current_version')
      .eq('id', storyId)
      .single();
    expect(before?.current_version).toBe(1);

    const { data: versionsBefore } = await supabaseAdmin
      .from('story_versions')
      .select('version_number')
      .eq('story_id', storyId);
    expect(versionsBefore?.length).toBe(1);
    expect(versionsBefore?.[0].version_number).toBe(1);

    // Try to bump current_version to 9999 without changing content.
    // Before fix: succeeds silently.
    // After fix (invariant trigger in place): raises exception.
    const { error } = await supabaseAdmin
      .from('stories')
      .update({ current_version: 9999 })
      .eq('id', storyId);

    expect(
      error,
      'P833 invariant trigger not yet deployed — UPDATE that violates current_version > max(version_number) must raise an exception after the migration runs'
    ).not.toBeNull();

    expect(error!.message).toMatch(/invariant/i);
  });
});

// =============================================================================
// 2. Seal fail-loud: letter with desynced story raises 'story_versions desync'
// =============================================================================

test.describe('P833: seal_and_send_letter raises on story_versions desync', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P833-Seal-Fail-Test' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P833 seal-fail test doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      content: 'Seal fail-loud test story',
      visibility: 'public',
    });
    storyId = story.id;

    // Link story to doc
    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId,
      story_id: storyId,
      position: 0,
    });

    // Create the desynced state: delete the story_versions row so current_version
    // has no matching row — exactly the join-miss that the RPC's INNER JOIN
    // silently drops (bug) or the fail-loud pre-flight catches (fix).
    await supabaseAdmin
      .from('story_versions')
      .delete()
      .eq('story_id', storyId);

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'draft',
      })
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
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('sealing a letter with desynced story raises story_versions desync exception', async () => {
    // Verify the desynced fixture was created correctly
    const { data: versions } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId);
    expect(versions?.length, 'fixture setup: story_versions row should be deleted').toBe(0);

    // Sign in as sender to call the RPC with auth.uid() = sender_id
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

    // Before fix: RPC returns true, letter_story_snapshots has 0 rows (silent drop).
    // After fix: RPC raises 'story_versions desync' exception.
    const { error: rpcErr } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [{ receiver_email: 'p833-reader@example.com', receiver_name: 'Reader' }],
    });

    expect(
      rpcErr,
      'P833 fail-loud RPC not yet deployed — seal_and_send_letter must raise on desynced story after the migration runs'
    ).not.toBeNull();

    expect(rpcErr!.message).toMatch(/desync/i);

    // Confirm the letter was NOT sealed (status remains draft)
    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .select('status')
      .eq('id', letterId)
      .single();
    expect(letter?.status, 'letter must stay draft after failed seal').toBe('draft');

    // Confirm no snapshot rows were created
    const { data: snapshots, error: snapErr } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('story_id')
      .eq('letter_id', letterId);
    expect(snapErr, `snapshots query failed: ${snapErr?.message}`).toBeNull();
    expect(snapshots?.length, 'no snapshots must be created when seal raises').toBe(0);
  });
});
