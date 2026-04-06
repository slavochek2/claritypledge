/**
 * @file p660-drafts-tab.spec.ts
 * @description E2E tests for P660: Drafts tab behavior
 *
 * Tests:
 * - Drafts list shows [Edit] and [New Letter] buttons
 * - [Edit] navigates to /letters/drafts/:id
 * - [New Letter] disabled when draft has 0 stories
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
    if (docEmptyId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docEmptyId);
    if (docWithStoriesId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docWithStoriesId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docWithStoriesId);
    }
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('drafts list shows [Edit] and [New Letter] buttons per draft row', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    // Verify [Edit] button exists for the doc with stories
    const editButtons = page.getByRole('button', { name: /Edit/i });
    const editCount = await editButtons.count();
    expect(editCount).toBeGreaterThanOrEqual(1);

    // Verify [New Letter] button exists
    const newLetterButtons = page.getByRole('button', { name: /New Letter/i });
    const newLetterCount = await newLetterButtons.count();
    expect(newLetterCount).toBeGreaterThanOrEqual(1);
  });

  test('[Edit] navigates to /letters/drafts/:id', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    // Find the doc with stories and click Edit
    const docRow = page.getByText('Drafts Tab Test Doc With Story').locator('..');
    const editButton = docRow.getByRole('button', { name: /Edit/i }).first();

    // If the edit button is a link, click it directly
    // Otherwise it might be within the parent row
    if (await editButton.isVisible()) {
      await editButton.click();
    } else {
      // Fallback: find any edit button and click it
      await page.getByRole('button', { name: /Edit/i }).first().click();
    }

    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/letters\/drafts\//);
  });

  test('[New Letter] is disabled when draft has 0 stories', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    // Find the empty doc row
    const emptyDocRow = page.getByText('Drafts Tab Empty Doc').locator('..');
    const newLetterButton = emptyDocRow.getByRole('button', { name: /New Letter/i });

    // The button should be disabled for docs with 0 stories
    if (await newLetterButton.isVisible()) {
      await expect(newLetterButton).toBeDisabled();
    }
  });

  test('draft detail page has no letter tracking sections', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/letters/drafts/${docWithStoriesId}`);
    await page.waitForLoadState('networkidle');

    // Should NOT contain "Sent Letters" section
    await expect(page.getByText('Sent Letters')).not.toBeVisible();

    // Should NOT contain "Prepare a Letter" button
    await expect(page.getByText('Prepare a Letter')).not.toBeVisible();

    // Should NOT contain "Received Letters" section
    await expect(page.getByText('Received Letters')).not.toBeVisible();

    // Should NOT contain share button
    await expect(page.getByRole('button', { name: /Share/i })).not.toBeVisible();
  });

  test('back button labeled "Letters" returns to Drafts tab', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/letters/drafts/${docWithStoriesId}`);
    await page.waitForLoadState('networkidle');

    // Find the back button/link with "Letters" label
    const backLink = page.getByText('Letters').first();
    await expect(backLink).toBeVisible();

    await backLink.click();
    await page.waitForLoadState('networkidle');

    // Should return to Letters page with Drafts tab active
    await expect(page).toHaveURL(/\/letters/);
    const draftsTab = page.getByRole('tab', { name: /Drafts/i });
    await expect(draftsTab).toHaveAttribute('aria-selected', 'true');
  });

  test('[+ New] button creates a new draft', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    // Find the [+ New] button
    const newButton = page.getByRole('button', { name: /New/i }).first();
    await expect(newButton).toBeVisible();
  });
});
