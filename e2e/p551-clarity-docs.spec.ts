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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    auth = await getTestAuthContext('host', browser, { name: 'P551 DocList' });
  });

  test.afterAll(async () => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    // Clean up any docs created by this user
    await supabaseAdmin.from('clarity_docs').delete().eq('owner_id', auth.user.user.id);
    await auth.cleanup();
  });

  test('/docs loads for authenticated user', async () => {
    const page = await auth.context.newPage();
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');

    // Page should load without error — check for the heading or empty state
    await expect(page.locator('body')).toBeVisible();
    // P1545: the page is Artifacts now (was "Clarity Letters")
    const heading = page.getByRole('heading', { name: /^artifacts$/i });
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('/docs shows empty state when user has no docs', async () => {
    const page = await auth.context.newPage();
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');

    // Should show some indication of no docs (empty state message or create prompt)
    // The exact text depends on implementation — check for create button at minimum
    // P1545: the "New draft" button is now the "New letter" button.
    const createBtn = page.getByRole('button', { name: /^new letter$/i }).first();
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
      await page.goto('/artifacts?tab=letters&list=drafts');
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    auth = await getTestAuthContext('host', browser, { name: 'P551 DocCreate' });
  });

  test.afterAll(async () => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    await supabaseAdmin.from('clarity_docs').delete().eq('owner_id', auth.user.user.id);
    await auth.cleanup();
  });

  test('clicking New letter asks who can read it (Private / Public)', async () => {
    const page = await auth.context.newPage();
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');

    // Click create button
    const createBtn = page.getByRole('button', { name: /^new letter$/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // P1545: creation asks "Who can read it?" up front, not a title+visibility form.
    const dialog = page.getByRole('dialog', { name: 'Who can read it?' });
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole('button', { name: /^Private/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Public/ })).toBeVisible();
  });

  test('creating a private letter draft from the dialog navigates to the draft page', async () => {
    const page = await auth.context.newPage();
    await page.goto('/artifacts?tab=letters&list=drafts');
    await page.waitForLoadState('networkidle');

    const createBtn = page.getByRole('button', { name: /^new letter$/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    await page.getByRole('dialog', { name: 'Who can read it?' }).getByRole('button', { name: /^Private/ }).click();

    // Should navigate to the new draft page (/letters/drafts/:docId)
    await page.waitForURL(/\/letters\/drafts\//, { timeout: 10000 });
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    auth = await getTestAuthContext('host', browser, { name: 'P551 Rename' });

    const doc = await createDocFixture(auth.user.user.id, {
      title: 'Original Doc Name',
      visibility: 'private',
    });
    docId = doc.id;
  });

  test.afterAll(async () => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    await deleteDocFixture(docId);
    await auth.cleanup();
  });

  test('clicking doc title enables inline editing', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // P1545: the owner's title is a button (aria-label "Edit title: <title>") on the draft page.
    const titleElement = page.getByRole('button', { name: 'Edit title: Original Doc Name' });
    await expect(titleElement).toBeVisible({ timeout: 10000 });

    // Click to enable editing
    await titleElement.click();

    // Should show a text input (found by its label, not by its value: clearing it changes the value)
    const editableInput = page.getByRole('textbox', { name: 'Edit doc title' });
    await expect(editableInput).toBeVisible({ timeout: 5000 });

    // Type new name
    await editableInput.clear();
    await editableInput.fill('Renamed Doc');
    await page.keyboard.press('Enter');

    // Wait for save
    await page.waitForTimeout(1000);

    // Verify name changed
    await expect(page.getByRole('button', { name: 'Edit title: Renamed Doc' })).toBeVisible({ timeout: 5000 });
    const { data: renamed } = await supabaseAdmin.from('clarity_docs').select('title').eq('id', docId).single();
    expect(renamed?.title, 'the new title is saved').toBe('Renamed Doc');
  });
});

// ===========================================================================
// Adding Content — Inline Story Creation
// ===========================================================================

test.describe('P551: Add story inline (write new story)', () => {
  let auth: TestAuthContext;
  let docId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    auth = await getTestAuthContext('host', browser, { name: 'P551 AddStory' });

    const doc = await createDocFixture(auth.user.user.id, {
      title: 'E2E Add Story Doc',
      visibility: 'private',
    });
    docId = doc.id;
  });

  test.afterAll(async () => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
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

  // P1545: the draft page has no inline "write a story" box. Compose > "Share a story" opens the Share a Story page
  // for this draft (/create?docId=), and saving there links the new story to the draft.
  test('user can write a new story and add it to the doc', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Compose' }).click();
    await page.getByRole('menuitem', { name: 'Share a story' }).click();
    await expect(page).toHaveURL(new RegExp(`/create\\?docId=${docId}`), { timeout: 10000 });

    const addStoryArea = page.getByRole('textbox', { name: 'Your story' });
    await expect(addStoryArea).toBeVisible({ timeout: 10000 });
    await addStoryArea.fill('When we discussed the budget last Tuesday, I felt unheard.');

    // A private draft saves the story privately; the save links it to the draft
    await page.getByRole('button', { name: /Save Private Story|Publish Public Story/ }).click();
    await page.waitForURL(/\/story\//, { timeout: 15000 });

    const { data: linked } = await supabaseAdmin
      .from('doc_stories')
      .select('story_id')
      .eq('doc_id', docId);
    expect(linked?.length, 'the new story is linked to the draft').toBe(1);

    // The story appears on the draft page
    await page.goto(`/letters/drafts/${docId}`);
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await deleteDocFixture(docId);
    await deleteTestStory(existingStoryId);
    await auth.cleanup();
  });

  test('user can select an existing story and add it to the doc', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // P1545: Compose > "Select a story" opens the "Select your story" dialog
    await page.getByRole('button', { name: 'Compose' }).click();
    await page.getByRole('menuitem', { name: 'Select a story' }).click();
    const picker = page.getByRole('dialog', { name: 'Select your story' });
    await expect(picker).toBeVisible({ timeout: 10000 });

    // Story picker shows the pre-existing story
    await expect(
      picker.getByText('I believe that trust requires consistent follow-through.')
    ).toBeVisible({ timeout: 10000 });

    // Click the Add button next to the story (the dialog stays open for adding more)
    await picker.getByRole('button', { name: /add/i }).first().click();
    await expect(picker.getByText('I believe that trust requires consistent follow-through.')).toHaveCount(0, { timeout: 10000 });
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();

    // The story is now in the doc: on the page and in the DB
    await expect(
      page.getByText('I believe that trust requires consistent follow-through.')
    ).toBeVisible({ timeout: 10000 });
    const { data: linked } = await supabaseAdmin.from('doc_stories').select('story_id').eq('doc_id', docId);
    expect(linked?.map((r) => r.story_id)).toEqual([existingStoryId]);
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await deleteDocFixture(docId);
    await deleteTestStory(storyId);
    await auth.cleanup();
  });

  test('user can remove a story from the doc via the story remove control', async () => {
    const page = await auth.context.newPage();
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Story should be visible
    await expect(
      page.getByText('This story will be removed from the doc.')
    ).toBeVisible({ timeout: 10000 });

    // P1545: the story card has a "Remove from this doc" control (no card menu)
    await page.getByRole('button', { name: 'Remove from this doc' }).click();

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

    // The unlink must persist: the page hides the card optimistically before the service call,
    // so only the doc_stories row proves the removal was saved (P1580 mutation finding).
    await expect
      .poll(
        async () => {
          const res = await supabaseAdmin
            .from('doc_stories')
            .select('story_id')
            .eq('doc_id', docId)
            .eq('story_id', storyId);
          expect(res.error).toBeNull();
          return res.data?.length;
        },
        { message: 'the story is unlinked from the doc in the database', timeout: 10000 }
      )
      .toBe(0);
  });
});

