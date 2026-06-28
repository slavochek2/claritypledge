/**
 * @file p581-letter-composition.spec.ts
 * @description P661: Letter Composition — prediction walk flow
 *
 * Tests the redesigned composition flow (P661 replaces P581 wizard):
 * 1. "Prepare a Letter" opens receiver modal (not wizard navigation)
 * 2. Modal: mode selector ("Specific people" / "Anyone with a link")
 * 3. Prediction walk: one story at a time using LiveStoryCardExpanded
 * 4. RatingButtons (0-10) per story with prediction prompt
 * 5. Review screen: prediction summary + preview link + Seal & Send
 * 6. Seal confirmation: "Letter Sealed" + "Back to Doc"
 * 7. Private doc disables "Anyone with a link" in modal
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

test.describe('P661: Letter Composition — prediction walk flow', () => {
  test.describe.configure({ timeout: 45000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P661 Compose Sender' });
    receiver = await createTestUser({ name: 'P661 Compose Receiver' });

    // Create a public doc with 2 stories
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P661 Composition Test Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    for (let i = 0; i < 2; i++) {
      const story = await createTestStory(sender.user.id, {
        title: `P661 Composition Story ${i + 1}`,
        content: `Test story content for P661 composition test ${i + 1}.`,
      });
      storyIds.push(story.id);

      await supabaseAdmin
        .from('doc_stories')
        .insert({ doc_id: docId, story_id: story.id, position: i });
    }
  });

  test.afterAll(async () => {
    // Clean up letters created during tests
    await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', docId);
    // Clean doc_stories
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    // Clean stories
    for (const id of storyIds) await deleteTestStory(id);
    // Clean doc
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    // Clean users
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  // ── 1. Entry point: "Prepare a Letter" opens modal ─────────────────────

  test('"Prepare a Letter" on doc page opens receiver modal, not wizard navigation', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Click "Prepare a Letter" button
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();

    // Should open a modal, NOT navigate away from the doc page
    // The modal heading "Who is your letter for?" should appear
    await expect(
      page.locator('text=Who is your letter for?')
    ).toBeVisible({ timeout: 5000 });

    // URL should still be the doc page (not /compose)
    expect(page.url()).toContain(`/d/${docId}`);
  });

  // ── 2. Modal content ───────────────────────────────────────────────────

  test('modal shows "Who is your letter for?" heading', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();

    const heading = page.locator('text=Who is your letter for?');
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test('modal shows mode selector: "Specific people" and "Anyone with a link"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();

    await expect(
      page.locator('text=Specific people')
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator('text=Anyone with a link')
    ).toBeVisible({ timeout: 5000 });
  });

  test('selecting "Specific people" shows email input in modal', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();

    // Click "Specific people"
    await page.locator('text=Specific people').first().click();

    // Email input should appear
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
  });

  // ── 3. Private doc disables 1-to-many ──────────────────────────────────

  test('private doc disables "Anyone with a link" in modal', async ({ page }) => {
    // Create a private doc
    const { data: privateDoc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P661 Private Composition Doc',
        visibility: 'private',
      })
      .select('id')
      .single();

    if (!privateDoc) {
      test.skip();
      return;
    }

    // Private doc needs at least one story for "Prepare a Letter" to appear
    const privateStory = await createTestStory(sender.user.id, {
      title: 'P661 Private Doc Story',
      content: 'Test story for private doc composition test.',
    });
    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: privateDoc.id, story_id: privateStory.id, position: 0 });

    try {
      await setTestSession(page, sender.email);
      await page.goto(`/d/${privateDoc.id}`);
      await page.waitForLoadState('networkidle');

      const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
        .or(page.locator('a:has-text("Prepare a Letter")'));
      await expect(prepareBtn).toBeVisible({ timeout: 10000 });
      await prepareBtn.click();

      // "Anyone with a link" should be disabled for private docs
      const linkOption = page.locator('text=Anyone with a link').first();
      await expect(linkOption).toBeVisible({ timeout: 5000 });

      // Check if the button/card containing it is disabled
      const parentButton = linkOption.locator('xpath=ancestor::button').first();
      const isDisabled = await parentButton.isDisabled().catch(() => false);
      const hasAriaDisabled = await parentButton.getAttribute('aria-disabled')
        .then(v => v === 'true')
        .catch(() => false);

      expect(isDisabled || hasAriaDisabled).toBeTruthy();
    } finally {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', privateDoc.id);
      await deleteTestStory(privateStory.id);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', privateDoc.id);
    }
  });

  // ── 4. Prediction walk — full-screen sequential flow ───────────────────

  test('after modal submit, enters full-screen prediction walk', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Open modal
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();

    // Select "Anyone with a link" (simpler — no email needed)
    await page.locator('text=Anyone with a link').first().click();

    // Submit the modal (Continue / Next / Start)
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Should now be in prediction walk — look for story progress indicator
    await expect(
      page.locator('text=/story 1 of/i').or(page.locator('text=/1 of 2/i'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('prediction walk shows one story at a time (story 1 visible, story 2 not)', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Open modal → select mode → submit
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Story 1 content should be visible
    await expect(
      page.locator('text=P661 Composition Story 1').or(
        page.locator('text=Test story content for P661 composition test 1')
      )
    ).toBeVisible({ timeout: 10000 });

    // Story 2 content should NOT be visible yet
    await expect(
      page.locator('text=P661 Composition Story 2')
    ).not.toBeVisible({ timeout: 3000 });
  });

  test('prediction walk displays LiveStoryCardExpanded', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Open modal → select mode → submit
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // LiveStoryCardExpanded should be rendered
    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });
  });

  test('prediction walk shows prompt "How well do you believe [Name] understands your intended meaning?"', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Open modal → select mode → submit
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Prediction prompt should contain the expected text
    await expect(
      page.locator('text=/how well do you believe/i')
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.locator('text=/understand your intended meaning/i')
    ).toBeVisible({ timeout: 10000 });
  });

  test('RatingButtons (0-10) visible during prediction walk', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Open modal → select mode → submit
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Rating buttons (0-10) should be visible
    const ratingButtons = page.locator('[data-testid*="rating"] button, [role="group"] button');
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });

    // Should have at least 11 buttons (0 through 10)
    const count = await ratingButtons.count();
    expect(count).toBeGreaterThanOrEqual(11);
  });

  test('after rating + "Continue", advances to story 2 of N', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Open modal → select mode → submit
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Wait for prediction walk to load
    await expect(
      page.locator('[data-testid="live-story-card-expanded"]')
    ).toBeVisible({ timeout: 10000 });

    // Click a rating (e.g., 7)
    const ratingButtons = page.locator('[data-testid*="rating"] button, [role="group"] button');
    await expect(ratingButtons.first()).toBeVisible({ timeout: 5000 });
    // Click the 8th button (index 7 = rating value 7)
    await ratingButtons.nth(7).click();

    // Click "Continue"
    const nextBtn = page.getByRole('button', { name: /continue/i });
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    await nextBtn.click();

    // Story 2 should now be visible
    await expect(
      page.locator('text=P661 Composition Story 2').or(
        page.locator('text=Test story content for P661 composition test 2')
      )
    ).toBeVisible({ timeout: 10000 });

    // Progress should show story 2
    await expect(
      page.locator('text=/story 2 of/i').or(page.locator('text=/2 of 2/i'))
    ).toBeVisible({ timeout: 5000 });
  });

  // ── 5. Review screen ──────────────────────────────────────────────────

  test('after last story, shows review screen with prediction summary', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Open modal → select mode → submit
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Story 1: rate and advance
    const ratingButtons = page.locator('[data-testid*="rating"] button, [role="group"] button');
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(7).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Story 2: rate (last story — should lead to review)
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(5).click();

    // After last story, look for a finish/review button
    const finishBtn = page.getByRole('button', { name: /review|finish|next/i }).first();
    await expect(finishBtn).toBeVisible({ timeout: 5000 });
    await finishBtn.click();

    // Review screen should show "Ready to send" heading
    await expect(
      page.getByRole('heading', { name: /ready to send/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('review screen shows "Preview as [Name]" link', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Full flow: modal → predictions → review
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Rate story 1 and advance
    const ratingButtons = page.locator('[data-testid*="rating"] button, [role="group"] button');
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(7).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Rate story 2 and advance to review
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(5).click();
    const finishBtn = page.getByRole('button', { name: /review|finish|next/i }).first();
    await expect(finishBtn).toBeVisible({ timeout: 5000 });
    await finishBtn.click();

    // "Preview as ..." link should be visible
    await expect(
      page.locator('text=/preview as/i').or(page.locator('a[href*="preview"]'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('review screen shows "Seal & Send" button', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Full flow: modal → predictions → review
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Rate story 1 and advance
    const ratingButtons = page.locator('[data-testid*="rating"] button, [role="group"] button');
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(7).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Rate story 2 and advance to review
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(5).click();
    const finishBtn = page.getByRole('button', { name: /review|finish|next/i }).first();
    await expect(finishBtn).toBeVisible({ timeout: 5000 });
    await finishBtn.click();

    // "Seal & Send" button should be visible
    await expect(
      page.getByRole('button', { name: /seal.*send/i })
    ).toBeVisible({ timeout: 10000 });
  });

  // ── 6. Seal & Send → Confirmation ──────────────────────────────────────

  test('"Seal & Send" shows confirmation with "Letter Sealed" text', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Full flow: modal → predictions → review → seal
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Rate story 1 and advance
    const ratingButtons = page.locator('[data-testid*="rating"] button, [role="group"] button');
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(7).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Rate story 2 and advance to review
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(5).click();
    const finishBtn = page.getByRole('button', { name: /review|finish|next/i }).first();
    await expect(finishBtn).toBeVisible({ timeout: 5000 });
    await finishBtn.click();

    // Click "Seal & Send"
    const sealBtn = page.getByRole('button', { name: /seal.*send/i });
    await expect(sealBtn).toBeVisible({ timeout: 10000 });
    await sealBtn.click();

    // Confirmation should show "Letter Sealed"
    await expect(
      page.getByRole('heading', { name: 'Letter Sealed' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('confirmation has "Back to Doc" link', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');

    // Full flow: modal → predictions → review → seal → confirmation
    const prepareBtn = page.getByRole('button', { name: /prepare a letter/i })
      .or(page.locator('a:has-text("Prepare a Letter")'));
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();
    await page.locator('text=Anyone with a link').first().click();
    const continueBtn = page.getByRole('button', { name: /continue|next|start/i }).first();
    await expect(continueBtn).toBeVisible({ timeout: 5000 });
    await continueBtn.click();

    // Rate story 1 and advance
    const ratingButtons = page.locator('[data-testid*="rating"] button, [role="group"] button');
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(7).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Rate story 2 and advance to review
    await expect(ratingButtons.first()).toBeVisible({ timeout: 10000 });
    await ratingButtons.nth(5).click();
    const finishBtn = page.getByRole('button', { name: /review|finish|next/i }).first();
    await expect(finishBtn).toBeVisible({ timeout: 5000 });
    await finishBtn.click();

    // Seal
    const sealBtn = page.getByRole('button', { name: /seal.*send/i });
    await expect(sealBtn).toBeVisible({ timeout: 10000 });
    await sealBtn.click();

    // Wait for confirmation
    await expect(page.getByRole('heading', { name: 'Letter Sealed' })).toBeVisible({ timeout: 10000 });

    // "Back to Doc" link should be visible
    const backLink = page.locator('text=Back to Doc')
      .or(page.locator('a:has-text("Back to Doc")'));
    await expect(backLink).toBeVisible({ timeout: 5000 });
  });
});
