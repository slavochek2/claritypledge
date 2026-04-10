/**
 * @file p682-smoke.spec.ts
 * @description P682 Smoke: letter compose page loads for private and public docs.
 *
 * Fast regression — catches React boot errors before running the full E2E suite.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';

test.describe('P682 Smoke — Letter Compose Page', () => {
  test.describe.configure({ timeout: 30000 });

  let user: TestUser;
  let privateDocId: string;
  let publicDocId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P682 Smoke User' });

    const { data: privDoc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: user.user.id, title: 'P682 Smoke Private', visibility: 'private' })
      .select('id')
      .single();
    if (!privDoc) throw new Error('Failed to create private doc');
    privateDocId = privDoc.id;

    const { data: pubDoc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: user.user.id, title: 'P682 Smoke Public', visibility: 'public' })
      .select('id')
      .single();
    if (!pubDoc) throw new Error('Failed to create public doc');
    publicDocId = pubDoc.id;

    const story = await createTestStory(user.user.id, {
      title: 'P682 Smoke Story',
      content: 'Smoke test story.',
    });
    storyIds.push(story.id);
    await supabaseAdmin.from('doc_stories').insert([
      { doc_id: privateDocId, story_id: story.id, position: 0 },
      { doc_id: publicDocId, story_id: story.id, position: 0 },
    ]);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', privateDocId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', publicDocId);
    for (const id of storyIds) await deleteTestStory(id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', privateDocId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', publicDocId);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('private doc compose page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('third-party')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('public doc compose page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto(`/letter/${publicDocId}/compose`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('third-party')
    );
    expect(realErrors).toHaveLength(0);
  });
});
