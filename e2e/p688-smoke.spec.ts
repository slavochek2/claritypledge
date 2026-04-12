/**
 * @file p688-smoke.spec.ts
 * @description P688 Smoke — fast boot checks for letters surfaces.
 *
 * Tests:
 * 1. /letters page boots with no console errors (authed test user)
 * 2. Compose page (/letter/:docId/compose) boots with no console errors
 * 3. Sent tab renders at least one sealed letter card without errors
 *
 * Fast regression guard. Does not test P688 behavior directly — just confirms
 * the refactored surfaces don't throw on mount.
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
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P688 Smoke — Letters Surfaces', () => {
  test.describe.configure({ timeout: 30000 });

  let user: TestUser;
  let docId: string;
  let letterId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P688 Smoke User' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: user.user.id, title: 'P688 Smoke Doc', visibility: 'private' })
      .select('id')
      .single();
    if (!doc) throw new Error('P688 smoke: doc creation failed');
    docId = doc.id;

    const story = await createTestStory(user.user.id, {
      title: 'P688 Smoke Story',
      content: 'Smoke test story for P688.',
    });
    storyIds.push(story.id);

    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId,
      story_id: story.id,
      position: 0,
    });

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', story.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    const versionId = version?.id ?? story.id;

    const letter = await createTestLetter(user.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;
    await createTestStorySnapshot(letterId, story.id, versionId);
    await createTestDelivery(letterId, { receiverEmail: 'smoke-receiver@example.com' });
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    await deleteTestLetter(letterId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    for (const id of storyIds) await deleteTestStory(id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  // ── 1. /letters page boots clean ────────────────────────────────────────────

  test('/letters page boots without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('third-party')
    );
    expect(realErrors).toHaveLength(0);
  });

  // ── 2. Compose page boots clean ─────────────────────────────────────────────

  test('compose page (/letter/:docId/compose) boots without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('third-party')
    );
    expect(realErrors).toHaveLength(0);
  });

  // ── 3. Sent tab shows sealed letter card ────────────────────────────────────

  test('Sent tab renders at least one sealed letter card without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto('/letters?tab=sent');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Something went wrong')).not.toBeVisible();

    // At least one letter card — identified by the ⋯ Actions button
    const actionsBtn = page.getByRole('button', { name: /actions for/i }).first();
    await expect(actionsBtn).toBeVisible({ timeout: 10000 });

    const realErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('third-party')
    );
    expect(realErrors).toHaveLength(0);
  });
});
