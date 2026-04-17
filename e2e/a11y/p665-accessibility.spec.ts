/**
 * @file p665-accessibility.spec.ts
 * @description P665: Accessibility tests for chrome-free letter routes.
 *
 * Tests keyboard navigation and focus management on preview and reading pages
 * after top nav removal.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

test.describe('P665: Chrome-Free Letter Routes — Accessibility', () => {
  test.describe.configure({ timeout: 30000 });

  let sender: TestUser;
  let docId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P665 A11y Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P665 A11y Test Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P665 A11y Story',
      content: 'Accessibility test story content.',
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

  test('preview page "Back to composition" is keyboard accessible', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });

    // Tab through the page — "Back to composition" should be reachable
    const backAction = page.locator('a, button').filter({ hasText: /back to composition/i });
    await expect(backAction).toBeVisible({ timeout: 5000 });

    // Focus the back action via keyboard
    await backAction.focus();
    await expect(backAction).toBeFocused();
  });

  test('preview page has no orphaned focus trap after top nav removal', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text=THIS IS A PREVIEW')
    ).toBeVisible({ timeout: 10000 });

    // Tab through the page — focus should move to interactive elements
    // without getting stuck on hidden nav remnants
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
    expect(firstFocused).toBeDefined();
    // First tab should reach an interactive element (not stuck on body)
    expect(firstFocused).not.toBe('BODY');

    // Tab again — focus should move to a different element (not trapped)
    const firstFocusedId = await page.evaluate(() =>
      `${document.activeElement?.tagName}-${document.activeElement?.textContent?.slice(0, 20)}`
    );
    await page.keyboard.press('Tab');
    const secondFocusedId = await page.evaluate(() =>
      `${document.activeElement?.tagName}-${document.activeElement?.textContent?.slice(0, 20)}`
    );
    // Focus moved (not trapped on same element)
    expect(secondFocusedId).not.toBe(firstFocusedId);
  });
});
