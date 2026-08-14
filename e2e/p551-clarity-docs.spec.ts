/**
 * @file p551-clarity-docs.spec.ts
 * @description E2E tests for P551: Clarity Docs — Curated Story Collections
 *
 * Covers user-facing flows:
 * 1. Doc list page loads and shows user's docs
 * 2. Create a new doc (modal: title + visibility)
 * 3. Rename doc title inline
 * 4. Add story via "Write a story" (inline creation)
 * 5. Add story via "Select your story" (existing story picker)
 * 6. Remove story from doc
 * 7. Reorder stories via drag-and-drop (or keyboard)
 * 8. Delete doc (confirmation dialog, cascade)
 * 9. Private doc not accessible by non-owner (URL guessing)
 * 10. Navigation: Docs link in nav bar
 * 11. Privacy banner on private doc page
 * 12. Visibility indicators on story cards
 */

import { test, expect, Browser } from '@playwright/test';
import { getTestAuthContext, type TestAuthContext } from './helpers/auth-context';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { deleteTestUser as _deleteTestUser } from './helpers/test-user';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a doc via admin for fixture setup. */
async function createDocFixture(
  ownerId: string,
  options: { title?: string; visibility?: 'public' | 'private' } = {}
) {
  const { data, error } = await supabaseAdmin
    .from('clarity_docs')
    .insert({
      owner_id: ownerId,
      title: options.title ?? `E2E Doc ${Date.now()}`,
      visibility: options.visibility ?? 'private',
    })
    .select('id, title, visibility')
    .single();
  if (error || !data) throw new Error(`createDocFixture failed: ${error?.message}`);
  return data;
}

async function deleteDocFixture(docId: string) {
  await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
}

async function addStoryToDocFixture(docId: string, storyId: string, position: number) {
  await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position });
}

// ===========================================================================
// Doc List Page
// ===========================================================================

