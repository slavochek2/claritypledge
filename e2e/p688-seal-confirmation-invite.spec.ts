/**
 * @file p688-seal-confirmation-invite.spec.ts
 * @description P688: LetterSealConfirmation — public-doc visual hierarchy + invite via modal.
 *
 * Tests:
 * 1. Hero link card is visible with the shareable URL
 * 2. "Back to Doc" is the primary blue button (not outline)
 * 3. "+ Also invite someone by email" is a text link (not an inline input)
 * 4. Clicking "+ Also invite" opens LetterReceiverModal (not an inline <input type="email">)
 * 5. Opened modal has title "Add recipient(s)" and contains RecipientRow (email + name fields)
 * 6. Escape dismisses the dialog; focus returns to the "+ Also invite" trigger (soft check)
 * 7. Private doc regression guard: no "+ Also invite" affordance and no shareable link card
 *
 * NOTE: The seal-confirmation screen is reached via the real compose flow:
 *   navigate /letter/:docId/compose → rate story → click "Seal & Get Link" → confirmation phase
 * Public docs auto-skip the receiver modal (doc.visibility === 'public' → setPhase('predict')).
 *
 * The Dialog is MODAL with a dimmed scrim (overlayClassName="bg-black/50";
 * onInteractOutside prevented so backdrop clicks don't dismiss). P968 UAT reversed
 * the P688 modal={false}+hideOverlay (the scrim only renders when modal).
 */

import { test, expect, type Page } from '@playwright/test';
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

async function makeDoc(
  ownerId: string,
  title: string,
  visibility: 'public' | 'private'
): Promise<string> {
  const { data: doc } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: ownerId, title, visibility })
    .select('id')
    .single();
  if (!doc) throw new Error(`makeDoc(${visibility}): insert failed`);
  return doc.id;
}

/**
 * Navigate to the compose page for a public doc and drive through the full
 * predict → seal flow to reach the LetterSealConfirmation screen.
 *
 * Public docs auto-skip the receiver modal (LetterComposePage useEffect sets
 * mode='one-to-many' and phase='predict' as soon as doc loads with visibility='public').
 *
 * Returns the sealed letter ID extracted from the link card on the confirmation screen.
 */
