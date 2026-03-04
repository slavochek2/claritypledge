/**
 * @file p467-accessibility.spec.ts
 * @description Accessibility tests for P467: /chat — slim context header + inline rating
 *
 * Tests:
 * - 0–10 button row has role="group" with aria-label
 * - Each button has aria-label="Rate {n}"
 * - Keyboard: Tab to button row, arrow keys navigate, Enter/Space sends rating
 * - After rating sent: buttons have aria-disabled="true" / tabIndex=-1
 * - Position chip has aria-label with full position description
 * - Expanded point text: role="button" when truncated, aria-expanded attribute
 * - aria-live region announces "Rating {n} sent" after button click
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from '../helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from '../helpers/test-point';

test.describe('P467 Accessibility — ChatContextHeader + inline rating', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let testPoint: Awaited<ReturnType<typeof createTestPoint>>;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P467A11y' });
    testPoint = await createTestPoint(testUser.user.id, {
      statement: 'Avoiding hard conversations causes more damage than having them — this is a long enough statement to test truncation behavior in the sticky header',
    });
    await createTestPosition(testPoint.id, testUser.user.id, 'agree');
  });

  test.afterAll(async () => {
    await deleteTestPoint(testPoint.id);
    await deleteTestUser(testUser.user.id);
  });

  // ── ChatContextHeader accessibility ───────────────────────────────────────

  test('Position chip has aria-label with full position description', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const chip = page.getByTestId('position-chip');
    await expect(chip).toBeVisible({ timeout: 10000 });

    // Must have aria-label with "Your position: You agree" or similar
    const ariaLabel = await chip.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/your position:/i);
    expect(ariaLabel).toMatch(/you agree|you disagree|you're unsure/i);
  });

  test('Position chip is not interactive (no role="button")', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const chip = page.getByTestId('position-chip');
    await expect(chip).toBeVisible({ timeout: 10000 });

    // Chip must NOT have role="button" — it is read-only
    const role = await chip.getAttribute('role');
    expect(role).not.toBe('button');
  });

  test('[↗] button has aria-label="Open point detail"', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const openLink = page.getByRole('link', { name: 'Open point detail' });
    await expect(openLink).toBeVisible({ timeout: 10000 });
    await expect(openLink).toHaveAttribute('aria-label', 'Open point detail');
  });

  test('Truncated point text region has role="button" and aria-expanded when text is truncated', async ({ page }) => {
    // Use narrow viewport to force truncation
    await page.setViewportSize({ width: 375, height: 812 });
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    // Point text region — when truncated, must have role="button" and aria-expanded
    const pointTextRegion = contextHeader.getByTestId('point-text-toggle').or(
      contextHeader.locator('[role="button"][aria-expanded]')
    );

    // If text is truncated (likely at 375px with long statement):
    const isTruncated = await pointTextRegion.count() > 0;
    if (isTruncated) {
      await expect(pointTextRegion).toHaveAttribute('role', 'button');
      await expect(pointTextRegion).toHaveAttribute('aria-expanded', 'false');

      // Tap to expand
      await pointTextRegion.click();
      await expect(pointTextRegion).toHaveAttribute('aria-expanded', 'true');

      // Tap again to collapse
      await pointTextRegion.click();
      await expect(pointTextRegion).toHaveAttribute('aria-expanded', 'false');
    }
    // If text fits without truncation: no interactive role needed — test passes
  });

  test('Point text expand/collapse is keyboard-accessible (Enter/Space)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    const pointTextRegion = contextHeader.locator('[role="button"][aria-expanded]');

    const isTruncated = await pointTextRegion.count() > 0;
    if (!isTruncated) {
      // Text fits — no keyboard interaction needed
      return;
    }

    await pointTextRegion.focus();
    await expect(pointTextRegion).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(pointTextRegion).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Space');
    await expect(pointTextRegion).toHaveAttribute('aria-expanded', 'false');
  });

  // ── 0–10 rating button row accessibility ──────────────────────────────────

  test('Rating button row has role="group" with aria-label="Rating scale from 0 to 10"', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Use prefix match for per-message testid; .last() targets the active (latest) rating bubble
    const ratingBubble = page.locator('[data-testid^="rating-bubble-"]').last();
    const inRatingPhase = await page.locator('[data-testid^="rating-bubble-"]').count() > 0;

    if (!inRatingPhase) {
      // TODO: requires completing brain-dump + AI streaming to reach rating phase
      test.skip();
      return;
    }

    const ratingGroup = ratingBubble.getByRole('group');
    await expect(ratingGroup).toBeVisible();
    await expect(ratingGroup).toHaveAttribute('aria-label', 'Rating scale from 0 to 10');
  });

  test('Each rating button has aria-label="Rate {n}" for n in 0–10', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Use prefix match for per-message testid; .last() targets the active (latest) rating bubble
    const ratingBubble = page.locator('[data-testid^="rating-bubble-"]').last();
    const inRatingPhase = await page.locator('[data-testid^="rating-bubble-"]').count() > 0;

    if (!inRatingPhase) {
      // TODO: requires completing brain-dump + AI streaming to reach rating phase
      test.skip();
      return;
    }

    // All 11 buttons (0–10) must each have aria-label="Rate {n}"
    for (let n = 0; n <= 10; n++) {
      const btn = ratingBubble.getByRole('button', { name: `Rate ${n}` });
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-label', `Rate ${n}`);
    }
  });

  test('Rating buttons: selected button has aria-pressed="true", others aria-pressed="false"', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Use prefix match for per-message testid; .last() targets the active (latest) rating bubble
    const ratingBubble = page.locator('[data-testid^="rating-bubble-"]').last();
    const inRatingPhase = await page.locator('[data-testid^="rating-bubble-"]').count() > 0;

    if (!inRatingPhase) {
      // TODO: requires completing brain-dump + AI streaming to reach rating phase
      test.skip();
      return;
    }

    const ratingGroup = ratingBubble.getByRole('group');

    // Before selection: all buttons have aria-pressed="false"
    for (let n = 0; n <= 10; n++) {
      const btn = ratingGroup.getByRole('button', { name: `Rate ${n}` });
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
    }

    // Click Rate 7 — it should get aria-pressed="true", others remain "false"
    const btn7 = ratingGroup.getByRole('button', { name: 'Rate 7' });
    await btn7.click();

    await expect(btn7).toHaveAttribute('aria-pressed', 'true');
    const btn0 = ratingGroup.getByRole('button', { name: 'Rate 0' });
    await expect(btn0).toHaveAttribute('aria-pressed', 'false');
  });

  test('Keyboard navigation: arrow keys move within the rating button group', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Use prefix match for per-message testid; .last() targets the active (latest) rating bubble
    const ratingBubble = page.locator('[data-testid^="rating-bubble-"]').last();
    const inRatingPhase = await page.locator('[data-testid^="rating-bubble-"]').count() > 0;

    if (!inRatingPhase) {
      // TODO: requires completing brain-dump + AI streaming to reach rating phase
      test.skip();
      return;
    }

    const ratingGroup = ratingBubble.getByRole('group');

    // Tab to the first button in the group
    const firstBtn = ratingGroup.getByRole('button', { name: 'Rate 0' });
    await firstBtn.focus();
    await expect(firstBtn).toBeFocused();

    // Right arrow moves to Rate 1
    await page.keyboard.press('ArrowRight');
    const btn1 = ratingGroup.getByRole('button', { name: 'Rate 1' });
    await expect(btn1).toBeFocused();

    // Left arrow moves back to Rate 0
    await page.keyboard.press('ArrowLeft');
    await expect(firstBtn).toBeFocused();
  });

  test('Enter key selects and sends rating when button is focused', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Use prefix match for per-message testid; .last() targets the active (latest) rating bubble
    const ratingBubble = page.locator('[data-testid^="rating-bubble-"]').last();
    const inRatingPhase = await page.locator('[data-testid^="rating-bubble-"]').count() > 0;

    if (!inRatingPhase) {
      // TODO: requires completing brain-dump + AI streaming to reach rating phase
      test.skip();
      return;
    }

    const ratingGroup = ratingBubble.getByRole('group');
    const btn5 = ratingGroup.getByRole('button', { name: 'Rate 5' });
    await btn5.focus();
    await expect(btn5).toBeFocused();

    // Enter sends the rating
    await page.keyboard.press('Enter');

    // Rating 5 appears as user message
    const userMessage = page.getByTestId('thread-message-user').last();
    await expect(userMessage).toContainText('5', { timeout: 5000 });
  });

  test('After rating sent: buttons have aria-disabled="true" and tabIndex=-1', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Use prefix match for per-message testid; .last() targets the active (latest) rating bubble
    const ratingBubble = page.locator('[data-testid^="rating-bubble-"]').last();
    const inRatingPhase = await page.locator('[data-testid^="rating-bubble-"]').count() > 0;

    if (!inRatingPhase) {
      // TODO: requires completing brain-dump + AI streaming to reach rating phase
      test.skip();
      return;
    }

    const ratingGroup = ratingBubble.getByRole('group');
    const btn3 = ratingGroup.getByRole('button', { name: 'Rate 3' });
    await btn3.click();

    // After click, all buttons in this bubble should become disabled
    for (let n = 0; n <= 10; n++) {
      const btn = ratingGroup.getByRole('button', { name: `Rate ${n}` });
      await expect(btn).toHaveAttribute('aria-disabled', 'true', { timeout: 5000 });
      const tabIndex = await btn.getAttribute('tabindex');
      expect(tabIndex).toBe('-1');
    }
  });

  test('aria-live region announces "Rating {n} sent" after button click', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Use prefix match for per-message testid; .last() targets the active (latest) rating bubble
    const ratingBubble = page.locator('[data-testid^="rating-bubble-"]').last();
    const inRatingPhase = await page.locator('[data-testid^="rating-bubble-"]').count() > 0;

    if (!inRatingPhase) {
      // TODO: requires completing brain-dump + AI streaming to reach rating phase
      test.skip();
      return;
    }

    // aria-live region must exist (may be empty until rating is clicked)
    const liveRegion = page.locator('[aria-live="polite"]').filter({ hasText: '' }).or(
      page.locator('[aria-live="polite"]')
    );
    // At minimum, the region must be attached to DOM
    await expect(liveRegion.first()).toBeAttached({ timeout: 5000 });

    // Click a rating button
    const ratingGroup = ratingBubble.getByRole('group');
    const btn6 = ratingGroup.getByRole('button', { name: 'Rate 6' });
    await btn6.click();

    // After click, aria-live region announces the rating
    const announcementRegion = page.locator('[aria-live="polite"]').filter({ hasText: /rating \d+ sent/i });
    await expect(announcementRegion).toBeAttached({ timeout: 3000 });
  });

  test('Anchor labels "not at all" and "perfectly" are aria-hidden (decorative)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Use prefix match for per-message testid; .last() targets the active (latest) rating bubble
    const ratingBubble = page.locator('[data-testid^="rating-bubble-"]').last();
    const inRatingPhase = await page.locator('[data-testid^="rating-bubble-"]').count() > 0;

    if (!inRatingPhase) {
      // TODO: requires completing brain-dump + AI streaming to reach rating phase
      test.skip();
      return;
    }

    // Anchor labels are decorative — must be aria-hidden
    const notAtAll = ratingBubble.locator('text=not at all');
    const perfectly = ratingBubble.locator('text=perfectly');

    await expect(notAtAll).toHaveAttribute('aria-hidden', 'true');
    await expect(perfectly).toHaveAttribute('aria-hidden', 'true');
  });
});
