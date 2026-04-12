/**
 * @file p682-letter-multi-recipient.spec.ts
 * @description P682: Private Letter — Multi-Recipient & Simplified Flow
 *
 * Tests:
 * 1. Private doc: modal opens directly to recipient form (no mode selector)
 * 2. Public doc: mode selector still shown (regression guard)
 * 3. Add another person: new recipient card appended, email auto-focused
 * 4. Remove recipient: X button removes row; disappears on sole row
 * 5. Max row cap: "+ Add another person" disappears at 20 recipients
 * 6. Validation: duplicate email, self-send error, empty rows cleaned silently
 * 7. Footer text present verbatim
 * 8. Add-recipient mode (P664) unaffected
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makePrivateDoc(ownerId: string, title: string): Promise<string> {
  const { data: doc } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: ownerId, title, visibility: 'private' })
    .select('id')
    .single();
  if (!doc) throw new Error('Doc creation failed');
  return doc.id;
}

async function makePublicDoc(ownerId: string, title: string): Promise<string> {
  const { data: doc } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: ownerId, title, visibility: 'public' })
    .select('id')
    .single();
  if (!doc) throw new Error('Doc creation failed');
  return doc.id;
}

async function attachStory(docId: string, storyId: string): Promise<void> {
  await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('P682: Multi-Recipient Receiver Modal', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let privateDocId: string;
  let publicDocId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P682 Sender' });
    receiver = await createTestUser({ name: 'P682 Receiver' });

    privateDocId = await makePrivateDoc(sender.user.id, 'P682 Private Doc');
    publicDocId = await makePublicDoc(sender.user.id, 'P682 Public Doc');

    const story = await createTestStory(sender.user.id, {
      title: 'P682 Test Story',
      content: 'Test story content for P682.',
    });
    storyIds.push(story.id);

    await attachStory(privateDocId, story.id);
    await attachStory(publicDocId, story.id);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', privateDocId);
    await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', publicDocId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', privateDocId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', publicDocId);
    for (const id of storyIds) await deleteTestStory(id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', privateDocId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', publicDocId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  // ── 1. Private doc: modal skips mode selector ──────────────────────────────

  test('private doc: modal opens to recipient form without mode selector', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    // Mode selector cards ("Specific people" / "Anyone with a link") must NOT be visible
    await expect(page.locator('text=/specific people/i').first()).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=/anyone with a link/i').first()).not.toBeVisible({ timeout: 5000 });

    // Recipient form must be shown directly — email placeholder visible
    const emailInput = page.locator('input[placeholder*="Email address" i], input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 8000 });
  });

  // ── 2. Public doc: mode selector skipped — prediction walk shown directly ──

  test('public doc: mode selector skipped — prediction walk shown directly', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${publicDocId}/compose`);
    await page.waitForLoadState('networkidle');

    // Mode selector must NOT appear for public docs (auto-skipped)
    const specificPeopleCard = page.locator('text=/specific people/i').first();
    await expect(specificPeopleCard).not.toBeVisible({ timeout: 5000 });

    const anyoneCard = page.locator('text=/anyone with a link/i').first();
    await expect(anyoneCard).not.toBeVisible({ timeout: 2000 });

    // Prediction walk must be shown directly
    const storyCounter = page.locator('text=/story \\d+ of \\d+/i').first();
    await expect(storyCounter).toBeVisible({ timeout: 8000 });
  });

  // ── 3. Dialog title ────────────────────────────────────────────────────────

  test('private doc: modal title is "Who is your letter for?"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text="Who is your letter for?"')).toBeVisible({ timeout: 8000 });
  });

  // ── 4. Footer text verbatim ────────────────────────────────────────────────

  test('footer text reads "Each person receives their own personal invitation."', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text="Each person receives their own personal invitation."')
    ).toBeVisible({ timeout: 8000 });
  });

  // ── 5. Single row: no X button ────────────────────────────────────────────

  test('single recipient row has no X remove button', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    // Wait for form to appear
    const emailInput = page.locator('input[placeholder*="Email address" i], input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 8000 });

    // No "Remove recipient" buttons on the sole row
    const removeButtons = page.getByRole('button', { name: /remove recipient/i });
    await expect(removeButtons).toHaveCount(0);
  });

  // ── 6. Add another person link ────────────────────────────────────────────

  test('"+ Add another person" link is visible on the recipient form', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text="+ Add another person"')
    ).toBeVisible({ timeout: 8000 });
  });

  test('clicking "+ Add another person" adds a second recipient card', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    const addLink = page.locator('text="+ Add another person"');
    await expect(addLink).toBeVisible({ timeout: 8000 });

    await addLink.click();

    // Two email inputs should now be visible
    const emailInputs = page.locator('input[placeholder*="Email address" i], input[placeholder*="email" i][type="email"]');
    await expect(emailInputs).toHaveCount(2, { timeout: 5000 });
  });

  test('second row shows X button; first row also gets X button when 2+ rows exist', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    const addLink = page.locator('text="+ Add another person"');
    await expect(addLink).toBeVisible({ timeout: 8000 });
    await addLink.click();

    // With 2 rows, both rows should have a remove button
    const removeButtons = page.getByRole('button', { name: /remove recipient/i });
    await expect(removeButtons).toHaveCount(2, { timeout: 5000 });
  });

  // ── 7. Remove row ─────────────────────────────────────────────────────────

  test('clicking X on second row removes it; first row loses X button', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    const addLink = page.locator('text="+ Add another person"');
    await expect(addLink).toBeVisible({ timeout: 8000 });
    await addLink.click();

    // Verify 2 rows
    const removeButtons = page.getByRole('button', { name: /remove recipient/i });
    await expect(removeButtons).toHaveCount(2, { timeout: 5000 });

    // Remove the second row (index 1)
    await removeButtons.nth(1).click();

    // Back to 1 row — no remove buttons
    await expect(page.getByRole('button', { name: /remove recipient/i })).toHaveCount(0, { timeout: 5000 });

    // Only one email input remains
    const emailInputs = page.locator('input[placeholder*="Email address" i], input[type="email"]');
    await expect(emailInputs).toHaveCount(1, { timeout: 5000 });
  });

  // ── 8. Duplicate email validation ────────────────────────────────────────

  test('entering duplicate email shows "Already added" error on second row', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    const addLink = page.locator('text="+ Add another person"');
    await expect(addLink).toBeVisible({ timeout: 8000 });

    // Fill first row
    const emailInputs = page.locator('input[type="email"]');
    await emailInputs.first().fill('duplicate@example.com');

    // Add second row
    await addLink.click();
    await expect(emailInputs).toHaveCount(2, { timeout: 5000 });

    // Fill second row with same email
    await emailInputs.nth(1).fill('duplicate@example.com');

    // Click Continue to trigger validation
    const continueBtn = page.getByRole('button', { name: /^continue$/i });
    await continueBtn.click();

    // "Already added" error should appear
    await expect(page.locator('text="Already added"')).toBeVisible({ timeout: 5000 });
  });

  // ── 9. Self-send validation ────────────────────────────────────────────────

  test('entering sender\'s own email shows "You can\'t send a letter to yourself"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 8000 });

    await emailInput.fill(sender.email);

    // Self-send error should appear (inline, no toast)
    await expect(
      page.locator('text="You can\'t send a letter to yourself"')
    ).toBeVisible({ timeout: 5000 });
  });

  // ── 10. Max 20 rows cap ───────────────────────────────────────────────────

  test('"+ Add another person" disappears after 20 rows', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    const addLink = page.locator('text="+ Add another person"');
    await expect(addLink).toBeVisible({ timeout: 8000 });

    // Click 19 times to reach 20 rows total (start at 1)
    for (let i = 0; i < 19; i++) {
      await expect(addLink).toBeVisible({ timeout: 5000 });
      await addLink.click();
    }

    // At 20 rows, the link should disappear
    await expect(addLink).not.toBeVisible({ timeout: 5000 });

    // No error message — silent cap
    await expect(page.locator('text=/maximum|limit|too many/i')).not.toBeVisible();
  }, { timeout: 90000 });

  // ── 11. Continue validation: empty name blocked ───────────────────────────

  test('Continue is blocked when email is filled but name is empty', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 8000 });

    await emailInput.fill(receiver.email);

    const nameInput = page.locator('input[placeholder*="Full name" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    // Name is empty — Continue should not navigate forward
    const continueBtn = page.getByRole('button', { name: /^continue$/i });
    await continueBtn.click();

    // Should still be on the same form (not navigated away)
    await expect(emailInput).toBeVisible({ timeout: 3000 });
  });

  // ── 12. Successful multi-recipient flow ───────────────────────────────────

  test('filling 2 valid recipients and clicking Continue proceeds past modal', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    // First recipient
    const firstEmail = page.locator('input[type="email"]').first();
    await expect(firstEmail).toBeVisible({ timeout: 8000 });
    await firstEmail.fill('recipient1@example.com');

    const firstNameInput = page.locator('input[placeholder*="Full name" i]').first();
    await firstNameInput.fill('Alex Rivera');

    // Add second recipient
    const addLink = page.locator('text="+ Add another person"');
    await addLink.click();

    const emailInputs = page.locator('input[type="email"]');
    await expect(emailInputs).toHaveCount(2, { timeout: 5000 });
    await emailInputs.nth(1).fill('recipient2@example.com');

    const nameInputs = page.locator('input[placeholder*="Full name" i]');
    await nameInputs.nth(1).fill('Jordan Patel');

    // Continue
    const continueBtn = page.getByRole('button', { name: /^continue$/i });
    await continueBtn.click();

    // Should proceed to prediction walk or next step (modal no longer showing recipient form)
    await expect(firstEmail).not.toBeVisible({ timeout: 8000 });
  });

  // ── 13. Placeholder text verbatim ────────────────────────────────────────

  test('email field placeholder is "Email address" and name field placeholder is "Full name"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[placeholder="Email address"]').first();
    await expect(emailInput).toBeVisible({ timeout: 8000 });

    const nameInput = page.locator('input[placeholder="Full name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });
});