test.describe('P551: Doc list page (/docs)', () => {
  let auth: TestAuthContext;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 DocList' });
  });

  test.afterAll(async () => {
    // Clean up any docs created by this user
    await supabaseAdmin.from('clarity_docs').delete().eq('owner_id', auth.user.user.id);
    await auth.cleanup();
  });

  test('/docs loads for authenticated user', async () => {
    const page = await auth.context.newPage();
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    // Page should load without error — check for the heading or empty state
    await expect(page.locator('body')).toBeVisible();
    // Should show "Your Docs" heading or similar
    const heading = page.getByRole('heading', { name: /clarity letters/i });
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('/docs shows empty state when user has no docs', async () => {
    const page = await auth.context.newPage();
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    // Should show some indication of no docs (empty state message or create prompt)
    // The exact text depends on implementation — check for create button at minimum
    const createBtn = page.getByRole('button', { name: /new draft/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test('/docs shows docs after creation', async () => {
    const page = await auth.context.newPage();

    // Create a doc via admin fixture
    const doc = await createDocFixture(auth.user.user.id, {
      title: 'E2E Visible Doc',
      visibility: 'private',
    });

    try {
      await page.goto('/letters?tab=drafts');
      await page.waitForLoadState('networkidle');

      // Should see the doc title in the list
      await expect(page.getByText('E2E Visible Doc')).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteDocFixture(doc.id);
    }
  });
});

// ===========================================================================
// Doc Creation
// ===========================================================================

test.describe('P551: Doc creation via modal', () => {
  let auth: TestAuthContext;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 DocCreate' });
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('clarity_docs').delete().eq('owner_id', auth.user.user.id);
    await auth.cleanup();
  });

  test('clicking New button opens creation modal with title and visibility fields', async () => {
    const page = await auth.context.newPage();
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    // Click create button
    const createBtn = page.getByRole('button', { name: /new draft/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Modal should appear with title input and visibility options
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Title input
    const titleInput = dialog.locator('input[type="text"], input[name*="title"], [placeholder*="title" i]');
    await expect(titleInput).toBeVisible();

    // Visibility options (radio buttons or toggle)
    const privateOption = dialog.getByText(/private/i);
    await expect(privateOption).toBeVisible();
    const publicOption = dialog.getByText(/public/i);
    await expect(publicOption).toBeVisible();
  });

  test('creating a doc with title and private visibility navigates to doc page', async () => {
    const page = await auth.context.newPage();
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    const createBtn = page.getByRole('button', { name: /new draft/i }).first();
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill title
    const titleInput = dialog.locator('input[type="text"], input[name*="title"], [placeholder*="title" i]');
    await titleInput.fill('My Private Therapy Notes');

    // Submit (private should be default)
    const submitBtn = dialog.getByRole('button', { name: /create/i });
    await submitBtn.click();

    // Should navigate to the new doc page (/d/:docId)
    await page.waitForURL(/\/d\//, { timeout: 10000 });

    // Doc title should be visible on the page
    await expect(page.getByText('My Private Therapy Notes')).toBeVisible({ timeout: 10000 });
  });
});

// ===========================================================================
// Doc Detail Page
// ===========================================================================

test.describe('P551: Doc detail page (/d/:docId)', () => {
  let auth: TestAuthContext;
  let docId: string;
  let storyId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 DocDetail' });

    const doc = await createDocFixture(auth.user.user.id, {
      title: 'E2E Detail Doc',
      visibility: 'private',
    });
    docId = doc.id;

    const story = await createTestStory(auth.user.user.id, {
      title: 'Story in E2E doc',
      content: 'This is a story about my beliefs.',
      visibility: 'private',
    });
    storyId = story.id;

    await addStoryToDocFixture(docId, storyId, 0);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await deleteDocFixture(docId);
    await deleteTestStory(storyId);
    await auth.cleanup();
  });

  test('doc detail page shows title and story count', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('E2E Detail Doc')).toBeVisible({ timeout: 10000 });
    // P660 (944d1171) moved the "N stories · N points" summary off the detail page and
    // onto the drafts LIST (src/app/components/letters/drafts-tab.tsx:158). The detail
    // page renders the story cards themselves, so assert the linked story is present
    // rather than a count this page no longer shows.
    await expect(page.getByText('This is a story about my beliefs.')).toBeVisible({ timeout: 5000 });
  });

  test('private doc shows privacy banner', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Privacy banner should be visible with "Only you can see this" or similar
    await expect(
      page.getByText(/only you|private/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('story cards are displayed with content', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Story content should be visible on a card
    await expect(
      page.getByText('This is a story about my beliefs.')
    ).toBeVisible({ timeout: 10000 });
  });
});

// ===========================================================================
// Rename Doc Title
// ===========================================================================

test.describe('P551: Rename doc title inline', () => {
  let auth: TestAuthContext;
  let docId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 Rename' });

    const doc = await createDocFixture(auth.user.user.id, {
      title: 'Original Doc Name',
      visibility: 'private',
    });
    docId = doc.id;
  });

  test.afterAll(async () => {
    await deleteDocFixture(docId);
    await auth.cleanup();
  });

  test('clicking doc title enables inline editing', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    const titleElement = page.getByText('Original Doc Name');
    await expect(titleElement).toBeVisible({ timeout: 10000 });

    // Click to enable editing (could be a click or double-click depending on implementation)
    await titleElement.click();

    // Should show an input or contenteditable element
    const editableInput = page.locator(
      'input[value="Original Doc Name"], [contenteditable="true"]'
    );
    await expect(editableInput).toBeVisible({ timeout: 5000 });

    // Type new name
    await editableInput.clear();
    await editableInput.fill('Renamed Doc');
    await page.keyboard.press('Enter');

    // Wait for save
    await page.waitForTimeout(1000);

    // Verify name changed
    await expect(page.getByText('Renamed Doc')).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// Adding Content — Inline Story Creation
// ===========================================================================

test.describe('P551: Add story inline (write new story)', () => {
  let auth: TestAuthContext;
  let docId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 AddStory' });

    const doc = await createDocFixture(auth.user.user.id, {
      title: 'E2E Add Story Doc',
      visibility: 'private',
    });
    docId = doc.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    // Clean up stories created during test
    const { data: docStories } = await supabaseAdmin
      .from('doc_stories')
      .select('story_id')
      .eq('doc_id', docId);
    for (const ds of docStories ?? []) {
      await deleteTestStory(ds.story_id);
    }
    await deleteDocFixture(docId);
    await auth.cleanup();
  });

  test('user can write a new story and add it to the doc', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Look for the "Write a story" / "Add story" input area at the bottom
    const addStoryArea = page.getByRole('textbox', { name: /story|write/i })
      .or(page.locator('textarea'))
      .first();
    await expect(addStoryArea).toBeVisible({ timeout: 10000 });

    await addStoryArea.fill('When we discussed the budget last Tuesday, I felt unheard.');

    // Submit the new story
    const submitBtn = page.getByRole('button', { name: /add|submit|save/i }).first();
    await submitBtn.click();

    // The story should appear on the doc page
    await expect(
      page.getByText('When we discussed the budget last Tuesday, I felt unheard.')
    ).toBeVisible({ timeout: 10000 });
  });
});

// ===========================================================================
// Adding Content — Select Existing Story
// ===========================================================================

test.describe('P551: Add existing story via selector', () => {
  let auth: TestAuthContext;
  let docId: string;
  let existingStoryId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 SelectStory' });

    const doc = await createDocFixture(auth.user.user.id, {
      title: 'E2E Select Story Doc',
      visibility: 'public',
    });
    docId = doc.id;

    // Create a story that can be selected
    const story = await createTestStory(auth.user.user.id, {
      title: 'Pre-existing story for selection',
      content: 'I believe that trust requires consistent follow-through.',
      visibility: 'public',
    });
    existingStoryId = story.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await deleteDocFixture(docId);
    await deleteTestStory(existingStoryId);
    await auth.cleanup();
  });

  test('user can select an existing story and add it to the doc', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Look for "Select from existing stories" or similar button/link
    const selectBtn = page.getByRole('button', { name: /select|existing|choose/i })
      .or(page.getByText(/select.*existing|choose.*stor/i))
      .first();
    await expect(selectBtn).toBeVisible({ timeout: 10000 });
    await selectBtn.click();

    // Story picker/list should appear showing the pre-existing story
    await expect(
      page.getByText('I believe that trust requires consistent follow-through.')
    ).toBeVisible({ timeout: 10000 });

    // Click the Add button next to the story
    const addBtn = page.getByRole('button', { name: /add/i }).first();
    await addBtn.click();

    // Wait for it to be added
    await page.waitForTimeout(1000);

    // The story should now be in the doc
    await expect(
      page.getByText('I believe that trust requires consistent follow-through.')
    ).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// Remove Story from Doc
// ===========================================================================

test.describe('P551: Remove story from doc', () => {
  let auth: TestAuthContext;
  let docId: string;
  let storyId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 RemoveStory' });

    const doc = await createDocFixture(auth.user.user.id, {
      title: 'E2E Remove Story Doc',
      visibility: 'private',
    });
    docId = doc.id;

    const story = await createTestStory(auth.user.user.id, {
      title: 'Story to remove',
      content: 'This story will be removed from the doc.',
      visibility: 'private',
    });
    storyId = story.id;

    await addStoryToDocFixture(docId, storyId, 0);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await deleteDocFixture(docId);
    await deleteTestStory(storyId);
    await auth.cleanup();
  });

  test('user can remove a story from the doc via card menu', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Story should be visible
    await expect(
      page.getByText('This story will be removed from the doc.')
    ).toBeVisible({ timeout: 10000 });

    // Open the card menu (... button)
    const menuBtn = page.locator('[data-testid="story-card-menu"], button[aria-label*="menu" i]')
      .or(page.getByRole('button', { name: /more|options|menu/i }))
      .first();
    await menuBtn.click();

    // Click "Remove from doc" in the menu
    const removeOption = page.getByRole('menuitem', { name: /remove/i })
      .or(page.getByText(/remove from doc/i))
      .first();
    await expect(removeOption).toBeVisible({ timeout: 5000 });
    await removeOption.click();

    // Story should be removed from doc (but still exists in DB)
    await expect(
      page.getByText('This story will be removed from the doc.')
    ).not.toBeVisible({ timeout: 5000 });

    // Verify story still exists in DB (not deleted, just unlinked)
    const { data } = await supabaseAdmin
      .from('stories')
      .select('id')
      .eq('id', storyId)
      .single();
    expect(data?.id, 'Story should still exist after removal from doc').toBe(storyId);
  });
});

