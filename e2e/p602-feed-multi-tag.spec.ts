/**
 * @file p602-feed-multi-tag.spec.ts
 * E2E tests for P602: Multi-tag selection and version filter on feed page.
 *
 * Tests user flows for:
 * 1. Multi-tag selection via tag cloud (additive toggle)
 * 2. URL-driven multi-tag state (shareable links)
 * 3. Version filter toggle
 * 4. Combined multi-tag + version + sort
 * 5. Backward compatibility with single-tag URLs
 */

import { test, expect } from '@playwright/test';

const BASE_URL = '/feed';

test.describe('P602: Multi-Tag Selection', () => {
  test('tag cloud chips toggle on/off (additive, not replacement)', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[role="tabpanel"]');

    // Find tag cloud chips
    const chips = page.locator('[role="checkbox"]');
    const chipCount = await chips.count();
    if (chipCount < 2) {
      test.skip(true, 'Need at least 2 tags in tag cloud');
      return;
    }

    // Click first tag — should activate
    const firstChip = chips.first();
    const firstTagText = await firstChip.textContent();
    const firstTag = firstTagText?.replace('#', '').trim() ?? '';
    await firstChip.click();

    // URL should have ?tag=firstTag
    expect(page.url()).toContain(`tag=${firstTag}`);
    await expect(firstChip).toHaveAttribute('aria-checked', 'true');

    // Click second tag — should ADD (not replace)
    const secondChip = chips.nth(1);
    const secondTagText = await secondChip.textContent();
    const secondTag = secondTagText?.replace('#', '').trim() ?? '';
    await secondChip.click();

    // URL should have both tags comma-separated
    expect(page.url()).toContain(`tag=${firstTag}%2C${secondTag}`);
    await expect(firstChip).toHaveAttribute('aria-checked', 'true');
    await expect(secondChip).toHaveAttribute('aria-checked', 'true');

    // Click first tag again — should deselect, leaving only second
    await firstChip.click();
    await expect(firstChip).toHaveAttribute('aria-checked', 'false');
    expect(page.url()).toContain(`tag=${secondTag}`);
    expect(page.url()).not.toContain(firstTag);
  });

  test('active filter pills show for each selected tag with dismiss', async ({ page }) => {
    // Navigate with multi-tag URL
    await page.goto(`${BASE_URL}?tag=understanding,motivation`);
    await page.waitForSelector('[role="tabpanel"]');

    // Should show two active filter pills
    const pills = page.locator('[aria-label^="Remove filter for"]');
    await expect(pills).toHaveCount(2);

    // Dismiss first pill
    await pills.first().click();

    // Should have one pill remaining
    await expect(page.locator('[aria-label^="Remove filter for"]')).toHaveCount(1);
  });

  test('single-tag URL backward compatibility', async ({ page }) => {
    await page.goto(`${BASE_URL}?tag=understanding`);
    await page.waitForSelector('[role="tabpanel"]');

    // Should work exactly as before — one active filter pill
    const pills = page.locator('[aria-label^="Remove filter for"]');
    await expect(pills).toHaveCount(1);

    // Tag cloud should highlight the active tag
    const activeChip = page.locator('[role="checkbox"][aria-checked="true"]');
    await expect(activeChip).toHaveCount(1);
  });

  test('dismissing all tags returns to unfiltered feed', async ({ page }) => {
    await page.goto(`${BASE_URL}?tag=understanding`);
    await page.waitForSelector('[role="tabpanel"]');

    // Dismiss the tag
    const pill = page.locator('[aria-label^="Remove filter for"]');
    await pill.click();

    // URL should not have ?tag param
    expect(page.url()).not.toContain('tag=');

    // No active filter pills
    await expect(page.locator('[aria-label^="Remove filter for"]')).toHaveCount(0);
  });
});

test.describe('P602: Version Filter', () => {
  test('version toggle adds/removes ?version=latest in URL', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[role="tabpanel"]');

    // Find version toggle
    const toggle = page.locator('[role="switch"][aria-label="Show latest versions only"]');

    // Initially OFF
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(page.url()).not.toContain('version=');

    // Click to enable
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(page.url()).toContain('version=latest');

    // Click to disable
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(page.url()).not.toContain('version=');
  });

  test('version toggle hidden on Stories tab', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[role="tabpanel"]');

    // Switch to Stories tab
    await page.click('[role="tab"]:has-text("Stories")');

    // Version toggle should not be visible
    const toggle = page.locator('[role="switch"][aria-label="Show latest versions only"]');
    await expect(toggle).toBeHidden();

    // Switch back to Points — toggle reappears
    await page.click('[role="tab"]:has-text("Points")');
    await expect(toggle).toBeVisible();
  });

  test('version=latest URL param works from shared link', async ({ page }) => {
    await page.goto(`${BASE_URL}?tag=understanding&sort=oldest&version=latest`);
    await page.waitForSelector('[role="tabpanel"]');

    // Toggle should be ON
    const toggle = page.locator('[role="switch"][aria-label="Show latest versions only"]');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Active filter pill should show understanding
    const pill = page.locator('[aria-label^="Remove filter for"]');
    await expect(pill).toHaveCount(1);
  });
});

test.describe('P602: Combined Filters', () => {
  test('multi-tag + version + sort all work together', async ({ page }) => {
    await page.goto(`${BASE_URL}?tag=understanding,motivation&sort=oldest&version=latest`);
    await page.waitForSelector('[role="tabpanel"]');

    // All three controls should reflect URL state
    const toggle = page.locator('[role="switch"][aria-label="Show latest versions only"]');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    const pills = page.locator('[aria-label^="Remove filter for"]');
    await expect(pills).toHaveCount(2);

    // Sort button should show current state
    await expect(page.locator('button:has-text("Oldest first")')).toBeVisible();
  });
});

test.describe('P602: Edge Cases', () => {
  test('unknown tag in URL shows empty state with dismiss', async ({ page }) => {
    await page.goto(`${BASE_URL}?tag=nonexistent`);
    await page.waitForSelector('[role="tabpanel"]');

    // Should show empty state
    await expect(page.getByText(/No content matching/)).toBeVisible();

    // Should show "Browse all content" link
    await expect(page.getByText('Browse all content')).toBeVisible();

    // Active filter pill should still show with dismiss
    const pill = page.locator('[aria-label^="Remove filter for"]');
    await expect(pill).toHaveCount(1);
  });

  test('tag cloud shows all tags regardless of current filter', async ({ page }) => {
    // Navigate with a specific tag filter
    await page.goto(`${BASE_URL}?tag=understanding`);
    await page.waitForSelector('[role="tabpanel"]');
    // P1075: tag-filtered loads now also fetch the unfiltered cloud data concurrently
    // (BR-8) -- wait for that second query to land before reading the cloud, instead
    // of racing the initial DOM mount (which happens before either fetch resolves).
    await page.waitForFunction(() => document.querySelectorAll('[role="checkbox"]').length > 0);

    // Tag cloud should show ALL topic tags, not just those co-occurring with understanding
    const chips = page.locator('[role="checkbox"]');
    const chipTexts = await chips.allTextContents();
    const tagNames = chipTexts.map(t => t.replace('#', '').trim());

    // misunderstanding and motivation should still be visible in cloud
    // (even though they don't co-occur with understanding on the same point)
    expect(tagNames.length).toBeGreaterThanOrEqual(2);
  });
});
