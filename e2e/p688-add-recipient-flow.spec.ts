/**
 * @file p688-add-recipient-flow.spec.ts
 * @description P688: Sent tab "Add recipient(s)" — RecipientRow-based multi-recipient flow.
 *
 * Tests:
 * 1. Modal opens with title "Add recipient(s)"
 * 2. First row has email + name fields (RecipientRow structure)
 * 3. Old flat-state DOM is absent (no emailsInput / receiverName single-input)
 * 4. Submit button label: "Send Invitation" (1 row) → "Send 2 Invitations" after adding second row
 * 5. "+ Add another person" appends a new row
 * 6. Email lookup success: name locks, hint "Using their registered name"
 * 7. Email lookup miss: hint "No account — they'll be invited to join"
 * 8. Footer hint text verbatim
 * 9. All-fail path: modal stays open, toast "No invitations sent"
 *
 * Uses a sealed letter in the sender's Sent tab. The modal is opened via the ⋯ dropdown.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makePublicDoc(ownerId: string, title: string): Promise<string> {
  const { data: doc } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: ownerId, title, visibility: 'public' })
    .select('id')
    .single();
  if (!doc) throw new Error('makePublicDoc: insert failed');
  return doc.id;
}

async function openAddRecipientModal(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/letters?tab=sent');
  await page.waitForLoadState('networkidle');

  // Open the ⋯ dropdown and click "Add recipient(s)"
  const moreBtn = page.getByRole('button', { name: /actions for/i }).first();
  await expect(moreBtn).toBeVisible({ timeout: 10000 });
  await moreBtn.click();

  const addItem = page.getByRole('menuitem', { name: /add recipient\(s\)/i });
  await expect(addItem).toBeVisible({ timeout: 5000 });
  await addItem.click();

  // Wait for dialog to open
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 8000 });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('P688: Add Recipient Flow — Sent Tab', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let knownUser: TestUser;
  let docId: string;
  let letterId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P688 Sender' });
    knownUser = await createTestUser({ name: 'P688 Known User' });

    docId = await makePublicDoc(sender.user.id, 'P688 Add Recipient Doc');

    const story = await createTestStory(sender.user.id, {
      title: 'P688 Add Recipient Story',
      content: 'Test story for P688.',
    });
    storyIds.push(story.id);

    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId,
      story_id: story.id,
      position: 0,
    });

    // Get story version
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', story.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    const versionId = version?.id ?? story.id;

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;
    await createTestStorySnapshot(letterId, story.id, versionId);
    await createTestDelivery(letterId, { receiverEmail: 'initial@example.com' });
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    await deleteTestLetter(letterId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    for (const id of storyIds) await deleteTestStory(id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (knownUser?.user?.id) await deleteTestUser(knownUser.user.id);
  });

  // ── 1. Modal title ──────────────────────────────────────────────────────────

  test('modal opens with title "Add recipient(s)"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    await expect(page.getByRole('dialog').getByText('Add recipient(s)')).toBeVisible({ timeout: 5000 });
  });

  // ── 2. RecipientRow structure ───────────────────────────────────────────────

  test('first row has email field and full name field (RecipientRow structure)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    const dialog = page.getByRole('dialog');

    const emailInput = dialog.locator('input[placeholder="Email address"]').first();
    await expect(emailInput).toBeVisible({ timeout: 5000 });

    const nameInput = dialog.locator('input[placeholder="Full name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });

  // ── 3. Old flat-state DOM is absent ────────────────────────────────────────

  test('old single-input DOM (emailsInput / receiverName) is absent', async ({ page }) => {
    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    const dialog = page.getByRole('dialog');

    // Old flat state used a textarea for comma-separated emails — must not exist
    await expect(dialog.locator('textarea')).toHaveCount(0);

    // There must be exactly one email input (the RecipientRow), not a multi-email textarea
    const emailInputs = dialog.locator('input[type="email"], input[placeholder="Email address"]');
    await expect(emailInputs).toHaveCount(1, { timeout: 5000 });
  });

  // ── 4. Submit label: 1 row → "Send Invitation"; 2 rows → "Send 2 Invitations" ─

  test('submit button reads "Send Invitation" with 1 row', async ({ page }) => {
    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Send Invitation' })).toBeVisible({ timeout: 5000 });
  });

  test('submit button reads "Send 2 Invitations" after adding a second row', async ({ page }) => {
    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    const dialog = page.getByRole('dialog');

    // Fill the first row email (needed so it counts as a filled row)
    const firstEmail = dialog.locator('input[type="email"]').first();
    await firstEmail.fill('first@example.com');
    const firstNameInput = dialog.locator('input[placeholder="Full name"]').first();
    await firstNameInput.fill('First Person');

    const addLink = dialog.locator('text="+ Add another person"');
    await expect(addLink).toBeVisible({ timeout: 5000 });
    await addLink.click();

    // Fill second row too
    const emailInputs = dialog.locator('input[type="email"]');
    await expect(emailInputs).toHaveCount(2, { timeout: 5000 });
    await emailInputs.nth(1).fill('second@example.com');
    const nameInputs = dialog.locator('input[placeholder="Full name"]');
    await nameInputs.nth(1).fill('Second Person');

    await expect(dialog.getByRole('button', { name: 'Send 2 Invitations' })).toBeVisible({ timeout: 5000 });
  });

  // ── 5. "+ Add another person" appends new row ───────────────────────────────

  test('"+ Add another person" appends a new RecipientRow', async ({ page }) => {
    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    const dialog = page.getByRole('dialog');

    const addLink = dialog.locator('text="+ Add another person"');
    await expect(addLink).toBeVisible({ timeout: 5000 });
    await addLink.click();

    const emailInputs = dialog.locator('input[type="email"]');
    await expect(emailInputs).toHaveCount(2, { timeout: 5000 });
  });

  // ── 6. Email lookup success ─────────────────────────────────────────────────

  test('known email triggers lookup and shows hint "Using their registered name"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    const dialog = page.getByRole('dialog');
    const emailInput = dialog.locator('input[type="email"]').first();

    await emailInput.fill(knownUser.email);

    // Wait for debounce (400ms) + lookup
    await expect(
      dialog.locator('text="Using their registered name"')
    ).toBeVisible({ timeout: 8000 });
  });

  // ── 7. Email lookup miss ────────────────────────────────────────────────────

  test('unknown email shows hint "No account — they\'ll be invited to join"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    const dialog = page.getByRole('dialog');
    const emailInput = dialog.locator('input[type="email"]').first();

    await emailInput.fill('unknown-p688@example.com');

    await expect(
      dialog.locator("text=\"No account \u2014 they\u2019ll be invited to join\"")
    ).toBeVisible({ timeout: 8000 });
  });

  // ── 8. Footer hint verbatim ─────────────────────────────────────────────────

  test('footer hint reads "Each person receives their own personal invitation."', async ({ page }) => {
    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.locator('text="Each person receives their own personal invitation."')
    ).toBeVisible({ timeout: 5000 });
  });

  // ── 9. All-fail path via RPC intercept ──────────────────────────────────────

  test('all-fail: modal stays open, toast "No invitations sent" visible', async ({ page }) => {
    // Intercept the add_recipient_to_sealed_letter RPC and force it to fail
    await page.route('**/rest/v1/rpc/add_recipient_to_sealed_letter', (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Simulated failure' }),
      });
    });

    await setTestSession(page, sender.email);
    await openAddRecipientModal(page);

    const dialog = page.getByRole('dialog');

    const emailInput = dialog.locator('input[type="email"]').first();
    await emailInput.fill('fail-test@example.com');
    const nameInput = dialog.locator('input[placeholder="Full name"]').first();
    await nameInput.fill('Fail Test');

    const submitBtn = dialog.getByRole('button', { name: 'Send Invitation' });
    await submitBtn.click();

    // Modal must remain open
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Toast must say "No invitations sent"
    await expect(page.locator('text="No invitations sent"')).toBeVisible({ timeout: 8000 });
  });
});
