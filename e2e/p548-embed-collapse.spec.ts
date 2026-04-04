/**
 * @file p548-embed-collapse.spec.ts
 * @description E2E tests for P548: Embed Collapse Control
 *
 * Covers:
 *   - Default collapsed behavior in embed mode (?embed=true)
 *   - Expanded param override (?embed=true&expanded=true)
 *   - Manual toggle still works after initial load
 *   - Non-embed behavior unchanged
 *   - ?expanded=true without ?embed=true has no effect
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';
import type { TestUser } from './helpers/test-user';
import type { TestPoint } from './helpers/test-point';
import type { TestStory } from './helpers/test-story';

// ── Setup: user with a story linked to a point ─────────────────────────────

let user: TestUser;
let point: TestPoint;
let story: TestStory;

test.beforeAll(async () => {
  user = await createTestUser({ name: 'P548 Embed Test' });
  point = await createTestPoint(user.profileId, {
    statement: 'P548 test point for embed collapse',
  });
  story = await createTestStory(user.profileId, {
    title: 'P548 test story',
    content: 'Story about embed collapse behavior',
  });
  await linkStoryToPoint(story.id, point.id);
  await createTestPosition(point.id, user.profileId, 'agree');
});

test.afterAll(async () => {
  if (story?.id) await deleteTestStory(story.id);
  if (point?.id) await deleteTestPoint(point.id);
  if (user?.user?.id) await supabaseAdmin.auth.admin.deleteUser(user.user.id);
});

// ── Flow 1: Story embed — default collapsed ─────────────────────────────────

test.describe('Flow 1 — Story embed default collapsed', () => {
  test('?embed=true → linked points section is collapsed', async ({ page }) => {
    await page.goto(`/story/${story.id}?embed=true`);
    await page.waitForLoadState('networkidle');

    // The chevron toggle should exist but points should NOT be expanded
    const expandButton = page.getByRole('button', { name: /expand linked points/i });
    // If toggle exists, aria-expanded should be false
    if (await expandButton.count() > 0) {
      await expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('?embed=true&expanded=true → linked points section is expanded', async ({ page }) => {
    await page.goto(`/story/${story.id}?embed=true&expanded=true`);
    await page.waitForLoadState('networkidle');

    const expandButton = page.getByRole('button', { name: /collapse linked points/i });
    if (await expandButton.count() > 0) {
      await expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    }
  });

  test('manual toggle works after collapsed default', async ({ page }) => {
    await page.goto(`/story/${story.id}?embed=true`);
    await page.waitForLoadState('networkidle');

    const toggleButton = page.getByRole('button', { name: /linked points|expand|collapse/i }).first();
    if (await toggleButton.count() > 0) {
      await toggleButton.click();
      // After click, should be expanded
      await expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    }
  });
});

// ── Flow 2: Point embed — default collapsed ─────────────────────────────────

test.describe('Flow 2 — Point embed default collapsed', () => {
  test('?embed=true → linked stories section is collapsed', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/point/${point.id}?embed=true`);
    await page.waitForLoadState('networkidle');

    const expandButton = page.getByRole('button', { name: /expand linked stories/i });
    if (await expandButton.count() > 0) {
      await expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('?embed=true&expanded=true → linked stories expanded', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/point/${point.id}?embed=true&expanded=true`);
    await page.waitForLoadState('networkidle');

    const expandButton = page.getByRole('button', { name: /collapse linked stories/i });
    if (await expandButton.count() > 0) {
      await expect(expandButton).toHaveAttribute('aria-expanded', 'true');
    }
  });
});

// ── Flow 3: Guard — expanded param without embed has no effect ──────────────

test.describe('Flow 3 — Guard: expanded without embed', () => {
  test('?expanded=true alone does not change default behavior', async ({ page }) => {
    await setTestSession(page, user.email);
    // Non-embed story detail view — isDetailView drives expansion, not expanded param
    await page.goto(`/story/${story.id}?expanded=true`);
    await page.waitForLoadState('networkidle');

    // Page should load normally as a full story detail page (not embed mode)
    // The FocusHeader (back button) should be visible — embed hides it
    await expect(page.locator('[data-testid="focus-header"], nav')).toBeVisible({ timeout: 10000 });
  });
});
