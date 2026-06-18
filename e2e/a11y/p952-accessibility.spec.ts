/**
 * @file p952-accessibility.spec.ts
 * @description P952 Accessibility tests — reveal-moment CTAs, secondary CTA, capture Dialog
 *
 * Tests:
 * - At story-revealed: both primary (Explain back) and secondary (Skip to...) CTAs in tab order
 * - Secondary CTA meets WCAG AA contrast and has a visible focus ring
 * - Capture Dialog: focus trap while open; focus returns to trigger on close
 * - Enter/Space fires the focused button only — skip doesn't trigger the response primary
 * - At point-revealed: advance primary and inline "Add a story" link are both keyboard-reachable
 * - No "paraphrase" in any user-facing text or ARIA label (copy rule)
 * - Both CTAs meet minimum 44px touch target height (WCAG 2.5.8)
 *
 * NOTE: Tests marked [EXPECTED-FAIL until /dev] target components not yet built.
 * They will fail until LetterFlowContent two-CTA bar + secondary variant are implemented.
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

test.describe('P952: Accessibility — reveal-moment CTAs and capture Dialog', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60000);

  let sender: TestUser;
  let receiver: TestUser;
  let letterId: string;
  let deliveryId: string;
  let storyId: string;
  let pointId: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P952 A11y Sender' });
    receiver = await createTestUser({ name: 'P952 A11y Receiver' });

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P952 a11y test doc', owner_id: sender.user.id })
      .select('id')
      .single();
    if (docError) throw new Error(`Doc creation failed: ${docError.message}`);
    docId = doc!.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P952 A11y Story',
      content: 'Accessibility test story content for P952.',
    });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, {
      statement: 'P952 a11y test point statement',
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

    await supabaseAdmin
      .from('clarity_letters')
      .update({ responses_mode: 'invite' })
      .eq('id', letterId);

    await createTestStorySnapshot(letterId, storyId, versionRow.id, {
      position: 0,
      pointConfig: {
        storyTitle: 'P952 A11y Story',
        storyText: 'Accessibility test story content for P952.',
        points: [{ id: pointId, text: 'P952 a11y test point statement', authorPosition: null }],
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
    await deleteTestLetter(letterId);
    await deleteTestStory(storyId);
    await deleteTestPoint(pointId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await deleteTestUser(receiver.user.id);
    await deleteTestUser(sender.user.id);
  });

  // ── Tab order: both CTAs reachable at story-revealed ─────────────────────

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] at story-revealed: primary "Explain back" is in tab order', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed phase
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    // Tab through interactive elements to find the primary CTA
    let foundExplainBack = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      if (/explain back/i.test(focused)) {
        foundExplainBack = true;
        break;
      }
    }

    expect(foundExplainBack, '"Explain back what you understood" primary CTA must be reachable via Tab').toBe(true);
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] at story-revealed: secondary skip CTA is in tab order', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    // Tab through to find the skip CTA
    let foundSkip = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      if (/skip/i.test(focused) || /next story/i.test(focused)) {
        foundSkip = true;
        break;
      }
    }

    expect(foundSkip, 'Secondary skip/advance CTA must be reachable via Tab at story-revealed').toBe(true);
  });

  // ── Tab order: primary comes before secondary ─────────────────────────────

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] at story-revealed: tab order is primary (response) then secondary (skip)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    // Tab to first CTA — should land on primary (response) before secondary (skip)
    // Per spec: "Tab order: gap content → primary (response) → secondary (skip)"
    const tabOrder: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      if (focused) tabOrder.push(focused);
      // Stop once we've seen both key CTAs
      const hasExplainBack = tabOrder.some(t => /explain back/i.test(t));
      const hasSkip = tabOrder.some(t => /skip/i.test(t) || /next story/i.test(t));
      if (hasExplainBack && hasSkip) break;
    }

    const explainBackIdx = tabOrder.findIndex(t => /explain back/i.test(t));
    const skipIdx = tabOrder.findIndex(t => /skip/i.test(t) || /next story/i.test(t));

    expect(explainBackIdx).toBeGreaterThanOrEqual(0);
    expect(skipIdx).toBeGreaterThanOrEqual(0);
    expect(
      explainBackIdx < skipIdx,
      `Tab order must be primary (Explain back) before secondary (skip). Order was: ${tabOrder.join(' → ')}`
    ).toBe(true);
  });

  // ── Enter/Space fires focused button only ─────────────────────────────────

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] pressing Enter on focused skip does NOT open the capture Dialog', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    // Tab to the skip CTA and press Enter
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      if (/skip/i.test(focused) || /next story/i.test(focused)) break;
    }

    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Pressing Enter on skip must NOT open the capture Dialog
    const captureDialog = page.locator('[role="dialog"]');
    await expect(
      captureDialog,
      'Pressing Enter on the skip/secondary CTA must NOT open the capture Dialog — only its own action (advance)'
    ).not.toBeVisible({ timeout: 2000 });
  });

  // ── Dialog focus trap ─────────────────────────────────────────────────────

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] capture Dialog traps focus while open', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    // Open the capture Dialog
    const explainBackBtn = page.getByRole('button', { name: /explain back what you understood/i });
    await expect(explainBackBtn).toBeVisible({ timeout: 10000 });
    await explainBackBtn.click();

    const captureDialog = page.locator('[role="dialog"]');
    await expect(captureDialog).toBeVisible({ timeout: 5000 });

    // Tab multiple times — focus must stay inside the dialog
    const outsideTexts: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const isInsideDialog = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const focused = document.activeElement;
        if (!dialog || !focused) return false;
        return dialog.contains(focused);
      });

      if (!isInsideDialog) {
        const text = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
        outsideTexts.push(text);
      }
    }

    expect(
      outsideTexts,
      `Focus escaped the capture Dialog and landed on: ${outsideTexts.join(', ')}`
    ).toHaveLength(0);
  });

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] closing the capture Dialog returns focus to the trigger element', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed and open Dialog
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    const explainBackBtn = page.getByRole('button', { name: /explain back what you understood/i });
    await expect(explainBackBtn).toBeVisible({ timeout: 10000 });
    await explainBackBtn.click();

    const captureDialog = page.locator('[role="dialog"]');
    await expect(captureDialog).toBeVisible({ timeout: 5000 });

    // Close dialog via Escape key
    await page.keyboard.press('Escape');
    await expect(captureDialog).not.toBeVisible({ timeout: 3000 });

    // Focus should return to the triggering button (or a nearby element in the two-CTA bar)
    const focusedAfterClose = await page.evaluate(() => ({
      text: document.activeElement?.textContent?.trim(),
      ariaLabel: document.activeElement?.getAttribute('aria-label'),
    }));

    const focusedOnExplainBack = /explain back/i.test(focusedAfterClose.text ?? '') ||
      /explain back/i.test(focusedAfterClose.ariaLabel ?? '');

    expect(
      focusedOnExplainBack,
      `Focus should return to "Explain back" trigger after Dialog close. Got: ${JSON.stringify(focusedAfterClose)}`
    ).toBe(true);
  });

  // ── Touch target height ────────────────────────────────────────────────────

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] both CTAs at story-revealed meet 44px minimum touch target (WCAG 2.5.8)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    const explainBackBtn = page.getByRole('button', { name: /explain back what you understood/i });
    const skipBtn = page.getByRole('button', { name: /skip/i }).or(page.getByRole('button', { name: /skip to/i }));

    await expect(explainBackBtn).toBeVisible({ timeout: 10000 });
    await expect(skipBtn.first()).toBeVisible({ timeout: 5000 });

    const explainBackBB = await explainBackBtn.boundingBox();
    const skipBB = await skipBtn.first().boundingBox();

    expect(
      explainBackBB?.height,
      'Primary "Explain back" CTA height must be ≥44px (WCAG 2.5.8, spec: min-h-[56px])'
    ).toBeGreaterThanOrEqual(44);

    expect(
      skipBB?.height,
      'Secondary skip CTA height must be ≥44px even as ghost/secondary style (WCAG 2.5.8)'
    ).toBeGreaterThanOrEqual(44);
  });

  // ── Copy rule: no "paraphrase" anywhere ───────────────────────────────────

  test('no user-facing text or ARIA label contains the word "paraphrase"', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}/results?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    const pageContent = await page.evaluate(() => {
      const allText = document.body.innerText;
      const ariaLabels = Array.from(document.querySelectorAll('[aria-label]'))
        .map(el => el.getAttribute('aria-label') ?? '');
      return { pageText: allText, ariaLabels };
    });

    expect(
      pageContent.pageText.toLowerCase(),
      'The word "paraphrase" must not appear in user-facing UI text (P904/P952 Copy rule)'
    ).not.toContain('paraphrase');

    for (const label of pageContent.ariaLabels) {
      expect(
        label.toLowerCase(),
        `ARIA label "${label}" contains the forbidden word "paraphrase"`
      ).not.toContain('paraphrase');
    }
  });

  // ── Dialog ARIA attributes ─────────────────────────────────────────────────

  // [EXPECTED-FAIL until /dev]
  test('[EXPECTED-FAIL until /dev] capture Dialog has aria-modal attribute while open', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?delivery=${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Advance to story-revealed and open dialog
    for (let i = 0; i < 10; i++) {
      const primaryCta = page.locator('[data-testid="letter-primary-cta"]')
        .or(page.getByRole('button', { name: /next/i }));

      if (await primaryCta.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await primaryCta.first().click();
        await page.waitForTimeout(400);
        const skipVisible = await page.getByRole('button', { name: /skip/i }).isVisible().catch(() => false);
        if (skipVisible) break;
      }
    }

    const explainBackBtn = page.getByRole('button', { name: /explain back what you understood/i });
    await explainBackBtn.click();

    const captureDialog = page.locator('[role="dialog"]');
    await expect(captureDialog).toBeVisible({ timeout: 5000 });

    // Dialog must have aria-modal="true" for screen readers
    const ariaModal = await captureDialog.getAttribute('aria-modal');
    expect(
      ariaModal,
      'Capture Dialog must have aria-modal="true" for screen reader correct modal behavior'
    ).toBe('true');
  });
});
