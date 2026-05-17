/**
 * @file p843-letter-overview-filter-and-avatars.spec.ts
 * @description P843: Letter overview cohort table polish
 *
 * Verifies:
 *   - Hidden points (per-point `hidden: true`) are NOT rendered as columns
 *   - Hidden points (id in point_config.hidden top-level array) are NOT rendered as columns
 *   - Superseded points (points.superseded_by IS NOT NULL) are NOT rendered as columns
 *   - Per-point response cells reflect only the filtered visible points
 *   - Recipient row renders an avatar element (img or fallback initial circle) + full name
 *   - Letter overview header renders author block with avatar + name
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import {
  createFullTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P843: Letter overview — hidden/superseded filter + avatars', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let pointVisibleId: string;
  let pointHiddenPerPointId: string;
  let pointHiddenTopLevelId: string;
  let pointSupersededId: string;
  let pointSupersederId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P843 Sender' });
    receiver = await createTestUser({ name: 'P843 Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P843 Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P843 Story',
      content: 'P843 unique story text for filter testing',
    });
    storyId = story.id;

    const pVisible = await createTestPoint(sender.user.id, storyId, {
      statement: 'P843VisiblePointText',
    });
    const pHiddenPer = await createTestPoint(sender.user.id, storyId, {
      statement: 'P843HiddenPerPointText',
    });
    const pHiddenTop = await createTestPoint(sender.user.id, storyId, {
      statement: 'P843HiddenTopLevelText',
    });
    const pSuper = await createTestPoint(sender.user.id, storyId, {
      statement: 'P843SupersededPointText',
    });
    const pSuperseder = await createTestPoint(sender.user.id, storyId, {
      statement: 'P843SupersederPointText',
    });
    pointVisibleId = pVisible.id;
    pointHiddenPerPointId = pHiddenPer.id;
    pointHiddenTopLevelId = pHiddenTop.id;
    pointSupersededId = pSuper.id;
    pointSupersederId = pSuperseder.id;

    // Mark superseded point in `points` table
    await supabaseAdmin
      .from('points')
      .update({ superseded_by: pointSupersederId })
      .eq('id', pointSupersededId);

    const { data: v } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!v) throw new Error('Story version not found');

    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: v.id, prediction: 7, position: 0 }],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;

    // Override the auto-built point_config to include all 4 candidate points and
    // both filter shapes (per-point hidden + top-level hidden array).
    // pSuperseder is NOT in point_config (it's the replacement, not the snapshot point).
    const overriddenConfig = {
      storyTitle: 'P843 Story',
      storyText: 'P843 unique story text for filter testing',
      points: [
        { id: pointVisibleId, text: 'P843VisiblePointText', authorPosition: null },
        { id: pointHiddenPerPointId, text: 'P843HiddenPerPointText', authorPosition: null, hidden: true },
        { id: pointHiddenTopLevelId, text: 'P843HiddenTopLevelText', authorPosition: null },
        { id: pointSupersededId, text: 'P843SupersededPointText', authorPosition: null },
      ],
      hidden: [pointHiddenTopLevelId],
    };
    await supabaseAdmin
      .from('letter_story_snapshots')
      .update({ point_config: overriddenConfig })
      .eq('letter_id', letterId)
      .eq('story_id', storyId);

    // Receiver responds to visible point so the row has at least one position cell
    await supabaseAdmin.from('letter_point_responses').insert({
      delivery_id: deliveryId,
      point_id: pointVisibleId,
      position: 'agree',
    });
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'completed', completed_at: new Date().toISOString(), stories_rated: 1 })
      .eq('id', deliveryId);
  });

  test.afterAll(async () => {
    if (deliveryId) {
      await supabaseAdmin.from('letter_point_responses').delete().eq('delivery_id', deliveryId);
    }
    if (letterId) await deleteTestLetter(letterId);
    // Unset superseded_by before deleting points so cascade is clean
    if (pointSupersededId) {
      await supabaseAdmin.from('points').update({ superseded_by: null }).eq('id', pointSupersededId);
    }
    for (const id of [pointSupersederId, pointSupersededId, pointHiddenTopLevelId, pointHiddenPerPointId, pointVisibleId]) {
      if (id) await deleteTestPoint(id);
    }
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('hidden (per-point flag) point is NOT a column header', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const visibleHeader = page.locator('th').filter({ hasText: 'P843VisiblePointText' });
    await expect(visibleHeader).toHaveCount(1);

    const hiddenPerPointHeader = page.locator('th').filter({ hasText: 'P843HiddenPerPointText' });
    await expect(hiddenPerPointHeader).toHaveCount(0);
  });

  test('hidden (top-level array) point is NOT a column header', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const hiddenTopHeader = page.locator('th').filter({ hasText: 'P843HiddenTopLevelText' });
    await expect(hiddenTopHeader).toHaveCount(0);
  });

  test('superseded point is NOT a column header', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const supersededHeader = page.locator('th').filter({ hasText: 'P843SupersededPointText' });
    await expect(supersededHeader).toHaveCount(0);
  });

  test('cohort table renders exactly one point column (the visible point only)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    // Headers: Recipient, You → Them, P843VisiblePointText, (unnamed status col)
    // Only one point header should be present.
    const pointHeaders = page.locator('th').filter({ hasText: /^P843/ });
    await expect(pointHeaders).toHaveCount(1);
  });

  test('recipient cell renders avatar + full name', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const recipientCell = page.locator('[data-testid="cohort-recipient-cell"]').first();
    await expect(recipientCell).toBeVisible({ timeout: 10000 });

    // Avatar component renders either an <img> (with photoUrl) or a div with initials fallback.
    // Both contain at least one descendant element — assert avatar presence by checking
    // for an element with role=img OR an svg/img/initial-div sibling to the name link.
    const avatarSibling = recipientCell.locator('img, [role="img"], [aria-label]').first();
    // Avatar element should exist OR (fallback) the cell should contain a colored circle div.
    const fallbackDiv = recipientCell.locator('div.rounded-full, div[class*="rounded-full"]').first();
    const hasAvatarOrFallback =
      (await avatarSibling.count()) > 0 || (await fallbackDiv.count()) > 0;
    expect(hasAvatarOrFallback).toBe(true);

    // Full name should be present
    await expect(recipientCell).toContainText('P843 Receiver');
  });

  test('letter overview header has author block with avatar + name', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');

    const authorBlock = page.locator('[data-testid="letter-author-block"]');
    await expect(authorBlock).toBeVisible({ timeout: 10000 });
    await expect(authorBlock).toContainText('P843 Sender');

    // Avatar present (img or fallback initial circle)
    const avatar = authorBlock.locator('img, div.rounded-full, div[class*="rounded-full"]').first();
    await expect(avatar).toBeVisible({ timeout: 5000 });
  });
});
