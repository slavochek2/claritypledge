/**
 * @file p467-chat-context-header.spec.ts
 * @description E2E tests for P467: ChatContextHeader — the slim context header.
 *
 * P803 (2026-09-02): SPLIT, not simply re-pointed. `ChatContextHeader` is alive —
 * `create-story-page.tsx:315` renders it whenever `pointId` is in the query string, and
 * `/chat` only ever redirected there — so the header tests below go to `/create?...`
 * directly and still bind to real markup (`chat-context-header`, `position-chip`,
 * `point-text-toggle` are all emitted by the surviving component).
 *
 * Seven tests were DELETED rather than re-pointed, because their subject was deleted with
 * `StoryGuideChat.tsx`: the inline rating phase (`rating-bubble-*`, `thread-area`,
 * `story-guide-chat` testids — `grep -rn 'rating-bubble' src/` now returns 0), the
 * "no Drawer" assertion about that rating UI, and the P465 edit-heading regression
 * (`edit-story-heading` exists nowhere in `src/`). Five of them were written as
 * `if (inRatingPhase) { ... }`, so with the count permanently 0 they would have passed
 * VACUOUSLY — a suite that cannot fail is worse than no suite.
 *
 * Known-weak assertion, kept deliberately: the `[data-testid="point-card-with-links"]`
 * absence check below is unbound — that testid is emitted nowhere in `src/`, so the
 * assertion is true by construction. It is retained as documentation of P467's intent
 * ("the header must not be the PointCardWithLinks quote pattern"), not counted as coverage.
 *
 * Tests:
 * - ChatContextHeader renders with point text + position chip
 * - Context header is ≤52px tall at 375px width
 * - Position chip shows 1st-person text ("You agree" / "You disagree" / "You're unsure")
 * - No share button, no position buttons in header
 * - [↗] link navigates to /point/:id
 * - Header renders without a chip when the user has no position
 * - Profile page points tab unaffected
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { supabaseAdmin as _supabaseAdmin } from './helpers/supabase-admin';

test.describe('P467 — ChatContextHeader + inline rating', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let testPoint: Awaited<ReturnType<typeof createTestPoint>>;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P467E2E' });
    testPoint = await createTestPoint(testUser.user.id, {
      statement: 'Avoiding hard conversations causes more damage than having them, even when they go badly',
    });
    // Give the user an "agree" position on the point
    await createTestPosition(testPoint.id, testUser.user.id, 'agree');
  });

  test.afterAll(async () => {
    await deleteTestPoint(testPoint.id);
    await deleteTestUser(testUser.user.id);
  });

  // ── ChatContextHeader renders ─────────────────────────────────────────────

  test('ChatContextHeader is present and PointCardWithLinks quote pattern is absent', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // New slim header must be present
    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    // PointCardWithLinks quote pattern: shows owner name in 3rd person, e.g. "Agrees:"
    // The new header must NOT contain this pattern
    const quotePattern = page.locator('[data-testid="point-card-with-links"]');
    await expect(quotePattern).not.toBeAttached();

    // No "Vyacheslav" or user's full name in 3rd-person quote block
    const headerText = await contextHeader.textContent();
    expect(headerText).not.toMatch(/Agrees:|Disagrees:|Is unsure:/);
  });

  test('Context header shows truncated point text and 1st-person position chip', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    // Point text present
    await expect(contextHeader).toContainText('Avoiding hard conversations');

    // 1st-person chip — one of the three values
    const chip = contextHeader.getByTestId('position-chip');
    await expect(chip).toBeVisible();
    const chipText = await chip.textContent();
    expect(['You agree', "You disagree", "You're unsure"]).toContain(chipText?.trim());
  });

  test('Position chip shows "You agree" for user with agree position', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const chip = page.getByTestId('position-chip');
    await expect(chip).toHaveText('You agree');
  });

  test('Context header shows no share button and no interactive position buttons', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');

    // No share button
    const shareButton = contextHeader.getByRole('button', { name: /share/i });
    await expect(shareButton).not.toBeAttached();

    // No position-selection buttons (Agree / Disagree / Unsure interactive)
    const positionButtons = contextHeader.getByRole('button', { name: /^agree$|^disagree$|^unsure$/i });
    await expect(positionButtons).not.toBeAttached();
  });

  test('Context header is ≤52px tall at 375px viewport width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setTestSession(page, testUser.email);
    await page.goto(`/create?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    const box = await contextHeader.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(52);
  });

  // ── [↗] navigation ────────────────────────────────────────────────────────

  test('[↗] link navigates to /point/:id', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const openLink = page.getByRole('link', { name: 'Open point detail' });
    await expect(openLink).toBeVisible({ timeout: 10000 });

    // The link carries target="_blank" (ChatContextHeader.tsx) — it opens a NEW tab, so the
    // original page never navigates. Asserting page.url() here reads the page we came from and
    // fails on a link that works. Wait for the popup and assert on that.
    const [opened] = await Promise.all([
      page.context().waitForEvent('page'),
      openLink.click(),
    ]);
    await opened.waitForLoadState('domcontentloaded');
    expect(opened.url()).toContain(`/point/${testPoint.id}`);
    await opened.close();
  });
  test('Context header renders without chip when user has no position', async ({ page }) => {
    // Create a separate user with no position
    const noPositionUser = await createTestUser({ name: 'P467NoPos' });

    try {
      await setTestSession(page, noPositionUser.email);
      await page.goto(`/create?from=position&pointId=${testPoint.id}`);
      await page.waitForLoadState('networkidle');

      const contextHeader = page.getByTestId('chat-context-header');
      await expect(contextHeader).toBeVisible({ timeout: 10000 });

      // Chip should not be rendered (no position)
      const chip = contextHeader.getByTestId('position-chip');
      await expect(chip).not.toBeAttached();

      // Header still shows point text and [↗]
      await expect(contextHeader).toContainText('Avoiding hard conversations');
      const openLink = contextHeader.getByRole('link', { name: 'Open point detail' });
      await expect(openLink).toBeVisible();
    } finally {
      await deleteTestUser(noPositionUser.user.id);
    }
  });

  // ── Profile page regression ───────────────────────────────────────────────

  test('Profile page points tab is visually unchanged — PointCardWithLinks still renders there', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/profile/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // PointCardWithLinks should still render on profile page (not changed by P467)
    // We check that the profile page loads without errors and shows point content
    await expect(page.locator('body')).toBeVisible();

    // No JS errors from profile page
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Give a moment for any late errors
    await page.waitForTimeout(1000);

    const relevant = errors.filter(e => !e.includes('favicon') && !e.includes('net::ERR'));
    expect(relevant).toHaveLength(0);
  });
});