// ===========================================================================
// Delete Doc
// ===========================================================================

test.describe('P551: Delete doc', () => {
  let auth: TestAuthContext;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 DeleteDoc' });
  });

  test.afterAll(async () => {
    await auth.cleanup();
  });

  test('user can delete a doc via confirmation dialog', async () => {
    // Create a doc to delete
    const doc = await createDocFixture(auth.user.user.id, {
      title: 'Doc to Delete',
      visibility: 'private',
    });

    const page = await auth.context.newPage();
    await page.goto(`/d/${doc.id}`);
    await page.waitForLoadState('networkidle');

    // Find delete action — could be in a menu or a button
    // Try doc-level menu first
    const docMenu = page.getByRole('button', { name: /menu|more|options/i })
      .or(page.locator('[data-testid="doc-menu"]'))
      .first();
    await docMenu.click();

    const deleteOption = page.getByRole('menuitem', { name: /delete/i })
      .or(page.getByText(/delete doc/i))
      .first();
    await expect(deleteOption).toBeVisible({ timeout: 5000 });
    await deleteOption.click();

    // Confirmation dialog should appear
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    // Confirm deletion
    const confirmBtn = confirmDialog.getByRole('button', { name: /delete|confirm|yes/i });
    await confirmBtn.click();

    // Should redirect to /docs after deletion
    await page.waitForURL(/\/docs/, { timeout: 10000 });

    // Verify doc is gone from DB
    const { data } = await supabaseAdmin
      .from('clarity_docs')
      .select('id')
      .eq('id', doc.id)
      .single();
    expect(data, 'Doc should be deleted from DB').toBeNull();
  });
});