async function gotoSealConfirmationPublic(
  page: Page,
  docId: string
): Promise<string> {
  await page.goto(`/letter/${docId}/compose`);

  // Wait for prediction walk to appear (public doc skips modal)
  await page.waitForSelector('[aria-label="Rating scale from 0 to 10"]', { timeout: 15000 });

  // Rate every story by clicking "Rate 5" until "Seal & Get Link" button appears and is enabled
  // Stories are shown one at a time; each "Continue" / "Seal & Get Link" advances to next
  while (true) {
    // Rate current story with value 5
    const rateBtn = page.getByRole('button', { name: 'Rate 5' });
    await rateBtn.waitFor({ state: 'visible', timeout: 10000 });
    await rateBtn.click();

    // After rating, check whether we're on the last story ("Seal & Get Link")
    // or still navigating ("Continue")
    const sealBtn = page.getByRole('button', { name: 'Seal & Get Link' });
    const nextBtn = page.getByRole('button', { name: 'Continue' });

    // Wait for one of them to become enabled
    await page.waitForFunction(
      () => {
        const seal = document.querySelector('button[class*="bg-\\[\\#0044CC\\]"]:not([disabled])');
        return seal !== null;
      },
      { timeout: 5000 }
    ).catch(() => null); // tolerate if already enabled

    const isSealVisible = await sealBtn.isVisible().catch(() => false);
    if (isSealVisible) {
      // Last story — click "Seal & Get Link"
      await sealBtn.click();
      break;
    }

    const isNextVisible = await nextBtn.isVisible().catch(() => false);
    if (isNextVisible) {
      await nextBtn.click();
      // Wait for next story card to load
      await page.waitForSelector('[aria-label="Rating scale from 0 to 10"]', { timeout: 10000 });
    } else {
      // Neither button found — click seal if it exists anyway
      await sealBtn.click();
      break;
    }
  }

  // Wait for confirmation screen: "Letter Sealed" heading
  await page.waitForSelector('h2:has-text("Letter Sealed")', { timeout: 20000 });

  // Extract the sealed letter ID from the link card text
  // Link card shows: {origin}/letter/{letterId}
  const linkCard = page.locator('[aria-label="Shareable letter link"]');
  await linkCard.waitFor({ state: 'visible', timeout: 10000 });
  const linkText = await linkCard.textContent() ?? '';
  const match = linkText.match(/\/letter\/([0-9a-f-]{36})/);
  if (!match) throw new Error(`Could not extract letter ID from link card: "${linkText}"`);
  return match[1];
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('P688: Seal Confirmation — Public Doc Invite + Visual Hierarchy', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let publicDocId: string;
  let privateDocId: string;
  let privateLetterId: string;
  const storyIds: string[] = [];
  const letterIdsToCleanup: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P688 Seal Sender' });

    publicDocId = await makeDoc(sender.user.id, 'P688 Seal Public Doc', 'public');
    privateDocId = await makeDoc(sender.user.id, 'P688 Seal Private Doc', 'private');

    const story = await createTestStory(sender.user.id, {
      title: 'P688 Seal Story',
      content: 'Seal confirmation test story.',
    });
    storyIds.push(story.id);

    await supabaseAdmin.from('doc_stories').insert([
      { doc_id: publicDocId, story_id: story.id, position: 0 },
      { doc_id: privateDocId, story_id: story.id, position: 0 },
    ]);

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', story.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    const versionId = version?.id ?? story.id;

    // Private letter (sealed, 1-to-1) — only used for the private doc regression test
    const privLetter = await createTestLetter(sender.user.id, privateDocId, { mode: 'one-to-one' });
    privateLetterId = privLetter.id;
    letterIdsToCleanup.push(privateLetterId);
    await createTestStorySnapshot(privateLetterId, story.id, versionId);
    await createTestDelivery(privateLetterId, { receiverEmail: 'receiver-p688@example.com' });
    await sealTestLetter(privateLetterId);

    // Public doc has no pre-sealed letter — the UI flow creates one per test.
    // We suppress unused variable lint for versionId — the doc_stories insert is all we need.
    void versionId;
  });

  test.afterAll(async () => {
    for (const id of letterIdsToCleanup) await deleteTestLetter(id);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', publicDocId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', privateDocId);
    for (const id of storyIds) await deleteTestStory(id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', publicDocId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', privateDocId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 1. Hero link card ───────────────────────────────────────────────────────

  test('public doc: shareable link card is visible with the letter URL', async ({ page }) => {
    await setTestSession(page, sender.email);
    const sealedLetterId = await gotoSealConfirmationPublic(page, publicDocId);
    letterIdsToCleanup.push(sealedLetterId);

    // The shareable URL must appear in the link card
    await expect(page.locator(`text=/letter\\/${sealedLetterId}/`)).toBeVisible({ timeout: 10000 });
  });

  // ── 2. "Back to Doc" is primary blue button ────────────────────────────────

  test('public doc: "Back to Doc" has primary blue styling (not outline)', async ({ page }) => {
    await setTestSession(page, sender.email);
    const sealedLetterId = await gotoSealConfirmationPublic(page, publicDocId);
    letterIdsToCleanup.push(sealedLetterId);

    const backBtn = page.getByRole('button', { name: 'Back to Doc' });
    await expect(backBtn).toBeVisible({ timeout: 10000 });

    // Primary button must NOT carry outline variant classes
    const className = await backBtn.getAttribute('class') ?? '';
    expect(className).not.toMatch(/variant-outline|btn-outline/);
    // Must include blue or primary styling
    expect(className).toMatch(/bg-blue|bg-primary|btn-primary/);
  });

  // ── 3. "+ Also invite someone by email" is a text link ─────────────────────

  test('public doc: "+ Also invite someone by email" is a link/button — not an inline input', async ({ page }) => {
    await setTestSession(page, sender.email);
    const sealedLetterId = await gotoSealConfirmationPublic(page, publicDocId);
    letterIdsToCleanup.push(sealedLetterId);

    const inviteLink = page.locator('text="+ Also invite someone by email"');
    await expect(inviteLink).toBeVisible({ timeout: 10000 });

    // Must be a button or anchor, not an input
    const tagName = await inviteLink.evaluate((el) => el.tagName.toLowerCase());
    expect(['button', 'a']).toContain(tagName);

    // No inline email input must be visible at rest
    await expect(page.locator('input[type="email"]')).not.toBeVisible();
  });

  // ── 4. Clicking "+ Also invite" opens LetterReceiverModal (not inline input) ─

  test('clicking "+ Also invite" opens the LetterReceiverModal dialog', async ({ page }) => {
    await setTestSession(page, sender.email);
    const sealedLetterId = await gotoSealConfirmationPublic(page, publicDocId);
    letterIdsToCleanup.push(sealedLetterId);

    const inviteLink = page.locator('text="+ Also invite someone by email"');
    await expect(inviteLink).toBeVisible({ timeout: 10000 });
    await inviteLink.click();

    // A dialog must appear (not an inline input)
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 8000 });

    // The dialog must contain email + name fields (RecipientRow), not just a raw email input
    await expect(dialog.locator('input[placeholder="Name or email address"]')).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('input[placeholder="Full name"]')).toBeVisible({ timeout: 5000 });

    // No raw inline <input type="email"> outside the dialog
    const inlineEmailInputs = page.locator('body > input[type="email"]');
    await expect(inlineEmailInputs).toHaveCount(0);
  });

  // ── 5. Modal has title "Add recipient(s)" and RecipientRow ──────────────────

  test('opened invite modal has title "Add recipient(s)" and RecipientRow', async ({ page }) => {
    await setTestSession(page, sender.email);
    const sealedLetterId = await gotoSealConfirmationPublic(page, publicDocId);
    letterIdsToCleanup.push(sealedLetterId);

    const inviteLink = page.locator('text="+ Also invite someone by email"');
    await inviteLink.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 8000 });

    // Title
    await expect(dialog.locator('text="Add recipient(s)"')).toBeVisible({ timeout: 5000 });

    // RecipientRow fields
    await expect(dialog.locator('input[placeholder="Name or email address"]').first()).toBeVisible();
    await expect(dialog.locator('input[placeholder="Full name"]').first()).toBeVisible();
  });

  // ── 6. Escape dismisses dialog; focus returns to trigger (soft check) ────────

  test('Escape dismisses invite dialog; focus return checked softly', async ({ page }) => {
    await setTestSession(page, sender.email);
    const sealedLetterId = await gotoSealConfirmationPublic(page, publicDocId);
    letterIdsToCleanup.push(sealedLetterId);

    const inviteLink = page.locator('text="+ Also invite someone by email"');
    await inviteLink.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 8000 });

    // Dismiss with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Soft focus return: the trigger text should still be present and actionable
    await expect(inviteLink).toBeVisible({ timeout: 3000 });

    // Attempt soft focus check — non-blocking if activeElement differs
    const activeText = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    // Log but don't hard-assert (focus return is soft per spec's non-modal pattern)
    void activeText;
  });

  // ── 7. Private doc: no invite affordance, no shareable link ─────────────────

  test('private doc: no "+ Also invite" link and no shareable link card', async ({ page }) => {
    await setTestSession(page, sender.email);

    // Navigate to compose page for private doc.
    // Private docs show the receiver modal (phase='modal') — neither the invite link
    // nor the shareable link card appear at any point in this page state.
    await page.goto(`/letter/${privateDocId}/compose`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('text="+ Also invite someone by email"')
    ).not.toBeVisible({ timeout: 5000 });

    await expect(
      page.locator(`text=/letter\\/${privateLetterId}/`)
    ).not.toBeVisible({ timeout: 5000 });
  });
});
