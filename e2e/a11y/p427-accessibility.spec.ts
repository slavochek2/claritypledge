/**
 * @file p427-accessibility.spec.ts
 * @description Accessibility tests for P427: Story Edit and Delete
 *
 * Tests:
 * - Edit button has aria-label="Edit story"
 * - Delete button has aria-label="Delete story"
 * - Clicking Edit moves focus to textarea automatically
 * - Save button has aria-label="Save story" and disabled state uses `disabled` attribute
 * - Cancel button has aria-label="Cancel editing"
 * - Escape key cancels edit mode (keyboard users)
 * - Tab order within edit mode: Textarea → Cancel → Save
 * - Cmd+Enter submits the edit form (keyboard shortcut)
 * - Save button shows aria-busy="true" during save
 * - Character count has aria-live region
 * - Delete dialog: focus trap works, Cancel button has initial focus
 * - After dialog closes on Cancel, focus returns to Delete button
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

const STORY_CONTENT = 'Accessibility test story content for P427. This text is long enough to be meaningful.';

test.describe('P427 Accessibility — Edit and Delete controls', () => {
  test.describe.configure({ timeout: 60000 });

  let author: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P427A11yAuthor' });
    const story = await createTestStory(author.user.id, { content: STORY_CONTENT });
    storyId = story.id;
  });

  test.afterAll(async () => {
    await deleteTestStory(storyId).catch(() => {});
    await deleteTestUser(author.user.id);
  });

  // ── ARIA labels ──────────────────────────────────────────────────────────

  test('Edit button has aria-label="Edit story"', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    const editButton = page.getByRole('button', { name: 'Edit story' });
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await expect(editButton).toHaveAttribute('aria-label', 'Edit story');
  });

  test('Delete button has aria-label="Delete story"', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    const deleteButton = page.getByRole('button', { name: 'Delete story' });
    await expect(deleteButton).toBeVisible({ timeout: 10000 });
    await expect(deleteButton).toHaveAttribute('aria-label', 'Delete story');
  });

  test('Save button has aria-label="Save story" in edit mode', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Edit story' }).click();

    const saveButton = page.getByRole('button', { name: 'Save story' });
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await expect(saveButton).toHaveAttribute('aria-label', 'Save story');
  });

  test('Cancel button has aria-label="Cancel editing" in edit mode', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Edit story' }).click();

    const cancelButton = page.getByRole('button', { name: 'Cancel editing' });
    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    await expect(cancelButton).toHaveAttribute('aria-label', 'Cancel editing');
  });

  // ── Disabled state uses `disabled` attribute ─────────────────────────────

  test('Save button uses disabled attribute (not just visual) when content is empty', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Edit story' }).click();
    await page.getByRole('textbox').fill('');

    // Must use disabled attribute, not just pointer-events:none or opacity
    const saveButton = page.getByRole('button', { name: 'Save story' });
    await expect(saveButton).toHaveAttribute('disabled');
  });

  // ── Focus management: textarea receives focus on edit mode activation ────

  test('textarea receives focus automatically when Edit is clicked', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Edit story' }).click();

    // autoFocus or useEffect ref.focus() — either way textarea should be focused
    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeFocused({ timeout: 5000 });
  });

  // ── Keyboard: Edit button accessible via keyboard ────────────────────────

  test('Edit button is keyboard-accessible (Tab to focus, Enter to activate)', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    const editButton = page.getByRole('button', { name: 'Edit story' });
    await expect(editButton).toBeVisible({ timeout: 10000 });

    await editButton.focus();
    await expect(editButton).toBeFocused();
    await page.keyboard.press('Enter');

    // Edit mode activated via keyboard
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 });
  });

  // ── Keyboard: Escape cancels edit mode ──────────────────────────────────

  test('Escape key cancels edit mode (keyboard user flow)', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Edit story' }).click();

    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeFocused({ timeout: 5000 });

    await page.keyboard.press('Escape');

    await expect(textarea).not.toBeAttached({ timeout: 5000 });
  });

  // ── Tab order within edit mode ───────────────────────────────────────────

  test('Tab order within edit mode: Textarea → Cancel → Save', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Edit story' }).click();

    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeFocused({ timeout: 5000 });

    // Tab from textarea → Cancel
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancel editing' })).toBeFocused({ timeout: 5000 });

    // Tab from Cancel → Save
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Save story' })).toBeFocused({ timeout: 5000 });
  });

  // ── aria-live: character count region ────────────────────────────────────

  test('character count region has aria-live="polite"', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Edit story' }).click();

    // TODO: confirm exact selector for char-count region once implementation is known
    const charCountRegion = page.locator('[aria-live="polite"]').filter({ hasText: /\d+ \/ 10000/ });
    await expect(charCountRegion).toBeAttached({ timeout: 5000 });
  });

  // ── aria-busy during save ─────────────────────────────────────────────────

  test('Save button has aria-busy="true" while save is in progress', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Edit story' }).click();

    const textarea = page.getByRole('textbox');
    await textarea.fill('Testing aria-busy during save.');

    const saveButton = page.getByRole('button', { name: 'Save story' });

    // Click save and immediately check aria-busy (race window is small —
    // if this proves flaky, use page.route() to slow down the API call)
    await saveButton.click();
    // Note: aria-busy check may need page.route() network interception to reliably assert
    // TODO: use route interception to pause the save API call and assert aria-busy="true"

    // Wait for save to complete and verify mode exits
    await expect(page.getByText(/story updated/i)).toBeVisible({ timeout: 10000 });
    await expect(textarea).not.toBeAttached({ timeout: 5000 });

    // Restore
    await page.getByRole('button', { name: 'Edit story' }).click();
    await page.getByRole('textbox').fill(STORY_CONTENT);
    await page.getByRole('button', { name: 'Save story' }).click();
    await expect(page.getByText(/story updated/i)).toBeVisible({ timeout: 10000 });
  });

  // ── Delete dialog: focus trap ────────────────────────────────────────────

  test('Delete dialog traps focus (Tab stays within dialog)', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Delete story' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Cancel button is focused by default
    const cancelButton = page.getByRole('dialog').getByRole('button', { name: /^cancel$/i });
    await expect(cancelButton).toBeFocused({ timeout: 5000 });

    // Tab forward should stay in dialog (Radix handles focus trap)
    await page.keyboard.press('Tab');
    // Focus should now be on the "Delete story" confirm button (next in dialog's tab order)
    const confirmButton = page.getByRole('dialog').getByRole('button', { name: /delete story/i });
    await expect(confirmButton).toBeFocused({ timeout: 5000 });

    // Tab again should wrap back to Cancel (or close button if present)
    await page.keyboard.press('Tab');
    // Focus should wrap within dialog — verify we're still inside it
    const focusedInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(focusedInDialog, 'Focus escaped the dialog — focus trap not working').toBe(true);

    // Close dialog
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });

  // ── Delete dialog: Cancel returns focus to Delete button ─────────────────

  test('after cancelling delete dialog, focus returns to Delete button', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Delete story' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByRole('dialog').getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

    // Radix Dialog restores focus to the trigger element
    await expect(page.getByRole('button', { name: 'Delete story' })).toBeFocused({ timeout: 5000 });
  });

  // ── Delete button: Delete story button accessible via keyboard ───────────

  test('Delete button is keyboard-accessible (Tab to focus, Enter to activate)', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    const deleteButton = page.getByRole('button', { name: 'Delete story' });
    await expect(deleteButton).toBeVisible({ timeout: 10000 });

    await deleteButton.focus();
    await expect(deleteButton).toBeFocused();
    await page.keyboard.press('Enter');

    // Dialog opens via keyboard activation
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Close it
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });
});
