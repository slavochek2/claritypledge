/**
 * @file p602-accessibility.spec.ts
 * Accessibility tests for P602: Multi-tag and version filter controls.
 */

import { test, expect } from '@playwright/test';

test.describe('P602: Accessibility', () => {
  test('tag cloud chips have correct ARIA roles', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForSelector('[role="tabpanel"]');

    const chips = page.locator('[role="checkbox"]');
    const chipCount = await chips.count();
    if (chipCount === 0) {
      test.skip(true, 'No tags in cloud');
      return;
    }

    // Each chip should have aria-checked
    for (let i = 0; i < chipCount; i++) {
      const chip = chips.nth(i);
      const checked = await chip.getAttribute('aria-checked');
      expect(checked).toMatch(/^(true|false)$/);
    }
  });

  test('tag cloud chips are keyboard navigable', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForSelector('[role="tabpanel"]');

    const chips = page.locator('[role="checkbox"]');
    const chipCount = await chips.count();
    if (chipCount === 0) {
      test.skip(true, 'No tags in cloud');
      return;
    }

    // Tab to first chip and activate with Space
    const firstChip = chips.first();
    await firstChip.focus();
    await expect(firstChip).toBeFocused();
    await page.keyboard.press('Space');

    // Should be toggled on
    await expect(firstChip).toHaveAttribute('aria-checked', 'true');

    // Press Space again to toggle off
    await page.keyboard.press('Space');
    await expect(firstChip).toHaveAttribute('aria-checked', 'false');
  });

  test('version toggle has correct switch role and aria attributes', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForSelector('[role="tabpanel"]');

    const toggle = page.locator('[role="switch"][aria-label="Show latest versions only"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Keyboard activate
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('active filter dismiss buttons have descriptive aria-labels', async ({ page }) => {
    await page.goto('/feed?tag=understanding,motivation');
    await page.waitForSelector('[role="tabpanel"]');

    const pills = page.locator('[aria-label^="Remove filter for"]');
    await expect(pills).toHaveCount(2);

    // Verify labels are descriptive
    const labels = await pills.evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
    expect(labels).toContain('Remove filter for #understanding');
    expect(labels).toContain('Remove filter for #motivation');
  });
});
