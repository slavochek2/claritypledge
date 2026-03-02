/**
 * @file p465-point-card-footer.spec.ts
 * @description E2E tests for P465: Point card footer — unified row, no actor confusion
 *
 * Tests 4 flows from the spec:
 * - Flow 1: Own profile, no story → CTA visible, no "✓ Agree ·" prefix
 * - Flow 2: Own profile, story exists → CTA hidden, single unified row (no duplication)
 * - Flow 3: Other profile, viewer has no story → CTA above stories row, owner attribution
 * - Flow 4: Other profile, viewer has story → CTA hidden, "by you" visible
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import { createTestUser, setTestSession } from './helpers/test-user';
import type { TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, deleteTestStory } from './helpers/test-story';

// P465 helper: inserts story_point with author_id (requires migration to be applied)
async function linkStoryToPoint(storyId: string, pointId: string, authorId: string) {
  const { error } = await supabaseAdmin
    .from('story_points')
    .insert({ story_id: storyId, point_id: pointId, author_id: authorId });
  if (error) throw new Error(`linkStoryToPoint failed: ${error.message}`);
}

// ── Flow 1: Own profile, no story ──────────────────────────────────────────
test.describe('Flow 1 — Own profile, no story: CTA visible, no actor confusion', () => {
  let viewer: TestUser;
  let pointId: string;

  test.beforeEach(async ({ page }) => {
    viewer = await createTestUser({ name: 'P465 F1 Viewer' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 E2E Flow1 ${Date.now()}`,
    });
    pointId = point.id;
    await createTestPosition(pointId, viewer.user.id, 'agree');
    await setTestSession(page, viewer.email);
  });

  test.afterEach(async () => {
    if (pointId) await deleteTestPoint(pointId);
    if (viewer?.user?.id) await supabaseAdmin.auth.admin.deleteUser(viewer.user.id);
  });

  test('CTA is visible when no story exists', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    const cta = page.getByText(/why do you agree/i);
    await expect(cta).toBeVisible();
  });

  test('"✓ Agree ·" actor-confusion prefix is absent from CTA row', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // The old P456 pattern that caused actor confusion must not appear
    await expect(page.getByText(/✓ agree ·/i)).not.toBeVisible();
  });

  test('story count appears at most once (no duplication)', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // "0 stories" should appear at most once, not duplicated across two rows
    const count = await page.getByText(/0 stories/i).count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Flow 2: Own profile, story exists ─────────────────────────────────────
test.describe('Flow 2 — Own profile, story exists: CTA hidden, no count duplication', () => {
  let viewer: TestUser;
  let pointId: string;
  let storyId: string;

  test.beforeEach(async ({ page }) => {
    viewer = await createTestUser({ name: 'P465 F2 Viewer' });
    const point = await createTestPoint(viewer.user.id, {
      statement: `P465 E2E Flow2 ${Date.now()}`,
    });
    pointId = point.id;
    await createTestPosition(pointId, viewer.user.id, 'agree');

    const story = await createTestStory(viewer.user.id, {
      title: 'P465 Flow2 Story',
      content: 'My story for this point',
    });
    storyId = story.id;
    await linkStoryToPoint(storyId, pointId, viewer.user.id);
    await setTestSession(page, viewer.email);
  });

  test.afterEach(async () => {
    if (pointId) await deleteTestPoint(pointId);
    if (storyId) await deleteTestStory(storyId);
    if (viewer?.user?.id) await supabaseAdmin.auth.admin.deleteUser(viewer.user.id);
  });

  test('CTA is hidden when story already exists', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/why do you agree/i)).not.toBeVisible();
  });

  test('"1 story" appears exactly once (no P456 duplication bug)', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    const count = await page.getByText(/1 story/i).count();
    // Duplication would show 2 — this is the core regression check for P465
    expect(count).toBe(1);
  });
});

// ── Flow 3: Other profile, viewer has no story ────────────────────────────
test.describe('Flow 3 — Other profile, viewer has no story: CTA above stories row', () => {
  let owner: TestUser;
  let viewer: TestUser;
  let pointId: string;
  let ownerStoryId: string;

  test.beforeEach(async ({ page }) => {
    owner = await createTestUser({ name: 'P465 F3 Owner' });
    viewer = await createTestUser({ name: 'P465 F3 Viewer' });
    const point = await createTestPoint(owner.user.id, {
      statement: `P465 E2E Flow3 ${Date.now()}`,
    });
    pointId = point.id;
    await createTestPosition(pointId, owner.user.id, 'agree');
    await createTestPosition(pointId, viewer.user.id, 'agree');

    const ownerStory = await createTestStory(owner.user.id, {
      title: 'P465 Flow3 Owner Story',
      content: 'Owner story for this point',
    });
    ownerStoryId = ownerStory.id;
    await linkStoryToPoint(ownerStoryId, pointId, owner.user.id);
    await setTestSession(page, viewer.email);
  });

  test.afterEach(async () => {
    if (pointId) await deleteTestPoint(pointId);
    if (ownerStoryId) await deleteTestStory(ownerStoryId);
    if (owner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(owner.user.id);
    if (viewer?.user?.id) await supabaseAdmin.auth.admin.deleteUser(viewer.user.id);
  });

  test('CTA is visible on other profile when viewer has no story', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/why do you agree/i)).toBeVisible();
  });

  test('stories row attributes to profile owner, not viewer', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // "by [owner name]" should appear — owner attribution, not viewer's
    await expect(page.getByText(/by p465 f3 owner/i)).toBeVisible();
  });

  test('CTA row is positioned above stories row (no actor confusion ordering)', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    const cta = page.getByText(/why do you agree/i);
    const storiesRow = page.getByText(/by p465 f3 owner/i);

    const ctaBounds = await cta.boundingBox();
    const storiesBounds = await storiesRow.boundingBox();

    expect(ctaBounds).not.toBeNull();
    expect(storiesBounds).not.toBeNull();
    // CTA must render above stories row (lower Y = higher on page)
    expect(ctaBounds!.y).toBeLessThan(storiesBounds!.y);
  });
});

// ── Flow 4: Other profile, viewer HAS a story ─────────────────────────────
test.describe('Flow 4 — Other profile, viewer has story: CTA hidden, "by you" visible', () => {
  let owner: TestUser;
  let viewer: TestUser;
  let pointId: string;
  let ownerStoryId: string;
  let viewerStoryId: string;

  test.beforeEach(async ({ page }) => {
    owner = await createTestUser({ name: 'P465 F4 Owner' });
    viewer = await createTestUser({ name: 'P465 F4 Viewer' });
    const point = await createTestPoint(owner.user.id, {
      statement: `P465 E2E Flow4 ${Date.now()}`,
    });
    pointId = point.id;
    await createTestPosition(pointId, owner.user.id, 'agree');
    await createTestPosition(pointId, viewer.user.id, 'agree');

    const ownerStory = await createTestStory(owner.user.id, {
      title: 'P465 Flow4 Owner Story',
      content: 'Owner story',
    });
    ownerStoryId = ownerStory.id;

    const viewerStory = await createTestStory(viewer.user.id, {
      title: 'P465 Flow4 Viewer Story',
      content: 'Viewer story',
    });
    viewerStoryId = viewerStory.id;

    await linkStoryToPoint(ownerStoryId, pointId, owner.user.id);
    await linkStoryToPoint(viewerStoryId, pointId, viewer.user.id);
    await setTestSession(page, viewer.email);
  });

  test.afterEach(async () => {
    if (pointId) await deleteTestPoint(pointId);
    if (ownerStoryId) await deleteTestStory(ownerStoryId);
    if (viewerStoryId) await deleteTestStory(viewerStoryId);
    if (owner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(owner.user.id);
    if (viewer?.user?.id) await supabaseAdmin.auth.admin.deleteUser(viewer.user.id);
  });

  test('CTA is hidden when viewer already has a story', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/why do you agree/i)).not.toBeVisible();
  });

  test('"by you" suffix visible in stories row when viewer has a story', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/by you/i)).toBeVisible();
  });
});
