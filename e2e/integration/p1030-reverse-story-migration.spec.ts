/**
 * @file p1030-reverse-story-migration.spec.ts
 * @description P1030: DB migration verification for the reverse-story marker
 * (20260807120000_p1030_reverse_story_marker.sql)
 *
 * P270 MANDATORY integration test — schema existence + RLS, two-client pattern.
 *
 * Covers:
 * 1. `stories.experience_owner_id` and `stories.paraphrase_of_story_id` exist (service role)
 * 2. Default is NULL — existing stories unaffected
 * 3. Authenticated author can INSERT a story with `experience_owner_id` set (RLS still admits it)
 * 4. Immutability pin: BEFORE UPDATE trigger rejects changing `experience_owner_id` once set
 * 5. `p1030_is_own_experience()` is not directly executable by anon/authenticated (REVOKE EXECUTE)
 *
 * Does NOT test AD-3/AD-4 trigger *behavior* (calibration/ears exclusion) — see
 * p1030-calibration-exclusion.spec.ts for those, which need seeded story_verifications rows.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestStory } from '../helpers/test-story';

test.describe('P1030: Migration — experience_owner_id / paraphrase_of_story_id', () => {
  let author: TestUser;
  let experienceOwner: TestUser;
  const createdStoryIds: string[] = [];

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P1030 Migration Author' });
    experienceOwner = await createTestUser({ name: 'P1030 Migration Owner' });
  });

  test.afterAll(async () => {
    for (const id of createdStoryIds) {
      await supabaseAdmin.from('stories').delete().eq('id', id);
    }
    if (author) await deleteTestUser(author.id);
    if (experienceOwner) await deleteTestUser(experienceOwner.id);
  });

  // ── 1. Schema check: both columns exist (service role) ──────────────────
  test('experience_owner_id and paraphrase_of_story_id exist on stories', async () => {
    const { error } = await supabaseAdmin
      .from('stories')
      .select('experience_owner_id, paraphrase_of_story_id')
      .limit(1);

    expect(
      error,
      'Migration not applied: experience_owner_id/paraphrase_of_story_id missing from stories. Run: supabase db push'
    ).toBeNull();
  });

  // ── 2. Default is NULL — existing rows/inserts unaffected ───────────────
  test('a story created without experience_owner_id defaults to NULL (author == experience owner)', async () => {
    const story = await createTestStory(author.id, { title: `P1030 default ${Date.now()}` });
    createdStoryIds.push(story.id);

    const { data, error } = await supabaseAdmin
      .from('stories')
      .select('experience_owner_id, paraphrase_of_story_id')
      .eq('id', story.id)
      .single();

    expect(error).toBeNull();
    expect(data?.experience_owner_id).toBeNull();
    expect(data?.paraphrase_of_story_id).toBeNull();
  });

  // ── 3. RLS: authenticated author can INSERT a reverse story ─────────────
  test('authenticated author can set experience_owner_id at insert time (RLS unaffected)', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: author.email,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();

    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } } }
    );

    const { data, error } = await userClient
      .from('stories')
      .insert({
        title: `P1030 reverse ${Date.now()}`,
        content: 'Reverse story RLS insert test',
        author_id: author.id,
        visibility: 'private',
        experience_owner_id: experienceOwner.id,
      })
      .select('id, experience_owner_id')
      .single();

    expect(error, `RLS blocked reverse-story insert: ${error?.message}`).toBeNull();
    expect(data?.experience_owner_id).toBe(experienceOwner.id);
    if (data?.id) createdStoryIds.push(data.id);
  });

  // ── 4. Immutability pin: experience_owner_id cannot change once set ─────
  test.describe('Immutability pin (AD-2)', () => {
    let pinnedStoryId: string;

    test.beforeAll(async () => {
      const story = await createTestStory(author.id, { title: `P1030 pinned ${Date.now()}` });
      pinnedStoryId = story.id;
      createdStoryIds.push(pinnedStoryId);

      const { error } = await supabaseAdmin
        .from('stories')
        .update({ experience_owner_id: experienceOwner.id })
        .eq('id', pinnedStoryId);
      expect(error).toBeNull();
    });

    test('service role UPDATE attempting to change an already-set experience_owner_id is rejected', async () => {
      const otherOwner = await createTestUser({ name: 'P1030 Other Owner' });
      try {
        const { error } = await supabaseAdmin
          .from('stories')
          .update({ experience_owner_id: otherOwner.id })
          .eq('id', pinnedStoryId);

        // The BEFORE UPDATE trigger must raise — a silent no-op UPDATE would
        // pass this test vacuously, so also assert the value did not change.
        expect(error, 'Immutability trigger did not fire — experience_owner_id changed after being set').not.toBeNull();

        const { data: after } = await supabaseAdmin
          .from('stories')
          .select('experience_owner_id')
          .eq('id', pinnedStoryId)
          .single();
        expect(after?.experience_owner_id).toBe(experienceOwner.id);
      } finally {
        await deleteTestUser(otherOwner.id);
      }
    });

    test('setting experience_owner_id back to NULL after it was set is also rejected (tamper vector closed both directions)', async () => {
      const { error } = await supabaseAdmin
        .from('stories')
        .update({ experience_owner_id: null })
        .eq('id', pinnedStoryId);

      expect(error, 'Immutability trigger did not fire on NULL-out attempt').not.toBeNull();
    });

    test('updating an unrelated column on the same row still succeeds (pin is column-scoped, not row-locking)', async () => {
      const { error } = await supabaseAdmin
        .from('stories')
        .update({ content: 'Updated content, unrelated to the pin' })
        .eq('id', pinnedStoryId);

      expect(error).toBeNull();
    });
  });

  // ── 5. Helper function is not directly callable by client roles ─────────
  test('p1030_is_own_experience() is not executable by anon/authenticated (REVOKE EXECUTE)', async () => {
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email: author.email,
      password: TEST_PASSWORD,
    });
    expect(error).toBeNull();

    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } } }
    );

    const { error: rpcError } = await userClient.rpc('p1030_is_own_experience', {
      p_story_id: '00000000-0000-0000-0000-000000000000',
      p_listener_id: author.id,
    });

    // Expect a permission-denied class error, not a clean boolean result.
    expect(rpcError, 'p1030_is_own_experience is callable by authenticated — REVOKE EXECUTE missing').not.toBeNull();
  });
});
