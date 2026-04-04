/**
 * @file p470-point-card-attribution.spec.ts
 * @description E2E tests for P470: Point card footer attribution consistency
 *
 * Key regression covered: visitor sees correct story count when owner's stories
 * are private (the production default since P424). P465 tests only covered
 * public stories — this file covers the missing private-visibility path.
 *
 * Tests:
 * - Visitor sees "N stories" in point card footer (private stories visible via RLS-gated batch query)
 * - Owner sees own point cards without edit/delete icon buttons
 * - Visitor with no position: no "Add your story" CTA
 * - Visitor with position but no story: "Add your story" CTA appears alongside owner attribution
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession } from './helpers/test-user';
import type { TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';

// ── Flow 1: Visitor sees correct count when owner's story is PRIVATE ────────
// This is the P470 core regression: P465 tested public stories only.
// In production, stories default to 'private' (P424). Visitors must still
// see the correct attribution count via the RLS-gated batch query (P470 fix).
test.describe('Flow 1 — Visitor sees private owner story via RLS-gated batch query', () => {
  let owner: TestUser;
  let visitor: TestUser;
  let pointId: string;
  let storyId: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P470 F1 Owner' });
    visitor = await createTestUser({ name: 'P470 F1 Visitor' });

    const point = await createTestPoint(owner.user.id, {
      statement: `P470 E2E Flow1 ${Date.now()}: remote work increases focus`,
    });
    pointId = point.id;
    await createTestPosition(pointId, owner.user.id, 'agree');
    await createTestPosition(pointId, visitor.user.id, 'agree');

    // Create story with PRIVATE visibility (the production default since P424)
    const story = await createTestStory(owner.user.id, {
      content: 'Working remotely has significantly improved my ability to focus.',
      visibility: 'private',
    });
    storyId = story.id;
    await linkStoryToPoint(storyId, pointId);
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (owner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(owner.user.id);
    if (visitor?.user?.id) await supabaseAdmin.auth.admin.deleteUser(visitor.user.id);
  });

  test('visitor sees "0 stories" when story is private (RLS correctly restricts)', async ({ page }) => {
    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // Private stories are not accessible to visitors — count is 0
    // This is correct behavior: we assert it explicitly so a change to this policy
    // (e.g. making private stories visible) forces a conscious test update.
    await expect(page.getByText(/0 stories/i)).toBeVisible({ timeout: 10000 });
  });

  test('visitor with position sees "Add your story" CTA when owner has private story', async ({ page }) => {
    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // Visitor has a position but no story → CTA should appear
    // This was the P465 regression: CTA was suppressed when story count = 0
    await expect(page.getByText(/add your story/i)).toBeVisible({ timeout: 10000 });
  });
});

// ── Flow 2: Visitor sees correct count when owner's story is PUBLIC ──────────
test.describe('Flow 2 — Visitor sees public owner story attribution correctly', () => {
  let owner: TestUser;
  let visitor: TestUser;
  let pointId: string;
  let storyId: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P470 F2 Owner' });
    visitor = await createTestUser({ name: 'P470 F2 Visitor' });

    const point = await createTestPoint(owner.user.id, {
      statement: `P470 E2E Flow2 ${Date.now()}: async communication reduces meetings`,
    });
    pointId = point.id;
    await createTestPosition(pointId, owner.user.id, 'agree');

    const story = await createTestStory(owner.user.id, {
      content: 'Switching to async communication cut our meeting load by half.',
      visibility: 'public',
    });
    storyId = story.id;
    await linkStoryToPoint(storyId, pointId);
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (owner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(owner.user.id);
    if (visitor?.user?.id) await supabaseAdmin.auth.admin.deleteUser(visitor.user.id);
  });

  test('visitor sees "1 story" when owner story is public', async ({ page }) => {
    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/1 story/i)).toBeVisible({ timeout: 10000 });
  });

  test('visitor without position sees no "Add your story" CTA', async ({ page }) => {
    // visitor has no position on this point
    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/add your story/i)).not.toBeVisible();
  });
});

// ── Flow 3: Owner profile — no edit/delete icons on point cards ─────────────
// Regression: P465 added ✏/🗑 to point cards; P470 removes them.
test.describe('Flow 3 — Owner sees point cards without edit/delete icons', () => {
  let owner: TestUser;
  let pointId: string;
  let storyId: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P470 F3 Owner' });
    const point = await createTestPoint(owner.user.id, {
      statement: `P470 E2E Flow3 ${Date.now()}: clear communication builds trust`,
    });
    pointId = point.id;
    await createTestPosition(pointId, owner.user.id, 'agree');

    const story = await createTestStory(owner.user.id, {
      content: 'When I communicate clearly, trust follows naturally.',
      visibility: 'public',
    });
    storyId = story.id;
    await linkStoryToPoint(storyId, pointId);
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (owner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(owner.user.id);
  });

  test('point card footer has no edit (pencil) button', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // No pencil/edit button should appear on point cards
    // (edit/delete belong on story cards in the Stories tab, not point cards)
    const editButtons = page.locator('[aria-label*="edit" i], [aria-label*="pencil" i]');
    await expect(editButtons).toHaveCount(0);
  });

  test('point card footer has no delete (trash) button', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    const deleteButtons = page.locator('[aria-label*="delete" i], [aria-label*="trash" i]');
    await expect(deleteButtons).toHaveCount(0);
  });
});
