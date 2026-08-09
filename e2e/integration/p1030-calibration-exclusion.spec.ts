/**
 * @file p1030-calibration-exclusion.spec.ts
 * @description P1030 AD-3 + AD-4: write-time trigger behavior on story_verifications
 * and update_profile_ears_count, run against TEST DB.
 *
 * AD-3: a BEFORE INSERT trigger on story_verifications nulls speaker_rating when the
 * story is the listener's own experience (p1030_is_own_experience). This test does NOT
 * attempt the spec's own prod before/after query pair (Done-When item; that is a UAT
 * scenario against prod data, not reproducible against a fresh test DB with no prior
 * calibration history) — it instead proves the trigger PREDICATE, which is what the prod
 * query pair depends on for correctness. If this predicate is wrong, the prod pair would
 * also be wrong for reasons no query comparison could surface (see epistemic gate 7b).
 *
 * AD-4: the same predicate, reused, gates ears_count / verification_session_count on the
 * listener side of update_profile_ears_count.
 *
 * Both tests include a CONTROL case with a NORMAL (non-reverse) verification, so a
 * trigger that fires unconditionally (predicate always true) fails the control rather
 * than passing vacuously.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

test.describe('P1030: Calibration + ears exclusion triggers (AD-3, AD-4)', () => {
  let listener: TestUser;
  let agentAuthor: TestUser;
  let normalSpeaker: TestUser;

  test.beforeAll(async () => {
    listener = await createTestUser({ name: 'P1030 Calib Listener' });
    agentAuthor = await createTestUser({ name: 'P1030 Calib Agent Author' });
    normalSpeaker = await createTestUser({ name: 'P1030 Calib Normal Speaker' });
  });

  test.afterAll(async () => {
    if (listener) await deleteTestUser(listener.id);
    if (agentAuthor) await deleteTestUser(agentAuthor.id);
    if (normalSpeaker) await deleteTestUser(normalSpeaker.id);
  });

  test.describe('AD-3: speaker_rating nulled on reverse-story verifications', () => {
    let reverseStoryId: string;
    let normalStoryId: string;

    test.beforeAll(async () => {
      const reverse = await createTestStory(agentAuthor.id, {
        title: `P1030 reverse calib ${Date.now()}`,
        visibility: 'private',
      });
      reverseStoryId = reverse.id;
      const { error: setOwnerErr } = await supabaseAdmin
        .from('stories')
        .update({ experience_owner_id: listener.id })
        .eq('id', reverseStoryId);
      expect(setOwnerErr).toBeNull();

      const normal = await createTestStory(normalSpeaker.id, {
        title: `P1030 normal calib ${Date.now()}`,
        visibility: 'private',
      });
      normalStoryId = normal.id;
    });

    test.afterAll(async () => {
      await supabaseAdmin.from('story_verifications').delete().eq('story_id', reverseStoryId);
      await supabaseAdmin.from('story_verifications').delete().eq('story_id', normalStoryId);
      await deleteTestStory(reverseStoryId);
      await deleteTestStory(normalStoryId);
    });

    test('reverse story: inserting a verification with a non-null speaker_rating gets it nulled by the trigger', async () => {
      const { data, error } = await supabaseAdmin
        .from('story_verifications')
        .insert({
          story_id: reverseStoryId,
          listener_id: listener.id,
          speaker_id: agentAuthor.id,
          source: 'letter',
          speaker_rating: 0, // the letter-path placeholder the trigger must override to NULL
          listener_rating: 9,
        })
        .select('speaker_rating, listener_rating, accuracy_achieved')
        .single();

      expect(error).toBeNull();
      expect(data?.speaker_rating).toBeNull();
      expect(data?.listener_rating).toBe(9); // untouched — the founder's real number
      expect(data?.accuracy_achieved).toBeNull(); // generated column follows speaker_rating
    });

    test('CONTROL — normal (non-reverse) story: speaker_rating is NOT nulled', async () => {
      const { data, error } = await supabaseAdmin
        .from('story_verifications')
        .insert({
          story_id: normalStoryId,
          listener_id: listener.id,
          speaker_id: normalSpeaker.id,
          source: 'letter',
          speaker_rating: 0,
          listener_rating: 7,
        })
        .select('speaker_rating, listener_rating')
        .single();

      expect(error).toBeNull();
      // Proves the trigger predicate discriminates — not "always nulls speaker_rating".
      expect(data?.speaker_rating).toBe(0);
      expect(data?.listener_rating).toBe(7);
    });

    test('reverse-story row is excluded from the listener eligibility filter both calibration surfaces share', async () => {
      const { data, error } = await supabaseAdmin
        .from('story_verifications')
        .select('story_id')
        .eq('listener_id', listener.id)
        .not('speaker_rating', 'is', null)
        .not('listener_rating', 'is', null);

      expect(error).toBeNull();
      const storyIds = (data ?? []).map((r) => r.story_id);
      expect(storyIds).not.toContain(reverseStoryId);
      expect(storyIds).toContain(normalStoryId);
    });
  });

  test.describe('AD-4: ears_count / verification_session_count exclusion', () => {
    let reverseStoryId: string;
    let normalStoryId: string;
    let earsListener: TestUser;

    test.beforeAll(async () => {
      earsListener = await createTestUser({ name: 'P1030 Ears Listener' });

      const reverse = await createTestStory(agentAuthor.id, {
        title: `P1030 reverse ears ${Date.now()}`,
        visibility: 'private',
      });
      reverseStoryId = reverse.id;
      await supabaseAdmin.from('stories').update({ experience_owner_id: earsListener.id }).eq('id', reverseStoryId);

      const normal = await createTestStory(normalSpeaker.id, {
        title: `P1030 normal ears ${Date.now()}`,
        visibility: 'private',
      });
      normalStoryId = normal.id;
    });

    test.afterAll(async () => {
      await supabaseAdmin.from('story_verifications').delete().eq('listener_id', earsListener.id);
      await deleteTestStory(reverseStoryId);
      await deleteTestStory(normalStoryId);
      if (earsListener) await deleteTestUser(earsListener.id);
    });

    test('rating a reverse story does not move the listener ears_count / verification_session_count', async () => {
      const { data: before } = await supabaseAdmin
        .from('profiles')
        .select('ears_count, verification_session_count')
        .eq('id', earsListener.id)
        .single();

      await supabaseAdmin.from('story_verifications').insert({
        story_id: reverseStoryId,
        listener_id: earsListener.id,
        speaker_id: agentAuthor.id,
        source: 'letter',
        speaker_rating: 0,
        listener_rating: 8,
      });

      const { data: after } = await supabaseAdmin
        .from('profiles')
        .select('ears_count, verification_session_count')
        .eq('id', earsListener.id)
        .single();

      expect(after?.ears_count).toBe(before?.ears_count ?? 0);
      expect(after?.verification_session_count).toBe(before?.verification_session_count ?? 0);
    });

    test('CONTROL — rating a normal story DOES move ears_count / verification_session_count', async () => {
      const { data: before } = await supabaseAdmin
        .from('profiles')
        .select('ears_count, verification_session_count')
        .eq('id', earsListener.id)
        .single();

      await supabaseAdmin.from('story_verifications').insert({
        story_id: normalStoryId,
        listener_id: earsListener.id,
        speaker_id: normalSpeaker.id,
        source: 'letter',
        speaker_rating: 6,
        listener_rating: 7,
      });

      const { data: after } = await supabaseAdmin
        .from('profiles')
        .select('ears_count, verification_session_count')
        .eq('id', earsListener.id)
        .single();

      expect(after?.ears_count).toBe((before?.ears_count ?? 0) + 1);
      expect(after?.verification_session_count).toBe((before?.verification_session_count ?? 0) + 1);
    });

    test("the agent's own speaker-side verification_session_count DOES increment for a reverse-story rating (AD-4 accepted, documented consequence)", async () => {
      const { data: before } = await supabaseAdmin
        .from('profiles')
        .select('verification_session_count')
        .eq('id', agentAuthor.id)
        .single();

      const story2 = await createTestStory(agentAuthor.id, {
        title: `P1030 reverse ears speaker-side ${Date.now()}`,
        visibility: 'private',
      });
      await supabaseAdmin.from('stories').update({ experience_owner_id: earsListener.id }).eq('id', story2.id);

      await supabaseAdmin.from('story_verifications').insert({
        story_id: story2.id,
        listener_id: earsListener.id,
        speaker_id: agentAuthor.id,
        source: 'letter',
        speaker_rating: 0,
        listener_rating: 5,
      });

      const { data: after } = await supabaseAdmin
        .from('profiles')
        .select('verification_session_count')
        .eq('id', agentAuthor.id)
        .single();

      expect(after?.verification_session_count).toBe((before?.verification_session_count ?? 0) + 1);

      await supabaseAdmin.from('story_verifications').delete().eq('story_id', story2.id);
      await deleteTestStory(story2.id);
    });
  });
});
