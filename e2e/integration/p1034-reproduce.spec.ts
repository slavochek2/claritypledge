/**
 * @file p1034-reproduce.spec.ts
 * @description Canary for P1034: the story_points INSERT RLS policy binds the
 * referenced STORY to the caller, but never the row's own author_id column. A
 * user who owns any story can insert a story_points link row attributing the
 * link to a DIFFERENT profile.
 *
 * Root cause: 20260325120000_p586_visibility_privacy_foundation.sql STEP 15:
 *
 *   CREATE POLICY "Story authors can link points"
 *     ON story_points FOR INSERT WITH CHECK (
 *       EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())
 *     );
 *
 * story_points.author_id is a real, independent authorship fact (NOT NULL +
 * UNIQUE(author_id, point_id) since P465) — not derived from the story join.
 * Same bug class as P1032, on a third table its spec did not cover.
 *
 * Test 1 MUST FAIL until the fix adds `author_id = auth.uid()` to the WITH CHECK.
 * Tests 2 and 3 must pass both before AND after the fix — 3 in particular guards
 * against a fix that REPLACES the story-ownership EXISTS instead of adding to it.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import {
  createTestUser,
  generateTestEmail,
  deleteTestUser,
  TEST_PASSWORD,
  type TestUser,
} from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signInAs(user: TestUser) {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: user.email,
    password: TEST_PASSWORD,
  });
  expect(error, `Sign-in failed for ${user.email}: ${error?.message}`).toBeNull();
  const client = makeUserClient(data!.session!.access_token);
  await supabaseAdmin.auth.signOut();
  return client;
}

/**
 * Fixtures are created with the service role on purpose: this canary tests the
 * story_points INSERT policy, so the stories/points setup must not itself be
 * subject to the policies under test.
 *
 * Both story and point are 'public' — the p586 cross-visibility trigger only
 * rejects (public story + private point), so it cannot mask an RLS result here.
 */
test.describe('P1034: story_points INSERT — author_id impersonation', () => {
  let attacker: TestUser;
  let victim: TestUser;
  let attackerStoryId: string;
  let victimStoryId: string;
  const pointIds: string[] = [];
  const storyIds: string[] = [];

  async function createPoint(statement: string, validatorId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('points')
      .insert({ statement, first_validator_id: validatorId, visibility: 'public' })
      .select('id')
      .single();
    expect(error, `Fixture point insert failed: ${error?.message}`).toBeNull();
    pointIds.push(data!.id);
    return data!.id;
  }

  async function createStory(authorId: string, content: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('stories')
      .insert({ author_id: authorId, content, visibility: 'public' })
      .select('id')
      .single();
    expect(error, `Fixture story insert failed: ${error?.message}`).toBeNull();
    storyIds.push(data!.id);
    return data!.id;
  }

  test.beforeAll(async () => {
    attacker = await createTestUser({ email: generateTestEmail(), name: 'P1034 Attacker' });
    victim = await createTestUser({ email: generateTestEmail(), name: 'P1034 Victim' });

    attackerStoryId = await createStory(attacker.user.id, 'P1034 canary — attacker-owned story');
    victimStoryId = await createStory(victim.user.id, 'P1034 canary — victim-owned story');
  });

  test.afterAll(async () => {
    if (storyIds.length > 0) {
      await supabaseAdmin.from('story_points').delete().in('story_id', storyIds);
      await supabaseAdmin.from('stories').delete().in('id', storyIds);
    }
    if (pointIds.length > 0) {
      await supabaseAdmin.from('points').delete().in('id', pointIds);
    }
    await deleteTestUser(attacker.user.id);
    await deleteTestUser(victim.user.id);
  });

  // S1 — the reported bug. Fails until the fix lands.
  test('attacker cannot link a point attributing authorship to another profile', async () => {
    const pointId = await createPoint('P1034 canary — forged-authorship target', attacker.user.id);
    const attackerClient = await signInAs(attacker);

    const { data, error } = await attackerClient
      .from('story_points')
      .insert({
        story_id: attackerStoryId, // caller genuinely owns this story
        point_id: pointId,
        author_id: victim.user.id, // forged — the link is attributed to someone else
      })
      .select('story_id, point_id, author_id')
      .single();

    expect(
      error,
      `Expected RLS to reject a story_points INSERT naming another profile as author_id, ` +
        `but it succeeded. Row (story=${data?.story_id}, point=${data?.point_id}) was created ` +
        `with author_id=${data?.author_id} (victim), inserted by attacker=${attacker.user.id}. ` +
        `This also consumes the victim's UNIQUE(author_id, point_id) slot for that point.`
    ).not.toBeNull();
  });

  // S2 — positive control. The fix must not break legitimate linking.
  test('positive control: attacker can link a point to their own story as themselves', async () => {
    const pointId = await createPoint('P1034 canary — legitimate self-link', attacker.user.id);
    const attackerClient = await signInAs(attacker);

    const { data, error } = await attackerClient
      .from('story_points')
      .insert({
        story_id: attackerStoryId,
        point_id: pointId,
        author_id: attacker.user.id,
      })
      .select('story_id, point_id, author_id')
      .single();

    expect(error, `Legitimate self-authored link should succeed: ${error?.message}`).toBeNull();
    expect(data?.author_id).toBe(attacker.user.id);
  });

  // S3 — regression guard. Passes today; must still pass after the fix.
  // A fix that REPLACES the story-ownership EXISTS with `author_id = auth.uid()`
  // instead of ANDing them would let this through.
  test('attacker cannot link a point to a story they do not own', async () => {
    const pointId = await createPoint('P1034 canary — foreign-story link', attacker.user.id);
    const attackerClient = await signInAs(attacker);

    const { data, error } = await attackerClient
      .from('story_points')
      .insert({
        story_id: victimStoryId, // caller does NOT own this story
        point_id: pointId,
        author_id: attacker.user.id, // honest author_id — only the story is foreign
      })
      .select('story_id, point_id, author_id')
      .single();

    expect(
      error,
      `Expected RLS to reject a story_points INSERT against a story the caller does not own, ` +
        `but it succeeded. Row (story=${data?.story_id}, point=${data?.point_id}) created by ` +
        `attacker=${attacker.user.id} against victim story ${victimStoryId}.`
    ).not.toBeNull();
  });
});
