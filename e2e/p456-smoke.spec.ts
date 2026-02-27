/**
 * @file p456-smoke.spec.ts
 * @description Smoke tests for P456: Story CTA footer consistency.
 *
 * Verifies that the 6 affected surfaces load without JS errors after the P456
 * implementation lands. Tests run as an authenticated viewer with a position
 * pre-seeded so the footer renders — if the page crashed before rendering the
 * footer, we'd see console errors here.
 *
 * Surfaces tested:
 *   - /point/:id         (point-detail-page.tsx)
 *   - /:slug             (profile-page-v2 — Points tab default)
 *   - /story/:id         (StoryCardDetail.tsx + story-card-with-links.tsx context)
 *
 * /live is omitted from smoke — it requires mic permission and a full session
 * setup that is not appropriate for a lightweight smoke gate.
 *
 * Console error filter: suppresses known non-critical patterns (e.g., Supabase
 * realtime WebSocket errors that fire in test environments).
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory, type TestStory } from './helpers/test-story';

// ─── Known non-critical error patterns to suppress ────────────────────────────

const SUPPRESSED_ERROR_PATTERNS = [
  /supabase.*realtime/i,
  /WebSocket.*failed/i,
  /net::ERR_/i,
  // Vite HMR noise in test mode
  /\[vite\]/i,
];

function isKnownNonCritical(msg: string): boolean {
  return SUPPRESSED_ERROR_PATTERNS.some(p => p.test(msg));
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let viewer: TestUser;
let point: TestPoint;
let linkedStory: TestStory;
let storyWithLinkedPoint: TestStory;

test.beforeAll(async () => {
  viewer = await createTestUser({ name: 'P456Smoke' });

  // Create point and seed an agree position for the viewer
  point = await createTestPoint(viewer.user.id, {
    statement: `P456 smoke test point ${Date.now()}`,
  });
  await createTestPosition(point.id, viewer.user.id, 'agree');

  // Create a story that links to the point (for story-card-with-links surface)
  storyWithLinkedPoint = await createTestStory(viewer.user.id, {
    title: `P456 smoke story with point ${Date.now()}`,
    content: 'Smoke test story that references the test point.',
  });
  await linkStoryToPoint(storyWithLinkedPoint.id, point.id);

  // Create a separate story linked to the point (for split footer on point detail)
  linkedStory = await createTestStory(viewer.user.id, {
    title: `P456 smoke linked story ${Date.now()}`,
    content: 'Linked story for smoke — creates split footer state.',
  });
  await linkStoryToPoint(linkedStory.id, point.id);
});

test.afterAll(async () => {
  if (storyWithLinkedPoint?.id) await deleteTestStory(storyWithLinkedPoint.id);
  if (linkedStory?.id) await deleteTestStory(linkedStory.id);
  if (point?.id) await deleteTestPoint(point.id);
  if (viewer?.user?.id) await deleteTestUser(viewer.user.id);
});

// ─── Smoke tests ─────────────────────────────────────────────────────────────

test.describe('P456 Smoke — pages load without JS errors after implementation', () => {
  test.describe.configure({ timeout: 60000 });

  test('point detail page (/point/:id) loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, viewer.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    // Point statement must be visible (page rendered correctly)
    await expect(page.getByText(point.statement)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on /point/${point.id}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('profile page (/:slug) loads without console errors (Points tab)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, viewer.email);
    await page.goto(`/${viewer.slug}`);
    await page.waitForLoadState('networkidle');

    // Profile must show the user's name
    await expect(page.getByText(viewer.name)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on /${viewer.slug}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('story detail page (/story/:id) with linked point loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, viewer.email);
    await page.goto(`/story/${storyWithLinkedPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Story content must be visible
    await expect(page.getByText(storyWithLinkedPoint.content)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on /story/${storyWithLinkedPoint.id}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  // Verify the point detail split-footer state also loads without errors
  test('point detail with linked story (split footer state) loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, viewer.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    // Split footer should be visible (2 stories linked)
    await expect(page.getByText(/stor(y|ies)/i)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on split-footer state: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  // Anonymous visitor — footer should not render (no position state) but pages must not crash
  test('point detail page loads without errors for anonymous visitor (no footer)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // No setTestSession — anonymous browse
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(point.statement)).toBeVisible({ timeout: 10000 });

    // No footer should render for anonymous viewer
    await expect(page.getByText(/Why do you agree\?/)).not.toBeVisible();

    expect(
      consoleErrors,
      `Console errors on anonymous /point/${point.id}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });
});
