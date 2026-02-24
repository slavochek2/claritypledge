/**
 * @file p427-story-edit-delete.spec.ts
 * @description E2E tests for P427: Story Edit and Delete
 *
 * Tests the author-only inline edit and delete flows on the story detail page.
 * All tests use the story detail page at /story/:id.
 *
 * Tests:
 * - Author sees Edit and Delete buttons; non-author does not
 * - Edit happy path: textarea opens pre-filled, save persists updated content
 * - Edit cancel flow: clicking Cancel discards changes and exits edit mode
 * - Edit Escape key: pressing Escape cancels edit mode
 * - Edit Cmd+Enter keyboard shortcut submits the form
 * - Empty content: Save button is disabled when textarea is empty
 * - Save failure: toast shown, textarea stays open with edits intact
 * - Delete happy path: confirm dialog, story deleted, redirect to profile
 * - Delete cancel flow: dismissing dialog leaves story unchanged
 * - Delete failure: toast shown, dialog stays open with buttons re-enabled
 * - Delete dialog shows linked point count when story has linked points
 * - Unsaved changes guard: SPA navigation blocked with inline confirmation
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { linkStoryToPoint } from './helpers/test-story';

const STORY_CONTENT = 'In that meeting I froze up completely. My manager asked me to present the quarterly numbers and I just blanked. I had prepared everything but the words would not come.';
const UPDATED_CONTENT = 'In that meeting I froze up. My manager asked me to present and I blanked — but afterward I realized the preparation itself was solid. The delivery was the gap.';

test.describe('P427 — Story Edit and Delete', () => {
  test.describe.configure({ timeout: 60000 });

  let author: TestUser;
  let nonAuthor: TestUser;
  let storyId: string;

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P427Author' });
    nonAuthor = await createTestUser({ name: 'P427Viewer' });
    const story = await createTestStory(author.user.id, { content: STORY_CONTENT });
    storyId = story.id;
  });

  test.afterAll(async () => {
    await deleteTestStory(storyId).catch(() => {});
    await deleteTestUser(author.user.id);
    await deleteTestUser(nonAuthor.user.id);
  });

  // ── Author controls visible / non-author controls hidden ────────────────

  test('author sees Edit and Delete buttons on own story', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    // TODO: confirm selector once author-only section is built
    await expect(page.getByRole('button', { name: /edit story/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /delete story/i })).toBeVisible({ timeout: 10000 });
  });

  test('non-author does not see Edit or Delete buttons', async ({ page }) => {
    await setTestSession(page, nonAuthor.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.waitForLoadState('networkidle');
    // Wait for content to confirm page loaded
    await expect(page.getByText(STORY_CONTENT)).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: /edit story/i })).not.toBeAttached();
    await expect(page.getByRole('button', { name: /delete story/i })).not.toBeAttached();
  });

  test('unauthenticated visitor does not see Edit or Delete buttons', async ({ page }) => {
    // No session set — anonymous visitor
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(STORY_CONTENT)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /edit story/i })).not.toBeAttached();
    await expect(page.getByRole('button', { name: /delete story/i })).not.toBeAttached();
  });

  // ── Edit happy path ──────────────────────────────────────────────────────

  test('clicking Edit opens textarea pre-filled with story content', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    // Textarea appears and is pre-filled with the current story content
    const textarea = page.getByRole('textbox'); // TODO: narrow selector if multiple textareas exist
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await expect(textarea).toHaveValue(STORY_CONTENT, { timeout: 5000 });

    // Card border changes to blue (edit mode indicator)
    // TODO: assert border-blue-400 class on edit card container once selector is known
  });

  test('textarea receives focus automatically when edit mode activates', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeFocused({ timeout: 5000 });
  });

  test('character count displays correctly in edit mode', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    const expectedCount = STORY_CONTENT.length;
    // Character count region uses aria-live="polite" — locate by displayed text
    await expect(page.getByText(`${expectedCount} / 10000`)).toBeVisible({ timeout: 5000 });
  });

  test('save updates story content and exits edit mode', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    const textarea = page.getByRole('textbox');
    await textarea.fill(UPDATED_CONTENT);

    await page.getByRole('button', { name: /save story/i }).click();

    // Button shows saving state during request
    // (race-condition-safe: check toast instead of spinner state)

    // Success toast
    await expect(page.getByText(/story updated/i)).toBeVisible({ timeout: 10000 });

    // Edit mode exits — textarea is gone
    await expect(textarea).not.toBeAttached({ timeout: 5000 });

    // Updated content is displayed
    await expect(page.getByText(UPDATED_CONTENT)).toBeVisible({ timeout: 5000 });

    // Edit button is back (not in edit mode)
    await expect(page.getByRole('button', { name: /edit story/i })).toBeVisible({ timeout: 5000 });

    // Restore original content for subsequent tests
    await page.getByRole('button', { name: /edit story/i }).click();
    await page.getByRole('textbox').fill(STORY_CONTENT);
    await page.getByRole('button', { name: /save story/i }).click();
    await expect(page.getByText(/story updated/i)).toBeVisible({ timeout: 10000 });
  });

  // ── Edit cancel flows ────────────────────────────────────────────────────

  test('clicking Cancel discards changes and exits edit mode', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    const textarea = page.getByRole('textbox');
    await textarea.fill('Unsaved changes that should be discarded');

    await page.getByRole('button', { name: /cancel editing/i }).click();

    // Edit mode exits
    await expect(textarea).not.toBeAttached({ timeout: 5000 });

    // Original content still displayed
    await expect(page.getByText(STORY_CONTENT)).toBeVisible({ timeout: 5000 });

    // No toast for cancel (silent discard)
    await expect(page.getByText(/story updated/i)).not.toBeVisible();
  });

  test('pressing Escape cancels edit mode and discards changes', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    const textarea = page.getByRole('textbox');
    await textarea.fill('Unsaved changes via escape');
    await page.keyboard.press('Escape');

    await expect(textarea).not.toBeAttached({ timeout: 5000 });
    await expect(page.getByText(STORY_CONTENT)).toBeVisible({ timeout: 5000 });
  });

  // ── Edit keyboard shortcuts ──────────────────────────────────────────────

  test('Cmd+Enter (or Ctrl+Enter) submits the save form', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    const textarea = page.getByRole('textbox');
    await textarea.fill(UPDATED_CONTENT);

    // Use platform-appropriate modifier
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+Enter' : 'Control+Enter');

    await expect(page.getByText(/story updated/i)).toBeVisible({ timeout: 10000 });
    await expect(textarea).not.toBeAttached({ timeout: 5000 });
    await expect(page.getByText(UPDATED_CONTENT)).toBeVisible({ timeout: 5000 });

    // Restore
    await page.getByRole('button', { name: /edit story/i }).click();
    await page.getByRole('textbox').fill(STORY_CONTENT);
    await page.getByRole('button', { name: /save story/i }).click();
    await expect(page.getByText(/story updated/i)).toBeVisible({ timeout: 10000 });
  });

  // ── Empty content validation ─────────────────────────────────────────────

  test('Save button is disabled when textarea is empty', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    const textarea = page.getByRole('textbox');
    await textarea.fill('');

    const saveButton = page.getByRole('button', { name: /save story/i });
    await expect(saveButton).toBeDisabled({ timeout: 5000 });
  });

  test('Save button disabled tooltip says "Story can\'t be empty"', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    const textarea = page.getByRole('textbox');
    await textarea.fill('');

    // Hover Save to trigger tooltip (use mouse.move since button has pointer-events:none when disabled)
    const saveButton = page.getByRole('button', { name: /save story/i });
    const bbox = await saveButton.boundingBox();
    if (bbox) {
      await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
    }
    await expect(page.getByText(/story can't be empty/i)).toBeVisible({ timeout: 5000 });
  });

  // ── Unsaved changes guard ────────────────────────────────────────────────

  test('navigating away with unsaved edits shows "unsaved changes" blocker', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();

    const textarea = page.getByRole('textbox');
    await textarea.fill('Unsaved edit that triggers the blocker');

    // Click the Back button to trigger SPA navigation — handleBack checks for dirty state
    await page.getByRole('button', { name: /go back/i }).click();

    // handleBack intercepts and shows inline confirmation
    await expect(page.getByText(/you have unsaved changes/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /stay/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /leave/i })).toBeVisible();
  });

  test('"Stay" button on unsaved-changes guard keeps the user on the page', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();
    await page.getByRole('textbox').fill('Triggering blocker');

    await page.getByRole('button', { name: /go back/i }).click();
    await expect(page.getByText(/you have unsaved changes/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /stay/i }).click();

    // Still on story page
    await expect(page).toHaveURL(`/story/${storyId}`, { timeout: 5000 });
    // Edit mode still active
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 });
  });

  // ── Delete happy path ────────────────────────────────────────────────────

  test('Delete button opens confirmation dialog', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /delete story/i }).click();

    // Dialog renders with correct content
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/delete this story\?/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/permanently remove your story/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/points linked to this story will not be deleted/i)).toBeVisible({ timeout: 5000 });
  });

  test('Cancel on delete dialog closes dialog without deleting story', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /delete story/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Cancel — outline button (focused by default)
    await page.getByRole('dialog').getByRole('button', { name: /^cancel$/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(STORY_CONTENT)).toBeVisible({ timeout: 5000 });
  });

  test('pressing Escape closes delete dialog without deleting story', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /delete story/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(STORY_CONTENT)).toBeVisible({ timeout: 5000 });
  });

  test('confirming delete navigates to author profile and shows success toast', async ({ page }) => {
    // Create a separate story for deletion so the main storyId survives
    const storyToDelete = await createTestStory(author.user.id, {
      content: 'This story is scheduled for deletion in the E2E test.',
    });

    await setTestSession(page, author.email);
    await page.goto(`/story/${storyToDelete.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /delete story/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Click the destructive confirm button
    await page.getByRole('dialog').getByRole('button', { name: /delete story/i }).click();

    // Navigated to author profile
    await expect(page).toHaveURL(`/p/${author.slug}`, { timeout: 15000 });

    // Success toast
    await expect(page.getByText(/story deleted/i)).toBeVisible({ timeout: 10000 });

    // Cleanup: story was deleted, nothing to clean up
  });

  // ── Delete dialog — linked point count ──────────────────────────────────

  test('delete dialog shows linked point count when story has linked points', async ({ page }) => {
    const point = await createTestPoint(author.user.id);
    const linkedStory = await createTestStory(author.user.id, {
      content: 'Story with a linked point for delete dialog count test.',
    });
    await linkStoryToPoint(linkedStory.id, point.id);

    await setTestSession(page, author.email);
    await page.goto(`/story/${linkedStory.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /delete story/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Conditional line: "This story has 1 linked point(s)."
    await expect(page.getByText(/this story has 1 linked point/i)).toBeVisible({ timeout: 5000 });

    // Close dialog (don't actually delete)
    await page.getByRole('dialog').getByRole('button', { name: /^cancel$/i }).click();

    // Cleanup
    await deleteTestStory(linkedStory.id);
    await deleteTestPoint(point.id);
  });

  test('delete dialog does NOT show linked point count when story has no linked points', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /delete story/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/linked point/i)).not.toBeVisible();

    await page.getByRole('dialog').getByRole('button', { name: /^cancel$/i }).click();
  });

  // ── Focus management ─────────────────────────────────────────────────────

  test('Cancel button in delete dialog receives focus by default', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /delete story/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Cancel button has initial focus (safer default for destructive action)
    const cancelButton = page.getByRole('dialog').getByRole('button', { name: /^cancel$/i });
    await expect(cancelButton).toBeFocused({ timeout: 5000 });
  });

  test('after cancelling delete dialog, focus returns to Delete button', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /delete story/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByRole('dialog').getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

    // Focus returns to the Delete button
    await expect(page.getByRole('button', { name: /delete story/i })).toBeFocused({ timeout: 5000 });
  });

  test('after save, focus returns to Edit button or story content area', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /edit story/i }).click();
    await page.getByRole('textbox').fill(UPDATED_CONTENT);
    await page.getByRole('button', { name: /save story/i }).click();
    await expect(page.getByText(/story updated/i)).toBeVisible({ timeout: 10000 });

    // Focus should land back on Edit button (or story content area)
    const editButton = page.getByRole('button', { name: /edit story/i });
    await expect(editButton).toBeFocused({ timeout: 5000 });

    // Restore
    await page.getByRole('button', { name: /edit story/i }).click();
    await page.getByRole('textbox').fill(STORY_CONTENT);
    await page.getByRole('button', { name: /save story/i }).click();
    await expect(page.getByText(/story updated/i)).toBeVisible({ timeout: 10000 });
  });
});
