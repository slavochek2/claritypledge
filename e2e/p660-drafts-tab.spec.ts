/**
 * @file p660-drafts-tab.spec.ts
 * @description E2E tests for P660: Drafts tab behavior
 *
 * Tests:
 * - Drafts list (Artifacts > Yours) shows an open link and a Prepare letter action per row
 * - Opening a draft navigates to /letters/drafts/:id
 * - Prepare letter disabled when draft has 0 stories
 * - Draft detail has no letter tracking sections
 * - Back button labeled "Letters" returns to Drafts tab
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestStory } from './helpers/test-story';

test.describe('P660: Drafts Tab', () => {
  test.describe.configure({ timeout: 30000 });

  let user: TestUser;
  let docWithStoriesId: string;
  let docEmptyId: string;
  let storyId: string;

  test.beforeAll(async () => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    user = await createTestUser({ name: 'P660 Drafts Tab User' });

    // Create a doc with a story
    const { data: docWithStories } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'Drafts Tab Test Doc With Story', owner_id: user.user.id })
      .select('id')
      .single();
    docWithStoriesId = docWithStories!.id;

    const story = await createTestStory(user.user.id, {
      title: 'P660 Test Story',
      content: 'Story for drafts tab test',
      visibility: 'public',
    });
    storyId = story.id;

    // Link story to doc via story_snapshots or doc_stories
    // Create the doc-story link
    await supabaseAdmin
      .from('doc_stories')
      .insert({
        doc_id: docWithStoriesId,
        story_id: storyId,
        position: 0,
      });

    // Create an empty doc (0 stories)
    const { data: docEmpty } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'Drafts Tab Empty Doc', owner_id: user.user.id })
      .select('id')
      .single();
    docEmptyId = docEmpty!.id;
  });

  test.afterAll(async () => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    if (docEmptyId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docEmptyId);
    if (docWithStoriesId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docWithStoriesId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docWithStoriesId);
    }
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  // P1545: the Drafts tab is now Artifacts > Yours (Letters chip). A draft row has no [Edit] / [New Letter]
  // buttons: the row title is the link that opens the draft, and "Prepare letter" is the row's visible action.
  test('drafts list shows an open link and a "Prepare letter" action per draft row', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');

    const row = page.getByTestId('artifact-row').filter({ hasText: 'Drafts Tab Test Doc With Story' });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Opening the draft: the title link
    await expect(row.getByRole('link', { name: 'Drafts Tab Test Doc With Story' })).toBeVisible();

    // [New Letter] became the row's one visible action, "Prepare letter"; "…" holds Open first
    await expect(row.getByRole('button', { name: /Prepare letter/i })).toBeVisible();
    await row.getByRole('button', { name: /Actions for Drafts Tab Test Doc With Story/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Open' })).toBeVisible();
  });

  test('opening a draft navigates to /letters/drafts/:id', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: 'Drafts Tab Test Doc With Story' }).click();

    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/letters\/drafts\//);
  });

  test('"Prepare letter" is disabled when draft has 0 stories', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');

    const row = page.getByTestId('artifact-row').filter({ hasText: 'Drafts Tab Empty Doc' });
    await expect(row).toBeVisible({ timeout: 10000 });

    // The action should be disabled (aria-disabled) for docs with 0 stories
    await expect(row.getByRole('button', { name: /Prepare letter/i })).toHaveAttribute('aria-disabled', 'true');
  });

  test('draft detail page has no letter tracking sections', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/letters/drafts/${docWithStoriesId}`);
    await page.waitForLoadState('networkidle');
    // The draft page has rendered (otherwise every "not visible" below passes on a blank page)
    await expect(page.getByRole('button', { name: 'Prepare letter' })).toBeVisible({ timeout: 10000 });

    // Should NOT contain "Sent Letters" section
    await expect(page.getByText('Sent Letters')).not.toBeVisible();

    // Should NOT contain "Prepare a Letter" button
    await expect(page.getByText('Prepare a Letter')).not.toBeVisible();

    // Should NOT contain "Received Letters" section
    await expect(page.getByText('Received Letters')).not.toBeVisible();

    // Should NOT contain a draft-level share button. P1545: each story card carries its own "Share story"
    // control (StoryCardDetail), which is not letter sharing, so match the draft-level names only.
    await expect(page.getByRole('button', { name: /^Share( letter| doc| draft)?$/i })).toHaveCount(0);
  });

  test('back from a draft opened off the Drafts list returns to Artifacts > Letters > Drafts', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'Drafts Tab Test Doc With Story' }).click();
    await expect(page).toHaveURL(/\/letters\/drafts\//);

    // Back pops to where the author came from (the list), so it reads "Back"; only a cold arrival names "Letters"
    // (setTestSession lands on another page first, so a direct goto here is never cold).
    const backButton = page.getByRole('button', { name: /^go back$/i });
    await expect(backButton).toBeVisible();
    await backButton.click();
    await page.waitForLoadState('networkidle');

    // Should return to the Artifacts page: Letters tab, Drafts list
    await expect(page).toHaveURL(/\/artifacts\?tab=letters&list=drafts/);
    await expect(page.getByRole('tab', { name: 'Letters' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Drafts', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('[+ New] button creates a new draft', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');

    // Find the New letter button (P1545: was [+ New])
    const newButton = page.getByRole('button', { name: /^New letter$/i }).first();
    await expect(newButton).toBeVisible();
  });
});