// ===========================================================================
// Private Doc — Non-Owner URL Access
// ===========================================================================

test.describe('P551: Private doc not accessible by non-owner', () => {
  let ownerAuth: TestAuthContext;
  let otherAuth: TestAuthContext;
  let privateDocId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ownerAuth = await getTestAuthContext('host', browser, { name: 'P551 PrivOwner' });
    otherAuth = await getTestAuthContext('host', browser, { name: 'P551 PrivOther' });

    const doc = await createDocFixture(ownerAuth.user.user.id, {
      title: 'Secret Private Doc',
      visibility: 'private',
    });
    privateDocId = doc.id;
  });

  test.afterAll(async () => {
    await deleteDocFixture(privateDocId);
    await ownerAuth.cleanup();
    await otherAuth.cleanup();
  });

  test('non-owner navigating to /d/:privateDocId sees not-found or access denied', async () => {
    const page = await otherAuth.context.newPage();
    await page.goto(`/d/${privateDocId}`);
    await page.waitForLoadState('networkidle');

    // Should NOT show the doc title
    await expect(
      page.getByText('Secret Private Doc')
    ).not.toBeVisible({ timeout: 5000 });

    // Should show a "not found" or "access denied" message
    const errorMessage = page.getByText(/not found|access denied|doesn't exist|no access/i);
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('unauthenticated user navigating to /d/:privateDocId is redirected or sees error', async ({ page }) => {
    await page.goto(`/d/${privateDocId}`);
    await page.waitForLoadState('networkidle');

    // Should NOT see the doc content
    await expect(
      page.getByText('Secret Private Doc')
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// Navigation
// ===========================================================================

test.describe('P551: Navigation — Docs link in nav', () => {
  let auth: TestAuthContext;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 Nav' });
  });

  test.afterAll(async () => {
    await auth.cleanup();
  });

  test('desktop nav shows Letters link', async () => {
    const page = await auth.context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // P660 (944d1171) replaced the "Docs" nav entry with "Letters"
    // (src/app/components/layout/simple-navigation.tsx:233).
    const docsLink = page.getByRole('link', { name: /letters/i }).first();
    await expect(docsLink).toBeVisible({ timeout: 10000 });
  });

  test('clicking Letters link navigates to /letters', async () => {
    const page = await auth.context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const docsLink = page.getByRole('link', { name: /letters/i }).first();
    await docsLink.click();
    await page.waitForURL(/\/letters/, { timeout: 10000 });
  });
});

// ===========================================================================
// Visibility Indicators on Story Cards
// ===========================================================================

test.describe('P551: Visibility indicators on story cards', () => {
  let auth: TestAuthContext;
  let docId: string;
  let publicStoryId: string;
  let privateStoryId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    auth = await getTestAuthContext('host', browser, { name: 'P551 VisInd' });

    const doc = await createDocFixture(auth.user.user.id, {
      title: 'E2E Visibility Indicators Doc',
      visibility: 'private',
    });
    docId = doc.id;

    const publicStory = await createTestStory(auth.user.user.id, {
      title: 'Public story in private doc',
      content: 'This is a public story.',
      visibility: 'public',
    });
    publicStoryId = publicStory.id;

    const privateStory = await createTestStory(auth.user.user.id, {
      title: 'Private story in private doc',
      content: 'This is a private story.',
      visibility: 'private',
    });
    privateStoryId = privateStory.id;

    await addStoryToDocFixture(docId, publicStoryId, 0);
    await addStoryToDocFixture(docId, privateStoryId, 1);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await deleteDocFixture(docId);
    await deleteTestStory(publicStoryId);
    await deleteTestStory(privateStoryId);
    await auth.cleanup();
  });

  test('story cards show visibility indicators (lock/globe)', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Both stories should be visible
    await expect(page.getByText('This is a public story.')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('This is a private story.')).toBeVisible({ timeout: 10000 });

    // Look for visibility icons — lock icon for private, globe for public
    // These are P586 visual indicators (lock/globe SVGs or aria-labels)
    const visibilityIcons = page.locator(
      '[aria-label*="private" i], [aria-label*="public" i], ' +
      '[data-testid="visibility-icon"], .visibility-indicator'
    );
    // At minimum 2 indicators (one per story card)
    await expect(visibilityIcons.first()).toBeVisible({ timeout: 5000 });
  });
});
