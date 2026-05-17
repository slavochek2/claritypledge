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

  test.beforeEach(async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${letterId}/overview`);
    await page.waitForLoadState('networkidle');
  });

  test('hidden (per-point flag) point is NOT a column header', async ({ page }) => {
    const visibleHeader = page.locator('th').filter({ hasText: 'P843VisiblePointText' });
    await expect(visibleHeader).toHaveCount(1);

    const hiddenPerPointHeader = page.locator('th').filter({ hasText: 'P843HiddenPerPointText' });
    await expect(hiddenPerPointHeader).toHaveCount(0);
  });

  test('hidden (top-level array) point is NOT a column header', async ({ page }) => {
    const hiddenTopHeader = page.locator('th').filter({ hasText: 'P843HiddenTopLevelText' });
    await expect(hiddenTopHeader).toHaveCount(0);
  });

  test('superseded point IS still a column header (recipient parity — snapshot freezes at seal)', async ({ page }) => {
    // P843 revert (migration 20260517130000): the sender's overview must show the
    // same point set each recipient saw on their reading page. Recipient view
    // freezes at seal time and does not honor live `points.superseded_by` — so
    // neither should the sender's overview.
    const supersededHeader = page.locator('th').filter({ hasText: 'P843SupersededPointText' });
    await expect(supersededHeader).toHaveCount(1);
  });

  test('cohort table renders two point columns (visible + superseded; both hidden points filtered)', async ({ page }) => {
    // Visible + superseded are both rendered (both were delivered to the recipient).
    // The two hidden points (per-point flag + top-level array) are filtered because
    // hidden is author intent at seal time, baked into the snapshot.
    const pointHeaders = page.locator('th').filter({ hasText: /^P843/ });
    await expect(pointHeaders).toHaveCount(2);
  });

  test('recipient cell renders avatar + full name', async ({ page }) => {
    const recipientCell = page.locator('[data-testid="cohort-recipient-cell"]').first();
    await expect(recipientCell).toBeVisible({ timeout: 10000 });

    // Strict: PersonAvatar wrapper must be inside the recipient cell.
    const avatar = recipientCell.locator('[data-testid="person-avatar"]');
    await expect(avatar).toHaveCount(1);

    await expect(recipientCell).toContainText('P843 Receiver');
  });

  test('letter overview header has author block with avatar + name', async ({ page }) => {
    const authorBlock = page.locator('[data-testid="letter-author-block"]');
    await expect(authorBlock).toBeVisible({ timeout: 10000 });
    await expect(authorBlock).toContainText('P843 Sender');

    const avatar = authorBlock.locator('[data-testid="person-avatar"]');
    await expect(avatar).toHaveCount(1);
  });
});
