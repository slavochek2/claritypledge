/**
 * @file p1030-snapshot-stamp.spec.ts
 * @description P1030 Decision 5: the reverse-story marker is written onto a sealed
 * `letter_story_snapshots` row by the service role, and by nothing else.
 *
 * P1030 has NO migration and NO triggers (Decision 2). The only mechanism that makes a letter
 * a reverse letter is this write, performed by `/align-create-letter` after `seal_and_send_letter`
 * returns. Two properties matter and both are asserted here:
 *
 *   1. The merge lands and is non-destructive — `reverseStory` appears, and the keys the reading
 *      view already depends on (`storyText`, `points`, `order`, `lead_count`) survive untouched.
 *   2. CONTROL — the same write from an authenticated client affects zero rows. The snapshot
 *      table's INSERT/UPDATE/DELETE policies are all `false` for client roles
 *      (`20260403224331_p581_clarity_letters.sql:228-238`), which is what makes the marker
 *      unforgeable from a browser session. Without this control, a write that silently no-ops for
 *      *every* role would look identical to one the policy is correctly gating.
 *
 * The skill performs the merge server-side and atomically as
 * `point_config = point_config || '{"reverseStory": true}'::jsonb`. PostgREST cannot express `||`,
 * so the service-role case below does the equivalent read-modify-write. What is under test is the
 * policy boundary and the resulting document shape, both of which are identical either way; the
 * atomicity difference is immaterial because nothing else writes a snapshot after seal time.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestLetter, createTestStorySnapshot, sealTestLetter, deleteTestLetter } from '../helpers/test-letter';

/** The shape the seal RPC actually writes (p975:113-145) — the sibling keys that must survive. */
const SEALED_POINT_CONFIG = {
  storyText: 'The reasoning, as the agent understood it.',
  imageUrl: '',
  points: [{ id: 'p1', text: 'A point', authorPosition: '3', visibility: 'private', hidden: false }],
  order: ['p1'],
  hidden: [],
  lead_count: 1,
};

test.describe('P1030: snapshot stamp (Decision 5)', () => {
  let sender: TestUser;
  let storyId: string;
  let docId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P1030 Stamp Sender' });

    const story = await createTestStory(sender.id, {
      title: `P1030 stamp story ${Date.now()}`,
      visibility: 'private',
    });
    storyId = story.id;

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.id, title: 'P1030 stamp doc', visibility: 'private' })
      .select('id')
      .single();
    docId = doc!.id;
    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });

    const letter = await createTestLetter(sender.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    await createTestStorySnapshot(letterId, storyId, version!.id, { pointConfig: SEALED_POINT_CONFIG });
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender) await deleteTestUser(sender.id);
  });

  test('service role stamps reverseStory onto the sealed snapshot without disturbing sibling keys', async () => {
    const { data: before, error: readError } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('point_config')
      .eq('letter_id', letterId)
      .eq('story_id', storyId)
      .single();
    expect(readError).toBeNull();
    expect(before?.point_config?.reverseStory).toBeUndefined();

    const { error: writeError } = await supabaseAdmin
      .from('letter_story_snapshots')
      .update({ point_config: { ...before!.point_config, reverseStory: true } })
      .eq('letter_id', letterId)
      .eq('story_id', storyId);
    expect(writeError, `service role could not stamp the snapshot: ${writeError?.message}`).toBeNull();

    // Read back rather than trusting the write — this mirrors the skill's own assert step.
    const { data: after } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('point_config')
      .eq('letter_id', letterId)
      .eq('story_id', storyId)
      .single();

    expect(after?.point_config?.reverseStory).toBe(true);
    // Non-destructive: everything the reading view already reads is still there.
    expect(after?.point_config?.storyText).toBe(SEALED_POINT_CONFIG.storyText);
    expect(after?.point_config?.points).toHaveLength(1);
    expect(after?.point_config?.order).toEqual(['p1']);
    expect(after?.point_config?.lead_count).toBe(1);
  });

  test('CONTROL — an authenticated client cannot stamp or clear the marker (zero rows affected)', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: sender.email,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();

    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } } }
    );

    // The sender of this very letter — the most privileged client role that exists for this row.
    const { data: affected, error } = await userClient
      .from('letter_story_snapshots')
      .update({ point_config: { reverseStory: false, storyText: 'tampered' } })
      .eq('letter_id', letterId)
      .eq('story_id', storyId)
      .select('letter_id');

    // RLS UPDATE USING(false) filters the row out rather than erroring: zero rows, no error.
    expect(affected ?? [], 'an authenticated client updated a sealed snapshot — write policy is not holding').toHaveLength(0);
    expect(error).toBeNull();

    // And the row is genuinely untouched, not merely unreported.
    const { data: after } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('point_config')
      .eq('letter_id', letterId)
      .eq('story_id', storyId)
      .single();
    expect(after?.point_config?.reverseStory).toBe(true);
    expect(after?.point_config?.storyText).toBe(SEALED_POINT_CONFIG.storyText);
  });
});
