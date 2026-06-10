/**
 * @file p904-explain-back-accessibility.spec.ts
 * @description P904 Accessibility tests — explain-back capture panel and view page
 *
 * Tests:
 * - Both affordances are keyboard reachable via Tab on the results page
 * - Capture panel recording controls have correct ARIA (min-h-[44px] touch targets)
 * - View focus page: FocusHeader back button is first in tab order
 * - Recording state announces via aria-live or role="status"
 * - "Prefer to type?" fallback is keyboard accessible
 * - The word "paraphrase" does not appear in any ARIA label
 *
 * NOTE: Tests marked [EXPECTED-FAIL until /dev] target components not yet built.
 * They will fail until ExplainBackCapturePanel and ExplainBackViewPage are implemented.
 * Run them as the canary after /dev to confirm a11y requirements are met.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from '../helpers/test-user';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';

test.describe('P904: Explain-back accessibility', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  let sender: TestUser;
  let receiver: TestUser;
  let letterId: string;
  let deliveryId: string;
  let storyId: string;
  let pointId: string;
  let docId: string;
  let explainBackId: string | undefined;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P904 A11y Sender' });
    receiver = await createTestUser({ name: 'P904 A11y Receiver' });

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P904 a11y test doc', owner_id: sender.user.id })
      .select('id')
      .single();
    if (docError) throw new Error(`Doc creation failed: ${docError.message}`);
    docId = doc!.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P904 A11y Story',
      content: 'Accessibility test story content.',
    });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, {
      statement: 'P904 a11y test point statement',
      visibility: 'public',
    });
    pointId = point.id;

    const { data: versionRow, error: versionError } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .limit(1)
      .single();
    if (versionError) throw new Error(`Version lookup failed: ${versionError.message}`);

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    await createTestStorySnapshot(letterId, storyId, versionRow.id, {
      position: 0,
      pointConfig: {
        storyTitle: 'P904 A11y Story',
        storyText: 'Accessibility test story content.',
        points: [{ id: pointId, text: 'P904 a11y test point statement', authorPosition: null }],
      },
    });

    const delivery = await createTestDelivery(letterId, {
      receiverEmail: receiver.email,
      receiverProfileId: receiver.user.id,
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    deliveryId = delivery.id;

    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (explainBackId) {
      await supabaseAdmin.from('story_explain_backs').delete().eq('id', explainBackId);
    }
    await deleteTestLetter(letterId);
    await deleteTestStory(storyId);
    await deleteTestPoint(pointId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await deleteTestUser(receiver.user.id);
    await deleteTestUser(sender.user.id);
  });

  // ── Results page affordances — keyboard reachable ─────────────────────────

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] "Explain back what you understood" CTA is keyboard reachable (Tab)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Tab through interactive elements until we find the CTA or exhaust 20 tabs
    let found = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return { text: el?.textContent?.trim(), role: el?.getAttribute('role'), tagName: el?.tagName };
      });
      if (focused.text?.includes('Explain back what you understood')) {
        found = true;
        break;
      }
    }
    expect(found, '"Explain back what you understood" CTA is not keyboard reachable').toBe(true);
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] "Explain your position" affordance is keyboard reachable (Tab)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    let found = false;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const text = await page.evaluate(() => document.activeElement?.textContent?.trim());
      if (text?.includes('Explain your position')) {
        found = true;
        break;
      }
    }
    expect(found, '"Explain your position" affordance is not keyboard reachable').toBe(true);
  });

  // ── Capture panel interactive controls ────────────────────────────────────

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] capture panel CTA meets min-h-[44px] touch target (WCAG 2.5.8)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // TODO(/dev): confirm selector once ExplainBackCapturePanel exists
    const ctaButton = page.getByRole('button', { name: 'Explain back what you understood' });
    await expect(ctaButton).toBeVisible({ timeout: 10000 });

    const boundingBox = await ctaButton.boundingBox();
    expect(boundingBox?.height, 'CTA button height must be >= 44px for touch accessibility').toBeGreaterThanOrEqual(44);
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] "Prefer to type?" link/button is keyboard accessible in idle state', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Explain back what you understood' }).click();

    // "Prefer to type?" should be focusable
    const typeBtn = page.getByRole('button', { name: /prefer to type/i });
    await expect(typeBtn).toBeVisible({ timeout: 5000 });
    await typeBtn.focus();
    const isFocused = await typeBtn.evaluate(el => el === document.activeElement);
    expect(isFocused, '"Prefer to type?" should be focusable').toBe(true);
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] no UI element contains the word "paraphrase" (copy rule ARIA check)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Check all visible text content and ARIA labels for "paraphrase"
    // Spec Copy rules: "User-facing verb is 'explain back' / 'explanation,' never 'paraphrase'"
    const pageContent = await page.evaluate(() => {
      const allText = document.body.innerText;
      const ariaLabels = Array.from(document.querySelectorAll('[aria-label]'))
        .map(el => el.getAttribute('aria-label') ?? '');
      return { pageText: allText, ariaLabels };
    });

    expect(
      pageContent.pageText.toLowerCase(),
      'The word "paraphrase" must not appear in user-facing UI text'
    ).not.toContain('paraphrase');
    for (const label of pageContent.ariaLabels) {
      expect(
        label.toLowerCase(),
        `ARIA label "${label}" contains forbidden word "paraphrase"`
      ).not.toContain('paraphrase');
    }
  });

  // ── View focus page — FocusHeader back button is first in tab order ───────

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] ExplainBackViewPage: FocusHeader back button is first interactive element', async ({ page }) => {
    // Seed an explain-back for the view page
    const { data: eb, error } = await supabaseAdmin
      .from('story_explain_backs')
      .insert({
        letter_id: letterId,
        story_id: storyId,
        delivery_id: deliveryId,
        recorder_id: receiver.user.id,
        medium: 'text',
        text_fallback: 'A11y test explain-back.',
      })
      .select('id')
      .single();
    if (error) throw new Error(`Explain-back seeding failed: ${error.message}`);
    explainBackId = eb!.id;

    await setTestSession(page, sender.email);
    // TODO(/dev): confirm route once ExplainBackViewPage is registered in App.tsx
    await page.goto(`/explain-back/${explainBackId}`);
    await page.waitForLoadState('networkidle');

    // First Tab from body should land on the back button (FocusHeader is the first element)
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => ({
      text: document.activeElement?.textContent?.trim(),
      ariaLabel: document.activeElement?.getAttribute('aria-label'),
      tagName: document.activeElement?.tagName,
    }));

    // Back button should be first reachable interactive element
    const isBackButton = (firstFocused.ariaLabel?.toLowerCase().includes('back')) ||
      (firstFocused.text?.toLowerCase().includes('back'));
    expect(isBackButton, `Expected first Tab to land on back button, got: ${JSON.stringify(firstFocused)}`).toBe(true);
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] ExplainBackViewPage: audio player has accessible controls', async ({ page }) => {
    // Seed an audio explain-back (only audio player a11y test)
    let audioExplainBackId: string | undefined;
    try {
      const { data: eb, error } = await supabaseAdmin
        .from('story_explain_backs')
        .upsert({
          letter_id: letterId,
          story_id: storyId,
          delivery_id: deliveryId,
          recorder_id: receiver.user.id,
          medium: 'audio',
          audio_storage_path: `gs://claritypledge-explain-backs/${deliveryId}/${storyId}.webm`,
        }, { onConflict: 'delivery_id,story_id' })
        .select('id')
        .single();
      if (error) throw new Error(`Audio explain-back seeding failed: ${error.message}`);
      audioExplainBackId = eb!.id;

      await setTestSession(page, sender.email);
      await page.goto(`/explain-back/${audioExplainBackId}`);
      await page.waitForLoadState('networkidle');

      // The <audio controls> element should be present and accessible
      // Spec Component Strategy: "plain <audio controls>" for the view page
      // TODO(/dev): confirm once ExplainBackViewPage exists
      const audioPlayer = page.locator('audio[controls]');
      await expect(audioPlayer).toBeVisible({ timeout: 10000 });
    } finally {
      if (audioExplainBackId) {
        await supabaseAdmin.from('story_explain_backs').delete().eq('id', audioExplainBackId);
      }
    }
  });
});
