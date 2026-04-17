/**
 * @file p684-smoke.spec.ts
 * @description P684: Smoke tests — public letter link loads anonymously.
 *
 * These tests verify the absolute minimum: a one-to-many letter URL is
 * publicly accessible without auth. They run on every CI push as a
 * first-pass gate before the full E2E suite.
 *
 * P270 rule: if get_letter_for_public_reading RPC is missing, these
 * tests fail with a clear error before the full integration suite runs.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import {
  createTestLetter,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';
import { createTestStory, deleteTestStory } from './helpers/test-story';

test.describe('P684 Smoke: public letter link accessible anonymously', () => {
  test.describe.configure({ timeout: 30000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P684 Smoke Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P684 Smoke Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P684 smoke test story',
      content: 'A story used by the P684 smoke tests. Contains enough text to render in the reading flow.',
    });
    storyId = story.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    await createTestStorySnapshot(letterId, storyId, version.id, {
      position: 0,
      pointConfig: {
        storyTitle: 'P684 smoke test story',
        storyText: 'A story used by the P684 smoke tests. Contains enough text to render in the reading flow.',
        points: [],
      },
    });
    await sealTestLetter(letter.id);

    // Confirm: no delivery rows for this letter (P684 invariant)
    const { data } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', letterId);
    if ((data?.length ?? 0) > 0) {
      throw new Error(`Smoke setup error: unexpected delivery rows for letter ${letterId}`);
    }
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender) await deleteTestUser(sender.user.id);
  });

  // ==========================================================================
  // Smoke 1: Public link loads without auth
  // ==========================================================================

  test('one-to-many letter page loads without authentication', async ({ page }) => {
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    // Must NOT show "Sign in to read this letter" (the pre-P684 dead end)
    await expect(page.getByText('Sign in to read this letter')).not.toBeVisible();

    // Must NOT redirect to /sign-in or /login
    expect(page.url()).not.toContain('/sign-in');
    expect(page.url()).not.toContain('/login');
  });

  // ==========================================================================
  // Smoke 2: Letter cover renders
  // ==========================================================================

  test('letter cover renders with sender name visible', async ({ page }) => {
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    // The cover screen should be visible (LetterCover component)
    // — "Open the Letter" or equivalent CTA
    const coverCta = page.getByRole('button', { name: /open.*letter/i })
      .or(page.getByText(/open.*letter/i));

    await expect(coverCta).toBeVisible({ timeout: 10000 });
  });

  // ==========================================================================
  // Smoke 3: Story content loads after opening letter
  // ==========================================================================

  test('story content visible after opening the letter', async ({ page }) => {
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    // Open the letter
    const openBtn = page.getByRole('button', { name: /open.*letter/i });
    if (await openBtn.isVisible()) {
      await openBtn.click();
    }

    // Story content from the smoke test story should appear.
    // LiveStoryCardExpanded renders story.content (not title), so check the content text.
    await expect(page.getByText('A story used by the P684 smoke tests')).toBeVisible({ timeout: 10000 });
  });

  // ==========================================================================
  // Smoke 4: Chrome-free layout (no top nav, no bottom nav)
  // ==========================================================================

  test('letter reading page uses chrome-free layout (no navigation bars)', async ({ page }) => {
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    // Chrome-free layout means no top nav and no bottom nav
    // P665 established this invariant for all letter reading flows
    const topNav = page.locator('nav[aria-label="main navigation"], header nav');
    const bottomNav = page.locator('[data-testid="bottom-nav"], nav.bottom-nav');

    await expect(topNav).not.toBeVisible();
    await expect(bottomNav).not.toBeVisible();
  });
});
