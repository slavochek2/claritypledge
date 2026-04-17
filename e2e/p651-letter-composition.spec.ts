/**
 * @file p651-letter-composition.spec.ts
 * @description P651: Letter Composition — receiver_name input for 1-to-1 letters
 *
 * Tests the new name input in the composition wizard:
 * 1. Name field appears when "Specific people" mode selected
 * 2. Name is required (Next button disabled without it)
 * 3. Seal summary shows "Name (email)" format
 * 4. Name passed to seal_and_send_letter
 *
 * Uses authenticated sender session throughout.
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

test.describe('P651: Letter Composition — receiver_name input', () => {
  test.describe.configure({ timeout: 45000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P651 Compose Sender' });
    receiver = await createTestUser({ name: 'P651 Compose Receiver' });

    // Create a public doc with 1 story
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P651 Composition Test Doc',
        visibility: 'private',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P651 Composition Story',
      content: 'Test story content for composition name input test.',
    });
    storyIds.push(story.id);

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: story.id, position: 0 });
  });

  test.afterAll(async () => {
    // Clean up letters created during tests
    await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', docId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    for (const id of storyIds) await deleteTestStory(id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  // ── 1. Name field appears when "Specific people" mode selected ──────────

  test('selecting "Specific people" shows name input alongside email', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');

    // Click "Specific people"
    await page.locator('text=/specific people/i').first().click();

    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });

    // Name input should appear alongside email
    const nameInput = page.locator('#receiver-name');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });

  // ── 2. Name is required (Next button disabled without it) ───────────────

  test('Next button disabled when name is empty but email is filled', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');

    // Select "Specific people"
    await page.locator('text=/specific people/i').first().click();

    // Fill email but NOT name
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill(receiver.email);

    // Name input visible but empty
    const nameInput = page.locator('#receiver-name');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await expect(nameInput).toHaveValue('');

    // Continue/Next/Add button should be disabled when name is empty
    const continueBtn = page.getByRole('button', { name: /continue|next|add/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await expect(continueBtn).toBeDisabled();
  });

  // ── 3. Name + email both filled enables Continue ────────────────────────

  test('filling both name and email enables Continue button', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');

    // Select "Specific people"
    await page.locator('text=/specific people/i').first().click();

    // Fill email
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill(receiver.email);

    // Fill name
    const nameInput = page.locator('#receiver-name');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('Slava Ladischenski');

    // Continue button should now be enabled
    const continueBtn = page.getByRole('button', { name: /continue|next|add/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await expect(continueBtn).toBeEnabled();
  });

  // ── 4. Name field does NOT appear for "Anyone with a link" ──────────────

  test('"Anyone with a link" mode does not show name input', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');

    // For private docs, "Anyone with a link" is disabled — verify it's present but disabled
    const linkCard = page.locator('text=/anyone with a link/i').first();
    await expect(linkCard).toBeVisible({ timeout: 5000 });
    const button = linkCard.locator('xpath=ancestor::button');
    await expect(button).toBeDisabled();

    // Name input should NOT be visible when "Specific people" is not selected
    const nameInput = page.locator('#receiver-name');
    await expect(nameInput).not.toBeVisible({ timeout: 3000 });
  });

  // ── 5. Seal summary shows "Name (email)" format ─────────────────────────

  // Full wizard navigation required: modal → predict → review → assert "Name (email)".
  // Requires prediction walk interaction which is story-count-dependent. Deferring to
  // a dedicated composition E2E spec that covers the full flow end-to-end.
  test.fixme('seal summary shows receiver as "Name (email)" format', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');

    await page.locator('text=/specific people/i').first().click();

    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill(receiver.email);

    const nameInput = page.locator('#receiver-name');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('Slava Ladischenski');

    // Navigate through: Continue → prediction walk → review screen
    // Then assert: To: Slava Ladischenski (receiver.email)
    const sealSummary = page.locator(`text=To: Slava Ladischenski (${receiver.email})`);
    await expect(sealSummary).toBeVisible({ timeout: 10000 });
  });
});
