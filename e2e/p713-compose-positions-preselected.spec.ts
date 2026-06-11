/**
 * @file p713-compose-positions-preselected.spec.ts
 * @description P713 regression: compose flow must preselect author's existing point positions.
 *
 * Root cause: docsService.getDoc() fetches story_points but never joins point_positions,
 * so userPosition is always undefined on load.
 *
 * Canary: fails before fix (no "Your position:" text), passes after.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';

test.describe('P713: Compose flow preselects author positions', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P713 Sender' });

    // Public doc — skips receiver modal, goes straight to prediction walk
    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P713 Test Doc', visibility: 'public' })
      .select('id')
      .single();
    if (docError || !doc) throw new Error(`Doc creation failed: ${docError?.message}`);
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      content: 'P713 test story content.',
    });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, {
      statement: 'P713 test point statement.',
    });
    pointId = point.id;

    await linkStoryToPoint(storyId, pointId);

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    // Set sender's position on the point — this is what the compose flow should preselect
    await createTestPosition(pointId, sender.user.id, 'agree');
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await deleteTestPoint(pointId);
    await deleteTestStory(storyId);
    await deleteTestUser(sender.user.id);
  });

  test('position button shows "Your position:" for existing author position on compose load', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);

    // Wait for prediction walk to appear (public doc skips modal)
    await expect(page.getByText('How well do you believe readers will understand your intended meaning?')).toBeVisible({ timeout: 10000 });

    // The Agree group button should have aria-pressed="true" because the author's
    // position ('agree') is loaded from point_positions on compose open.
    // Before fix: aria-pressed="false" (userPosition never fetched)
    // After fix:  aria-pressed="true"  (userPosition populated from DB)
    await expect(page.getByTestId('agree-group')).toHaveAttribute('aria-pressed', 'true');
  });
});
