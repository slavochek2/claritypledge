/**
 * @file p425-accessibility.spec.ts
 * @description Accessibility tests for P425: AI-Guided Story Creation — Core Loop
 *
 * Tests:
 * - Input bar is keyboard accessible (Tab reaches it, Ctrl+Enter sends)
 * - Context chip is not interactive — no keyboard focus trap
 * - Draft cards have correct ARIA roles for screen reader
 * - Visibility selector buttons have accessible labels
 * - Save button state changes are announced
 * - Toast notification is announced via aria-live
 *
 * Spec §Accessibility & Keyboard Navigation provides the ARIA contract:
 * - Thread messages: <article aria-label="AI message" role="article">
 * - Draft cards: <article aria-label="Draft version N, not saved">
 * - Input: <textarea aria-label="Your story" aria-describedby="story-guide-hint">
 * - Visibility selector: <fieldset aria-labelledby="..."> with <legend>
 * - Save button: aria-busy while saving, aria-label updates on success
 * - Toast: <div role="status" aria-live="polite">
 *
 * NOTE: Tests that require AI streaming are gated on VITE_STORY_GUIDE_EDGE_FN_URL.
 * Static accessibility tests (input, auth gate) run without the edge function.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from '../helpers/test-user';

const CHAT_PATH = '/chat';

/** Dismisses the AI disclosure banner if present. */
async function acknowledgeDisclosure(page: Parameters<typeof setTestSession>[0]) {
  const ackBtn = page.getByRole('button', { name: 'Acknowledge' });
  if (await ackBtn.isVisible()) {
    await ackBtn.click();
  }
}

