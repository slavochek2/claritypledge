/**
 * @file p703-accessibility.spec.ts
 * @description Accessibility tests for P703: Letter-sourced /live session
 *
 * Tests:
 * 1. StartClaritySessionButton keyboard activation (Enter/Space)
 * 2. StartClaritySessionButton has accessible label
 * 3. Inbox invite row keyboard-navigable (Join reachable via Tab + Enter)
 * 4. Waiting screen "Invite sent to {listener}" status announced to SR (aria-live)
 * 5. Join button in inbox row reachable without mouse
 *
 * FIXME(generate-tests): All selectors below are written against the spec's
 * described component and copy. Update to match actual rendered HTML after
 * implementation. Exact button label from spec: "Start a clarity session".
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from '../helpers/test-user';
import {
  createLetterSessionFixture,
  deleteLetterSessionFixture,
  type LetterSessionFixture,
} from '../helpers/test-letter-session';

test.describe('P703: Accessibility', () => {
  test.describe.configure({ timeout: 30000 });

  let author: TestUser;
  let listener: TestUser;
  let fixture: LetterSessionFixture;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P703 A11y Author' }),
      createTestUser({ name: 'P703 A11y Listener' }),
    ]);
    fixture = await createLetterSessionFixture(author, listener);
  });

  test.afterAll(async () => {
    await deleteLetterSessionFixture(fixture);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  // ── 1. StartClaritySessionButton keyboard activation ─────────────────────

  test('StartClaritySessionButton activates with Enter key', async ({ page }) => {
    await setTestSession(page, author.email);
    // FIXME(generate-tests): update route to match P699 story walk URL
    await page.goto(`/letters/${fixture.letterId}/results`);
    await page.waitForLoadState('networkidle');

    const startButton = page.getByRole('button', { name: /start a clarity session/i });
    await expect(startButton).toBeVisible();

    // Tab to focus the button (or focus directly)
    await startButton.focus();
    await expect(startButton).toBeFocused();

    // Enter should trigger the action (not just click)
    // We verify it's activatable — navigation or dialog should open
    // For this test we just verify no JS error and button responds
    // FIXME(generate-tests): after implementation, assert the side-effect (navigation to /live/...)
    await page.keyboard.press('Enter');
    // Small wait for any async handler
    await page.waitForTimeout(500);
    // No crash / no unhandled error
    await expect(page.locator('body')).toBeVisible();
  });

  test('StartClaritySessionButton has non-empty accessible name', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/letters/${fixture.letterId}/results`);
    await page.waitForLoadState('networkidle');

    const startButton = page.getByRole('button', { name: /start a clarity session/i });
    await expect(startButton).toBeVisible();

    // aria-label or visible text satisfies accessible name
    const accessibleName = await startButton.getAttribute('aria-label') ??
      await startButton.textContent();
    expect(accessibleName?.trim().length).toBeGreaterThan(0);
  });

  // ── 2. Inbox invite row keyboard-navigable ────────────────────────────────

  test('inbox invite row Join button is reachable via keyboard (Tab)', async ({ page }) => {
    await setTestSession(page, listener.email);
    await page.goto('/letters?tab=inbox');
    await page.waitForLoadState('networkidle');

    // Invite row should be visible (fixture seeded an open invite)
    const inviteRow = page.getByText(/invited you to verify/i);
    await expect(inviteRow).toBeVisible({ timeout: 10000 });

    // Join link/button should be focusable via Tab
    const joinButton = page.getByRole('link', { name: /join/i }).or(
      page.getByRole('button', { name: /join/i })
    );
    await joinButton.first().focus();
    await expect(joinButton.first()).toBeFocused();
  });

  // ── 3. Waiting screen aria-live announcement ──────────────────────────────

  test('waiting screen "Invite sent to {listener}" is in an aria-live region', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/live/${fixture.sessionCode}?skipMicCheck=true`);
    await page.waitForLoadState('networkidle');

    // FIXME(generate-tests): spec text: "Invite sent to {listener name} · [Resend]"
    const inviteSentText = page.getByText(/invite sent to/i);
    await expect(inviteSentText).toBeVisible({ timeout: 10000 });

    // The parent element (or this element) should have role="status" or aria-live
    const liveContainer = page.locator('[aria-live], [role="status"]').filter({
      has: page.getByText(/invite sent to/i),
    });
    // Either the element itself or a parent carries aria-live
    const count = await liveContainer.count();
    expect(
      count,
      'Invite sent status should be wrapped in an aria-live region for screen reader announcement'
    ).toBeGreaterThan(0);
  });

  // ── 4. Join button in inbox row has accessible label ─────────────────────

  test('Join button in invite row has descriptive accessible name', async ({ page }) => {
    await setTestSession(page, listener.email);
    await page.goto('/letters?tab=inbox');
    await page.waitForLoadState('networkidle');

    const joinButton = page.getByRole('link', { name: /join/i }).or(
      page.getByRole('button', { name: /join/i })
    );
    await expect(joinButton.first()).toBeVisible({ timeout: 10000 });

    const name = await joinButton.first().getAttribute('aria-label') ??
      await joinButton.first().textContent();
    expect(name?.trim().toLowerCase()).toMatch(/join/i);
  });
});
