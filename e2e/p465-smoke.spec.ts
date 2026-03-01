/**
 * @file p465-smoke.spec.ts
 * @description Smoke tests for P465: Point card footer redesign.
 *
 * Verifies that the affected profile surfaces load without JS errors after
 * P465 implementation lands. Tests run with seeded data to ensure the footer
 * renders (a crashed component before footer rendering would show console errors).
 *
 * Surfaces:
 *   - Own profile Points tab (own-profile unified footer)
 *   - Other profile Points tab (other-profile CTA + stories row)
 *   - Own profile (story exists, unified row — no CTA)
 *
 * Console error filter: suppresses known non-critical patterns.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import {
  createTestPoint,
  createTestPosition,
  deleteTestPoint,
  type TestPoint,
} from './helpers/test-point';
import {
  createTestStory,
  linkStoryToPoint,
  deleteTestStory,
  type TestStory,
} from './helpers/test-story';

// ─── Known non-critical error patterns ────────────────────────────────────────

const SUPPRESSED_ERROR_PATTERNS = [
  /supabase.*realtime/i,
  /WebSocket.*failed/i,
  /net::ERR_/i,
  /\[vite\]/i,
];

function isKnownNonCritical(msg: string): boolean {
  return SUPPRESSED_ERROR_PATTERNS.some(p => p.test(msg));
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

let viewer: TestUser;
let owner: TestUser;
let point: TestPoint;           // owned by viewer (own-profile test)
let otherPoint: TestPoint;      // owned by owner (other-profile test)
let viewerStory: TestStory;
let ownerStory: TestStory;

test.beforeAll(async () => {
  viewer = await createTestUser({ name: 'P465Smoke' });
  owner = await createTestUser({ name: 'P465SmokeOwner' });

  // Own-profile point: viewer owns it, has position, has a linked story
  point = await createTestPoint(viewer.user.id, {
    statement: `P465 smoke own point ${Date.now()}`,
  });
  await createTestPosition(point.id, viewer.user.id, 'agree');
  viewerStory = await createTestStory(viewer.user.id, {
    title: `P465 smoke viewer story ${Date.now()}`,
    content: 'Viewer story for smoke test.',
  });
  await linkStoryToPoint(viewerStory.id, point.id);

  // Other-profile point: owner owns it, viewer has position, owner has story
  otherPoint = await createTestPoint(owner.user.id, {
    statement: `P465 smoke other point ${Date.now()}`,
  });
  await createTestPosition(otherPoint.id, viewer.user.id, 'agree');
  ownerStory = await createTestStory(owner.user.id, {
    title: `P465 smoke owner story ${Date.now()}`,
    content: 'Owner story for smoke test.',
  });
  await linkStoryToPoint(ownerStory.id, otherPoint.id);
});

test.afterAll(async () => {
  if (viewerStory?.id) await deleteTestStory(viewerStory.id);
  if (ownerStory?.id) await deleteTestStory(ownerStory.id);
  if (point?.id) await deleteTestPoint(point.id);
  if (otherPoint?.id) await deleteTestPoint(otherPoint.id);
  if (viewer?.user?.id) await deleteTestUser(viewer.user.id);
  if (owner?.user?.id) await deleteTestUser(owner.user.id);
});

// ─── Smoke tests ──────────────────────────────────────────────────────────────

test.describe('P465 Smoke — pages load without JS errors', () => {
  test.describe.configure({ timeout: 60000 });

  test('own profile (Points tab) loads without console errors — story exists state', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, viewer.email);
    await page.goto(`/${viewer.slug}`);
    await page.waitForLoadState('networkidle');

    // Profile must render viewer's name
    await expect(page.getByText(viewer.name)).toBeVisible({ timeout: 10000 });

    // Footer must render (story count visible — story exists state)
    await expect(page.getByText(/1\s+stor(y|ies)/i)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on own profile /${viewer.slug}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('other profile (Points tab) loads without console errors — CTA state', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, viewer.email);
    await page.goto(`/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Owner's profile must render
    await expect(page.getByText(owner.name)).toBeVisible({ timeout: 10000 });

    // CTA must render (viewer has position, no viewer story on this point)
    await expect(page.getByText(/Why do you agree\?/)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on other profile /${owner.slug}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('own profile loads without errors for no-position state (no footer)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // Owner visits their own profile (has no position on their own point — different point for them)
    await setTestSession(page, owner.email);
    await page.goto(`/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(owner.name)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on owner's profile /${owner.slug}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('profile page loads without errors for anonymous visitor', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // No session — anonymous browse
    await page.goto(`/${viewer.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(viewer.name)).toBeVisible({ timeout: 10000 });

    // No CTA for anonymous viewer (no position state)
    await expect(page.getByText(/Why do you agree\?/)).not.toBeVisible();
    await expect(page.getByText(/Why do you disagree\?/)).not.toBeVisible();

    // Stories row still visible (public data)
    await expect(page.getByText(/stor(y|ies)/i)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors for anonymous visitor on /${viewer.slug}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('no duplicate story count rows on any profile state', async ({ page }) => {
    await setTestSession(page, viewer.email);

    // Own profile — story exists state (unified row, no duplication)
    await page.goto(`/${viewer.slug}`);
    await page.waitForLoadState('networkidle');

    // Count visible elements matching story count pattern
    const matches = await page.getByText(/\d+\s+stor(y|ies)/i).all();
    let visibleCount = 0;
    for (const el of matches) {
      if (await el.isVisible()) visibleCount++;
    }

    expect(
      visibleCount,
      `Found ${visibleCount} visible story-count elements — expected exactly 1 (no duplication)`
    ).toBe(1);
  });
});
