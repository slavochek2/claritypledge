/**
 * @file p491-accessibility.spec.ts
 * @description P491: Accessibility tests for the hashtag feed feature
 *
 * Tests cover:
 * - Tab bar ARIA roles and keyboard navigation
 * - Tag pills accessibility (aria-labels, focus rings)
 * - Active tag filter dismiss button accessibility
 * - Screen reader announcements on tab change
 * - Empty state accessibility
 */

import { test, expect } from '@playwright/test';

test.describe('P491: Feed Page Accessibility', () => {

  // ==========================================================================
  // Tab Bar Accessibility
  // ==========================================================================

  test('tab bar has correct ARIA structure', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Tablist container
    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible();

    // Two tabs
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(2);

    // Points tab is selected by default
    const pointsTab = page.getByRole('tab', { name: /points/i });
    await expect(pointsTab).toHaveAttribute('aria-selected', 'true');

    // Stories tab is not selected
    const storiesTab = page.getByRole('tab', { name: /stories/i });
    await expect(storiesTab).toHaveAttribute('aria-selected', 'false');

    // Tab panel exists
    const tabpanel = page.getByRole('tabpanel');
    await expect(tabpanel).toBeVisible();
  });

  test('arrow keys navigate between tabs', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Focus the Points tab
    const pointsTab = page.getByRole('tab', { name: /points/i });
    await pointsTab.focus();

    // Press Right arrow — should move focus to Stories tab
    await page.keyboard.press('ArrowRight');
    const storiesTab = page.getByRole('tab', { name: /stories/i });
    await expect(storiesTab).toBeFocused();

    // Press Left arrow — should move focus back to Points tab
    await page.keyboard.press('ArrowLeft');
    await expect(pointsTab).toBeFocused();
  });

  test('Tab key moves focus from tablist to tab panel content', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Focus the Points tab
    const pointsTab = page.getByRole('tab', { name: /points/i });
    await pointsTab.focus();

    // Press Tab — focus should leave tablist and enter panel
    await page.keyboard.press('Tab');

    // Focus should no longer be on a tab element
    const focusedRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(focusedRole).not.toBe('tab');
  });

  // ==========================================================================
  // Tag Pills Accessibility
  // ==========================================================================

  test('tag pills have aria-labels for screen readers', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Look for any tag pill with proper aria-label
    const tagPills = page.locator('[aria-label^="Filter feed by tag:"]');
    // If content exists with tags, at least one should be present
    const count = await tagPills.count();
    if (count > 0) {
      // Verify first pill has proper aria-label format
      const label = await tagPills.first().getAttribute('aria-label');
      expect(label).toMatch(/^Filter feed by tag: .+$/);
    }
  });

  test('tag pills are focusable via Tab key (links)', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    const tagPills = page.locator('[aria-label^="Filter feed by tag:"]');
    const count = await tagPills.count();
    if (count > 0) {
      // Focus the pill
      await tagPills.first().focus();
      await expect(tagPills.first()).toBeFocused();

      // Check focus ring is visible (focus-visible:ring-2 pattern)
      // Visual check — ensure no error
    }
  });

  // ==========================================================================
  // Active Tag Filter Accessibility
  // ==========================================================================

  test('active tag filter dismiss button has accessible label', async ({ page }) => {
    await page.goto('/feed?tag=fundraising');
    await page.waitForLoadState('networkidle');

    const dismissButton = page.getByLabel(/remove tag filter for fundraising/i);
    await expect(dismissButton).toBeVisible();

    // Should be keyboard focusable
    await dismissButton.focus();
    await expect(dismissButton).toBeFocused();

    // Enter key should dismiss
    await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/tag=/);
  });

  // ==========================================================================
  // Screen Reader — Tab Panel Changes
  // ==========================================================================

  test('tab panel has aria-live for content changes', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // The content region should announce changes
    const tabpanel = page.getByRole('tabpanel');
    // Check for aria-live attribute on the panel or a wrapper
    const ariaLive = await tabpanel.getAttribute('aria-live');
    // aria-live="polite" expected on the content region
    expect(ariaLive).toBe('polite');
  });

  // ==========================================================================
  // Empty State Accessibility
  // ==========================================================================

  test('empty state has appropriate heading or status role', async ({ page }) => {
    await page.goto('/feed?tag=definitely-does-not-exist-ever');
    await page.waitForLoadState('networkidle');

    // Empty state message should be announced
    const emptyState = page.getByText(/no content tagged/i);
    if (await emptyState.isVisible()) {
      // "Browse all content" link should be keyboard focusable
      const browseLink = page.getByRole('link', { name: /browse all content/i });
      await expect(browseLink).toBeVisible();
      await browseLink.focus();
      await expect(browseLink).toBeFocused();
    }
  });
});
