/**
 * @file p1030-reverse-story-letter-ui.spec.ts
 * @description P1030 AD-5/AD-6: reading-view UI for reverse stories.
 *
 * Exact strings copied verbatim from the spec's UI Contract table:
 * - Attribution block: "⟲ About your experience — Written by the agent, about you"
 * - Experience-owner question: "How well do you believe this story represents your intended meaning?"
 * - Normal-letter question: "How well do you believe you understand {firstName}'s intended meaning behind their story?"
 *
 * Regression requirement (Done-When): a normal (non-reverse) letter must show
 * NEITHER the attribution block NOR the changed question — asserted as a negative
 * check in its own test, not just omitted.
 *
 * point_config.reverseStory is set on letter_story_snapshots by the AD-5 trigger when
 * the snapshotted story has experience_owner_id set and different from author_id — this
 * test seeds that condition directly via the two building blocks (create story with
 * experience_owner_id, then snapshot it) rather than asserting the trigger itself
 * (covered by the migration test's schema check + AD-3/AD-4 trigger tests for the sibling
 * triggers built on the same pattern).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  createTestPrediction,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

const ATTRIBUTION_BLOCK_TEXT = '⟲ About your experience — Written by the agent, about you';
const EXPERIENCE_OWNER_QUESTION = 'How well do you believe this story represents your intended meaning?';

test.describe('P1030: Reverse story — reading view UI', () => {
  test.describe.configure({ timeout: 60000 });

  let agentAuthor: TestUser;
  let founder: TestUser;
  let normalSender: TestUser;

  test.beforeAll(async () => {
    agentAuthor = await createTestUser({ name: "P1030 UI Slava's Agent" });
    founder = await createTestUser({ name: 'P1030 UI Founder' });
    normalSender = await createTestUser({ name: 'P1030 UI Normal Sender' });
  });

  test.afterAll(async () => {
    if (agentAuthor) await deleteTestUser(agentAuthor.id);
    if (founder) await deleteTestUser(founder.id);
    if (normalSender) await deleteTestUser(normalSender.id);
  });

  test.describe('Reverse story — attribution block + changed question shown', () => {
    let storyId: string;
    let pointId: string;
    let docId: string;
    let letterId: string;
    let deliveryId: string;

    test.beforeAll(async () => {
      const story = await createTestStory(agentAuthor.id, {
        title: `P1030 UI reverse story ${Date.now()}`,
        visibility: 'private',
      });
      storyId = story.id;
      await supabaseAdmin.from('stories').update({ experience_owner_id: founder.id }).eq('id', storyId);

      const point = await createTestPoint(agentAuthor.id, storyId);
      pointId = point.id;

      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ owner_id: agentAuthor.id, title: 'P1030 UI reverse doc', visibility: 'private' })
        .select('id')
        .single();
      docId = doc!.id;
      await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });

      const letter = await createTestLetter(agentAuthor.id, docId, { mode: 'one-to-one' });
      letterId = letter.id;

      const { data: version } = await supabaseAdmin
        .from('story_versions')
        .select('id')
        .eq('story_id', storyId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

      // Simulates the AD-5 snapshot trigger's effect directly — the trigger itself is
      // schema/behavior verified in the migration + calibration-exclusion suites.
      await createTestStorySnapshot(letterId, storyId, version!.id, {
        pointConfig: { reverseStory: true },
      });

      await createTestPrediction(letterId, storyId, 7);

      const delivery = await createTestDelivery(letterId, { receiverProfileId: founder.id });
      deliveryId = delivery.id;

      await sealTestLetter(letterId);
    });

    test.afterAll(async () => {
      await deleteTestLetter(letterId);
      await deleteTestPoint(pointId);
      await deleteTestStory(storyId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    });

    test('page loads without console errors', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      await setTestSession(page, founder.email);
      await page.goto(`/letter/${deliveryId}`);
      await page.waitForLoadState('networkidle');
      expect(consoleErrors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
    });

    test('attribution block is visible above the story text', async ({ page }) => {
      await setTestSession(page, founder.email);
      await page.goto(`/letter/${deliveryId}`);
      await page.getByRole('button', { name: /open the letter/i }).click();

      await expect(page.getByText(ATTRIBUTION_BLOCK_TEXT)).toBeVisible();
    });

    test('rating question reads the experience-owner string verbatim', async ({ page }) => {
      await setTestSession(page, founder.email);
      await page.goto(`/letter/${deliveryId}`);
      await page.getByRole('button', { name: /open the letter/i }).click();

      await expect(page.getByText(EXPERIENCE_OWNER_QUESTION)).toBeVisible();
    });

    test('founder can submit a rating; listener_rating is written and speaker_rating is nulled on read-back', async ({ page }) => {
      await setTestSession(page, founder.email);
      await page.goto(`/letter/${deliveryId}`);
      await page.getByRole('button', { name: /open the letter/i }).click();
      await page.getByText(EXPERIENCE_OWNER_QUESTION).waitFor();

      // Understanding rating uses the existing 0-10 dot picker (ComprehensionRatingCard) —
      // select rating 9 to prove the founder's real number lands in listener_rating.
      await page.getByRole('button', { name: '9', exact: true }).click();
      await page.getByRole('button', { name: /submit|continue/i }).click();

      await expect
        .poll(async () => {
          const { data } = await supabaseAdmin
            .from('story_verifications')
            .select('listener_id, speaker_id, listener_rating, speaker_rating')
            .eq('story_id', storyId)
            .eq('listener_id', founder.id)
            .maybeSingle();
          return data;
        })
        .toMatchObject({
          listener_id: founder.id,
          speaker_id: agentAuthor.id,
          listener_rating: 9,
          speaker_rating: null,
        });
    });
  });

  test.describe('REGRESSION — normal (non-reverse) letter shows neither block nor changed question', () => {
    let storyId: string;
    let pointId: string;
    let docId: string;
    let letterId: string;
    let deliveryId: string;

    test.beforeAll(async () => {
      const story = await createTestStory(normalSender.id, {
        title: `P1030 UI normal story ${Date.now()}`,
        visibility: 'private',
      });
      storyId = story.id; // experience_owner_id left NULL — ordinary story

      const point = await createTestPoint(normalSender.id, storyId);
      pointId = point.id;

      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ owner_id: normalSender.id, title: 'P1030 UI normal doc', visibility: 'private' })
        .select('id')
        .single();
      docId = doc!.id;
      await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });

      const letter = await createTestLetter(normalSender.id, docId, { mode: 'one-to-one' });
      letterId = letter.id;

      const { data: version } = await supabaseAdmin
        .from('story_versions')
        .select('id')
        .eq('story_id', storyId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

      await createTestStorySnapshot(letterId, storyId, version!.id, { pointConfig: {} });
      await createTestPrediction(letterId, storyId, 6);

      const delivery = await createTestDelivery(letterId, { receiverProfileId: founder.id });
      deliveryId = delivery.id;

      await sealTestLetter(letterId);
    });

    test.afterAll(async () => {
      await deleteTestLetter(letterId);
      await deleteTestPoint(pointId);
      await deleteTestStory(storyId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    });

    test('neither the attribution block nor the reverse-story question string appears', async ({ page }) => {
      await setTestSession(page, founder.email);
      await page.goto(`/letter/${deliveryId}`);
      await page.getByRole('button', { name: /open the letter/i }).click();

      await expect(page.getByText(ATTRIBUTION_BLOCK_TEXT)).toHaveCount(0);
      await expect(page.getByText(EXPERIENCE_OWNER_QUESTION)).toHaveCount(0);

      // The existing unchanged normal-letter question template must still render —
      // partial match since it interpolates {firstName}.
      await expect(page.getByText(/intended meaning behind their story\?/i)).toBeVisible();
    });
  });
});
