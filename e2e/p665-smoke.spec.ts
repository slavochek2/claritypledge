/**
 * @file p665-smoke.spec.ts
 * @description P665: Smoke tests — fast regression detection for chrome-free letter routes.
 *
 * Verifies letter routes load without errors after the layout wrapper changes.
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

test.describe('P665 Smoke Tests', () => {
  test.describe.configure({ timeout: 30000 });

  let sender: TestUser;
  let docId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P665 Smoke Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P665 Smoke Test Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P665 Smoke Story',
      content: 'Smoke test story content.',
    });
    storyIds.push(story.id);

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: story.id, position: 0 });
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', docId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    for (const id of storyIds) await deleteTestStory(id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('preview route loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    // Page should not show 404 or error state
    await expect(page.locator('text=/not found|error|404/i')).not.toBeVisible({ timeout: 5000 });

    // Preview banner should be present
    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });

    // Filter out known benign console errors (e.g., Supabase realtime, favicon)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('realtime') && !e.includes('websocket')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('non-letter route still has top navigation (regression guard)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Letters list page should still have top nav (it is NOT chrome-free)
    const topNav = page.locator('nav').filter({ hasText: /Home/ }).first()
      .or(page.locator('a[href="/"]').first());
    await expect(topNav).toBeVisible({ timeout: 10000 });
  });
});
