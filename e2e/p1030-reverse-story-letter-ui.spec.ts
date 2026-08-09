/**
 * @file p1030-reverse-story-letter-ui.spec.ts
 * @description P1030 Decision 6: the reading-view strings for a reverse story.
 *
 * A reverse letter differs from a normal one by exactly two sentences (UI Contract):
 *   - the rating question, at story-rate
 *   - the CalibrationVerdict body line, at story-revealed — the screen where the number is
 *     interpreted, which is why it is in scope even though the attribution block was cut
 *     (Resolved Decisions #16 / #19)
 *
 * There is no attribution block, no tag and no icon in this design, and no schema behind it: the
 * marker is `point_config.reverseStory`, written onto the sealed snapshot by
 * `/align-create-letter` with the service role (Decision 5). This suite seeds the snapshot in
 * exactly that shape — the same document the skill produces — so what it exercises is the read
 * side. The write side and its policy boundary are covered by
 * `e2e/integration/p1030-snapshot-stamp.spec.ts`.
 *
 * Regression requirement (Done-When): a normal letter must show BOTH unchanged strings, asserted
 * positively and negatively, not merely omitted.
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

const EXPERIENCE_OWNER_QUESTION = 'How well do you believe this story represents your intended meaning?';
/** Partial matches: both reveal lines interpolate the sender's first name and the estimate. */
const REVERSE_REVEAL = /estimated you would rate their capture of your meaning at a/i;
const NORMAL_REVEAL = /estimated you understood their intended meaning at a/i;
const NORMAL_QUESTION = /intended meaning behind their story\?/i;

const PREDICTION = 7;
const READER_RATING = 9;

/**
 * The rating control renders buttons whose accessible name is `Rate N`, not `N`
 * (`src/app/components/partners/shared.tsx:42`). Selecting on the bare number matches nothing.
 */
const rateButton = (n: number) => ({ name: `Rate ${n}`, exact: true }) as const;

test.describe('P1030: Reverse story — reading view strings', () => {
  test.describe.configure({ timeout: 60000 });

  let agentAuthor: TestUser;
  let founder: TestUser;
  let normalSender: TestUser;

  test.beforeAll(async () => {
    agentAuthor = await createTestUser({ name: 'P1030 UI Clarity Agent' });
    founder = await createTestUser({ name: 'P1030 UI Founder' });
    normalSender = await createTestUser({ name: 'P1030 UI Normal Sender' });
  });

  test.afterAll(async () => {
    if (agentAuthor) await deleteTestUser(agentAuthor.id);
    if (founder) await deleteTestUser(founder.id);
    if (normalSender) await deleteTestUser(normalSender.id);
  });

  test.describe('Reverse story — changed question and changed reveal line', () => {
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

      // The document /align-create-letter leaves behind: a sealed snapshot carrying the marker.
      await createTestStorySnapshot(letterId, storyId, version!.id, {
        pointConfig: { reverseStory: true },
      });

      await createTestPrediction(letterId, storyId, PREDICTION);

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

    test('rating question reads the experience-owner string verbatim', async ({ page }) => {
      await setTestSession(page, founder.email);
      await page.goto(`/letter/${deliveryId}`);
      await page.getByRole('button', { name: /open the letter/i }).click();

      await expect(page.getByText(EXPERIENCE_OWNER_QUESTION)).toBeVisible();
      // The block was cut from this design — assert its absence so a re-add is a deliberate act.
      await expect(page.getByText(/About your experience/i)).toHaveCount(0);
    });

    test('after rating, the reveal line reads the reverse variant, not the comprehension one', async ({ page }) => {
      await setTestSession(page, founder.email);
      await page.goto(`/letter/${deliveryId}`);
      await page.getByRole('button', { name: /open the letter/i }).click();
      await page.getByText(EXPERIENCE_OWNER_QUESTION).waitFor();

      await page.getByRole('button', rateButton(READER_RATING)).click();
      await page.getByRole('button', { name: /submit|continue/i }).click();

      await expect(page.getByText(REVERSE_REVEAL)).toBeVisible();
      await expect(page.getByText(NORMAL_REVEAL)).toHaveCount(0);
    });

    test('founder can submit a rating; listener_rating is written with the agent as speaker', async ({ page }) => {
      await setTestSession(page, founder.email);
      await page.goto(`/letter/${deliveryId}`);
      await page.getByRole('button', { name: /open the letter/i }).click();
      await page.getByText(EXPERIENCE_OWNER_QUESTION).waitFor();

      await page.getByRole('button', rateButton(READER_RATING)).click();
      await page.getByRole('button', { name: /submit|continue/i }).click();

      await expect
        .poll(async () => {
          const { data } = await supabaseAdmin
            .from('story_verifications')
            .select('listener_id, speaker_id, listener_rating')
            .eq('story_id', storyId)
            .eq('listener_id', founder.id)
            .maybeSingle();
          return data;
        })
        .toMatchObject({
          listener_id: founder.id,
          speaker_id: agentAuthor.id,
          listener_rating: READER_RATING,
        });
    });
  });

  test.describe('REGRESSION — a normal letter shows both unchanged strings', () => {
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
      storyId = story.id;

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

      // No marker — an ordinary sealed snapshot.
      await createTestStorySnapshot(letterId, storyId, version!.id, { pointConfig: {} });
      await createTestPrediction(letterId, storyId, PREDICTION);

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

    test('the existing question and the existing reveal line both render, and neither reverse string appears', async ({ page }) => {
      await setTestSession(page, founder.email);
      await page.goto(`/letter/${deliveryId}`);
      await page.getByRole('button', { name: /open the letter/i }).click();

      await expect(page.getByText(NORMAL_QUESTION)).toBeVisible();
      await expect(page.getByText(EXPERIENCE_OWNER_QUESTION)).toHaveCount(0);

      await page.getByRole('button', rateButton(READER_RATING)).click();
      await page.getByRole('button', { name: /submit|continue/i }).click();

      await expect(page.getByText(NORMAL_REVEAL)).toBeVisible();
      await expect(page.getByText(REVERSE_REVEAL)).toHaveCount(0);
    });
  });
});
