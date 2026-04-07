/**
 * @file p661-letter-preview.spec.ts
 * @description P661: Letter Preview route — `/letter/:docId/preview`
 *
 * Tests the preview route behavior:
 * 1. Preview loads for sender (doc owner)
 * 2. "THIS IS A PREVIEW" banner visible
 * 3. Story content rendered (/live components visible)
 * 4. Rating dots interactive but non-persistent (no DB writes)
 * 5. "Back to composition" link present
 *
 * Uses authenticated sender session.
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

test.describe('P661: Letter Preview — /letter/:docId/preview', () => {
  test.describe.configure({ timeout: 45000 });

  let sender: TestUser;
  let docId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P661 Preview Sender' });

    // Create a public doc with 2 stories
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P661 Preview Test Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    for (let i = 0; i < 2; i++) {
      const story = await createTestStory(sender.user.id, {
        title: `P661 Preview Story ${i + 1}`,
        content: `Preview story content ${i + 1}. This is a test.`,
      });
      storyIds.push(story.id);

      await supabaseAdmin
        .from('doc_stories')
        .insert({ doc_id: docId, story_id: story.id, position: i });
    }
  });

  test.afterAll(async () => {
    // Clean up letters that may have been created
    await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', docId);
    // Clean doc_stories
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    // Clean stories
    for (const id of storyIds) await deleteTestStory(id);
    // Clean doc
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    // Clean users
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 1. Preview route loads ─────────────────────────────────────────────

  test('preview route loads without error for sender (doc owner)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // Page should not show an error or 404
    await expect(page.locator('text=/not found|error|404/i')).not.toBeVisible({ timeout: 5000 });

    // Some content from the preview should be present
    await expect(
      page.locator('text=THIS IS A PREVIEW').or(
        page.locator('text=P661 Preview Story 1')
      )
    ).toBeVisible({ timeout: 10000 });
  });

  // ── 2. Preview banner ─────────────────────────────────────────────────

  test('preview shows "THIS IS A PREVIEW" banner', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });
  });

  // ── 3. Story content ──────────────────────────────────────────────────

  test('preview shows story content (/live components visible)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // Story content should be rendered
    await expect(
      page.locator('text=P661 Preview Story 1').or(
        page.locator('text=Preview story content 1')
      )
    ).toBeVisible({ timeout: 10000 });
  });

  // ── 4. Ratings are interactive but non-persistent ─────────────────────

  test('preview ratings are interactive but non-persistent', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // P673: Phase-based flow — navigate to rating phase
    // First advance through any position/story phases
    for (let attempt = 0; attempt < 5; attempt++) {
      // Try clicking position buttons (agree/disagree/unsure) then Submit
      const positionBtn = page.locator('button').filter({ hasText: /agree|disagree|unsure/i }).first();
      if (await positionBtn.isVisible().catch(() => false)) {
        await positionBtn.click();
        const submitBtn = page.locator('button').filter({ hasText: /submit/i }).first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
        }
        await page.waitForTimeout(800);
        continue;
      }
      // Try clicking advance buttons (Continue)
      const advanceBtn = page.locator('button').filter({ hasText: /continue/i }).first();
      if (await advanceBtn.isVisible().catch(() => false)) {
        await advanceBtn.click();
        await page.waitForTimeout(500);
        continue;
      }
      // Check if rating buttons are visible
      const ratingButtons = page.locator('[data-testid*="rating"] button, [role="group"] button');
      if (await ratingButtons.first().isVisible().catch(() => false)) break;
      await page.waitForTimeout(300);
    }

    // Rating buttons should now be visible
    const ratingButtons = page.locator('[data-testid*="rating"] button, [role="group"] button');
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });

    // Click a rating — should not throw
    await ratingButtons.nth(5).click();

    // Verify no NEW letter_predictions rows were created by preview
    // Use count comparison — any row has a non-null id, so filter(p => !p.id) is vacuously true
    const { count: predCount } = await supabaseAdmin
      .from('letter_predictions')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', storyIds[0]);

    // Preview mode uses a synthetic delivery ID that doesn't exist as a real delivery,
    // so DB writes would fail at the FK constraint level. Count should be 0.
    expect(predCount ?? 0).toBe(0);
  });

  // ── 5. Back to composition link ───────────────────────────────────────

  test('preview has "Back to composition" link', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // "Back to composition" or similar navigation link
    const backLink = page.locator('text=/back to composition/i')
      .or(page.locator('a[href*="compose"]'))
      .or(page.locator('text=/back to letter/i'));
    await expect(backLink).toBeVisible({ timeout: 10000 });
  });
});