// ===========================================================================
// Delete Doc
// ===========================================================================

test.describe('P551: Delete doc', () => {
  let auth: TestAuthContext;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    auth = await getTestAuthContext('host', browser, { name: 'P551 DeleteDoc' });
  });

  test.afterAll(async () => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
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

    // P1545: "Delete draft" sits at the bottom of the draft page and asks for confirmation
    await page.getByRole('button', { name: 'Delete draft' }).click();

    // Confirmation dialog should appear
    const confirmDialog = page.getByRole('dialog', { name: 'Delete draft' });
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    // Confirm deletion
    await confirmDialog.getByRole('button', { name: /^delete$/i }).click();

    // Lands on Artifacts > Letters > Drafts after deletion
    await page.waitForURL(/\/artifacts\?tab=letters&list=drafts/, { timeout: 10000 });

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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    ownerAuth = await getTestAuthContext('host', browser, { name: 'P551 PrivOwner' });
    otherAuth = await getTestAuthContext('host', browser, { name: 'P551 PrivOther' });

    const doc = await createDocFixture(ownerAuth.user.user.id, {
      title: 'Secret Private Doc',
      visibility: 'private',
    });
    privateDocId = doc.id;
  });

  test.afterAll(async () => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
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

test.describe('P551: Navigation — Artifacts link in nav', () => {
  let auth: TestAuthContext;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    auth = await getTestAuthContext('host', browser, { name: 'P551 Nav' });
  });

  test.afterAll(async () => {
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
    await auth.cleanup();
  });

  test('desktop nav shows Artifacts link', async () => {
    const page = await auth.context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // P660 replaced "Docs" with "Letters"; P1545 renamed it "Artifacts"
    // (src/app/components/layout/simple-navigation.tsx).
    const docsLink = page.getByRole('link', { name: /artifacts/i }).first();
    await expect(docsLink).toBeVisible({ timeout: 10000 });
  });

  test('clicking Artifacts link navigates to /artifacts', async () => {
    const page = await auth.context.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const docsLink = page.getByRole('link', { name: /artifacts/i }).first();
    await docsLink.click();
    await page.waitForURL(/\/artifacts/, { timeout: 10000 });
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
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
    test.setTimeout(120_000); // P1580: hooks run under the 30s config timeout; TEST user setup/teardown exceeded it (see report)
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

    // P586 visual indicators: a globe (public) and a lock (private) icon per story card, named by their tooltip
    // (src/app/components/shared/visibility-badge.tsx). The page banner is text, not an img, so these are the cards'.
    await expect(page.getByRole('img', { name: 'Visible to everyone' })).toHaveCount(1, { timeout: 5000 });
    await expect(page.getByRole('img', { name: 'Only people you share with can see this.' })).toHaveCount(1);
  });
});
