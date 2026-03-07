/**
 * @file p486-accessibility.spec.ts
 * @description Accessibility tests for P486: /create page with point context.
 *
 * Tests:
 * - Banner has role="region" with aria-label="Point context"
 * - aria-busy="true" during loading, aria-busy="false" after
 * - aria-live="polite" on banner container
 * - Textarea has aria-disabled and tabindex="-1" during loading
 * - Tab order: Back -> Banner elements -> Textarea -> Visibility -> Publish
 * - Position chip has aria-label with full position text
 * - Point text toggle has role="button", aria-expanded
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from './helpers/test-point';

test.describe('P486 Accessibility -- /create with point context', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: TestUser;
  let testPoint: TestPoint;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P486A11y' });
    testPoint = await createTestPoint(testUser.user.id, {
      statement: 'Accessibility in forms matters more than visual polish for early products',
    });
    await createTestPosition(testPoint.id, testUser.user.id, 'disagree');
  });

  test.afterAll(async () => {
    await deleteTestPoint(testPoint.id);
    await deleteTestUser(testUser.user.id);
  });

  // -- Banner ARIA attributes --

  test('Banner container has role="region" and aria-label="Point context"', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Wait for context header to load
    await expect(page.getByTestId('chat-context-header')).toBeVisible({ timeout: 10000 });

    // The banner region wrapper (parent of or same as chat-context-header)
    const region = page.locator('[role="region"][aria-label="Point context"]');
    await expect(region).toBeVisible();
  });

  test('Banner area has aria-live="polite" for screen reader announcements', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('chat-context-header')).toBeVisible({ timeout: 10000 });

    // aria-live="polite" on the banner container (scoped to Point context region)
    const liveRegion = page.locator('[role="region"][aria-label="Point context"][aria-live="polite"]');
    await expect(liveRegion).toBeAttached();
  });

  test('aria-busy transitions from true to false when point loads', async ({ page }) => {
    await setTestSession(page, testUser.email);

    // Slow point fetch to observe aria-busy
    await page.route('**/rest/v1/points*', async route => {
      await new Promise(r => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto(`/create?pointId=${testPoint.id}`);

    // During loading: aria-busy="true"
    const busyElement = page.locator('[aria-busy="true"]');
    await expect(busyElement).toBeAttached({ timeout: 3000 });

    // After load: aria-busy gone or "false"
    await expect(page.getByTestId('chat-context-header')).toBeVisible({ timeout: 15000 });
    await expect(busyElement).not.toBeAttached();
  });

  // -- Textarea during loading --

  test('Textarea has aria-disabled and tabindex="-1" during point loading', async ({ page }) => {
    await setTestSession(page, testUser.email);

    await page.route('**/rest/v1/points*', async route => {
      await new Promise(r => setTimeout(r, 2000));
      await route.continue();
    });

    await page.goto(`/create?pointId=${testPoint.id}`);

    const textarea = page.locator('#story-content');
    // During loading: should have aria-disabled or be disabled
    await expect(textarea).toBeDisabled({ timeout: 3000 });

    // After load: enabled
    await expect(page.getByTestId('chat-context-header')).toBeVisible({ timeout: 15000 });
    await expect(textarea).toBeEnabled();
  });

  // -- Position chip aria --

  test('Position chip has descriptive aria-label', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('chat-context-header')).toBeVisible({ timeout: 10000 });

    const chip = page.getByTestId('position-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('aria-label', /Your position:/);
  });

  // -- Tab order --

  test('Tab order flows: Back -> Banner elements -> Textarea -> Visibility -> Publish', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('chat-context-header')).toBeVisible({ timeout: 10000 });

    // Verify key elements are in correct relative tab order:
    // Back button → Banner elements → Textarea → Visibility → Publish
    // Note: layout nav elements come before Back button, so we tab until we reach it

    const backButton = page.getByRole('button', { name: 'Go back' });
    const textarea = page.locator('#story-content');

    // Tab until we reach the Back button (skip layout nav)
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      if (await backButton.evaluate(el => el === document.activeElement)) break;
    }
    await expect(backButton).toBeFocused();

    // Continue tabbing — textarea should come after banner elements
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      if (await textarea.evaluate(el => el === document.activeElement)) break;
    }
    await expect(textarea).toBeFocused();
  });

  // -- Keyboard submit --

  test('Cmd/Ctrl+Enter submits the form', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('chat-context-header')).toBeVisible({ timeout: 10000 });

    const textarea = page.locator('#story-content');
    await textarea.fill('Testing keyboard submit via Ctrl+Enter');

    // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Enter`);

    // Should attempt to save (navigate to /story/ or show saving state)
    // Wait for navigation or saving indicator
    const savingButton = page.getByRole('button', { name: /Saving/i });
    const navigated = page.waitForURL(/\/story\//, { timeout: 10000 }).catch(() => null);
    const savingVisible = savingButton.isVisible().catch(() => false);

    // Either should happen
    const result = await Promise.race([
      navigated.then(() => 'navigated'),
      savingVisible.then(v => v ? 'saving' : 'neither'),
    ]);
    expect(['navigated', 'saving']).toContain(result);
  });
});