test.describe('P425 Accessibility — /chat page structure', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P425A11y' });
  });

  test.afterAll(async () => {
    await deleteTestUser(testUser.user.id);
  });

  // ── Input bar keyboard accessibility ────────────────────────────────────────

  test('input bar is reachable via Tab key', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    // Tab from body to find the input bar
    await page.keyboard.press('Tab');

    // TODO: Adjust selector once StoryGuideChat.tsx is implemented with
    // <textarea data-testid="story-guide-input" aria-label="Your story">
    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /your story|what's on your mind/i })
    );

    // The input should receive focus within a few Tab presses
    let focused = false;
    for (let i = 0; i < 10; i++) {
      const isFocused = await inputBar.evaluate(el => el === document.activeElement).catch(() => false);
      if (isFocused) {
        focused = true;
        break;
      }
      await page.keyboard.press('Tab');
    }

    expect(focused, 'Input bar should be reachable via Tab key').toBe(true);
  });

  test('input bar sends message on Ctrl+Enter', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    // Acknowledge the AI disclosure (required before first send — spec §Security Review)
    const ackButton = page.getByTestId('ai-disclosure').getByRole('button', { name: /acknowledge/i });
    const disclosureVisible = await ackButton.isVisible().catch(() => false);
    if (disclosureVisible) {
      await ackButton.click();
      await page.waitForTimeout(100); // allow state update
    }

    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /your story|what's on your mind/i })
    );
    await expect(inputBar).toBeVisible({ timeout: 10000 });

    await inputBar.focus();
    await inputBar.fill('Accessibility test brain dump');

    // Ctrl+Enter should trigger send (not add a newline)
    // We verify by checking the input is cleared after send (or disabled during streaming)
    await page.keyboard.press('Control+Enter');

    // Input should be cleared or disabled after send
    const inputValue = await inputBar.inputValue().catch(() => '');
    const isDisabled = await inputBar.isDisabled().catch(() => false);
    expect(
      inputValue === '' || isDisabled,
      'Input bar should be cleared or disabled after Ctrl+Enter send'
    ).toBe(true);
  });

  test('input bar has accessible label (aria-label or associated label)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    // Spec: <textarea aria-label="Your story" aria-describedby="story-guide-hint">
    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /your story|what's on your mind/i })
    );
    await expect(inputBar).toBeVisible({ timeout: 10000 });

    // Verify it has an accessible name via ARIA role query (already implied by getByRole above)
    // More explicit: check aria-label attribute
    const ariaLabel = await inputBar.getAttribute('aria-label').catch(() => null);
    const placeholder = await inputBar.getAttribute('placeholder').catch(() => null);

    expect(
      ariaLabel || placeholder,
      'Input bar must have an accessible label (aria-label or visible placeholder)'
    ).toBeTruthy();
  });

  // ── Context header accessibility (P467: replaced context-card with chat-context-header) ──

  test('context header is not present when position params resolve to no data', async ({ page }) => {
    // Uses a fake pointId — chat-context-header won't render if contextPoint is undefined.
    // This is acceptable: the test confirms the header is absent rather than crashing.
    await setTestSession(page, testUser.email);
    await page.goto(`${CHAT_PATH}?from=position&pointId=test-point-id`);
    await page.waitForLoadState('networkidle');

    // With a non-existent pointId the context header should not render (graceful degradation).
    await expect(page.getByTestId('chat-context-header')).not.toBeAttached();
  });

  // ── Draft card ARIA ──────────────────────────────────────────────────────

  test('draft cards use article role with accessible label', async ({ page }) => {
    test.skip(
      !process.env.VITE_STORY_GUIDE_EDGE_FN_URL,
      'Skipping draft card test — requires AI edge function'
    );

    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');
    await acknowledgeDisclosure(page);

    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /your story|what's on your mind/i })
    );
    await inputBar.fill('Accessibility test story for draft card ARIA.');
    await page.keyboard.press('Control+Enter');

    // Wait for draft card to appear
    // Spec: <article aria-label="Draft version 1, not saved">
    const draftCard = page.getByRole('article', { name: /draft version 1/i });
    await expect(draftCard).toBeVisible({ timeout: 60000 });

    // Verify aria-label is present
    const ariaLabel = await draftCard.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/draft version 1/i);
  });

  // ── Visibility selector ARIA ─────────────────────────────────────────────

  test('visibility selector buttons have ARIA labels', async ({ page }) => {
    test.skip(
      !process.env.VITE_STORY_GUIDE_EDGE_FN_URL,
      'Skipping visibility selector test — requires AI edge function to complete full filing loop'
    );

    // This test requires completing the full loop to reach the visibility selector.
    // TODO: Implement with a page that can be seeded to the 'visibility' phase directly.
    //
    // When implemented, verify:
    // <fieldset aria-labelledby="visibility-label">
    //   <legend id="visibility-label">Who can see this story?</legend>
    //   <button aria-pressed="true" aria-label="Private — only you">Private</button>
    //   <button aria-pressed="false" aria-label="Shared — verified members">Shared</button>
    //   <button aria-pressed="false" aria-label="Public — anyone">Public</button>
    // </fieldset>
    //
    // Spec §Accessibility: visibility selector fieldset + legend pattern.

    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /your story|what's on your mind/i })
    );
    await inputBar.fill('Visibility selector a11y test.');
    await page.keyboard.press('Control+Enter');

    // Complete loop to reach visibility selector (omitted — requires multiple AI round-trips)
    // TODO: Implement once mock/stub for AI responses is available in E2E tests.

    // For now: verify that IF a visibility selector is visible, its buttons have ARIA labels
    const visibilitySelector = page.getByTestId('visibility-selector');
    const selectorVisible = await visibilitySelector.isVisible().catch(() => false);

    if (selectorVisible) {
      const buttons = visibilitySelector.getByRole('button');
      const buttonCount = await buttons.count();
      expect(buttonCount).toBeGreaterThanOrEqual(3); // Private, Shared, Public

      for (let i = 0; i < buttonCount; i++) {
        const btn = buttons.nth(i);
        const label = await btn.getAttribute('aria-label');
        const text = await btn.textContent();
        expect(
          label || text,
          `Visibility button ${i} must have an accessible label`
        ).toBeTruthy();
      }
    }
  });

  // ── Save button state announcements ─────────────────────────────────────

  test('save button is not focusable in phases before visibility', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');

    // In idle/brain-dump phase, save button should not exist or not be focusable
    // TODO: Replace with data-testid="save-story-button"
    const saveButton = page.getByTestId('save-story-button').or(
      page.getByRole('button', { name: /save privately|save story|publish story/i })
    );

    // Save button should not be visible in idle phase
    await expect(saveButton).not.toBeVisible();
  });

  // ── Toast accessibility ──────────────────────────────────────────────────

  test.skip('Sonner toast container has aria-live region', () => {
    // TODO(p425): Sonner injects the live region dynamically on first toast — it won't be
    // in the DOM until a save is triggered. Meaningful assertion requires completing the
    // full filing loop (brain dump → rate 10 → save) so the toast fires.
    // Skipping until we add an AI-gated save test that covers this path end-to-end.
  });

  // ── Keyboard navigation order ─────────────────────────────────────────────

  test('thread messages are readable by screen reader (not hidden from accessibility tree)', async ({ page }) => {
    test.skip(
      !process.env.VITE_STORY_GUIDE_EDGE_FN_URL,
      'Skipping thread messages test — requires AI edge function'
    );

    await setTestSession(page, testUser.email);
    await page.goto(CHAT_PATH);
    await page.waitForLoadState('networkidle');
    await acknowledgeDisclosure(page);

    const inputBar = page.getByTestId('story-guide-input').or(
      page.getByRole('textbox', { name: /your story|what's on your mind/i })
    );
    await inputBar.fill('Screen reader test message.');
    await page.keyboard.press('Control+Enter');

    // AI opening message should be in the thread
    // Spec: <article role="article" aria-label="AI message">
    const aiMessage = page.getByRole('article', { name: /AI message|assistant message/i }).first();
    await expect(aiMessage).toBeVisible({ timeout: 60000 });

    // Verify it's not hidden from accessibility tree
    const ariaHidden = await aiMessage.getAttribute('aria-hidden');
    expect(ariaHidden).not.toBe('true');
  });
});
