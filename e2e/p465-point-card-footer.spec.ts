/**
 * @file p465-point-card-footer.spec.ts
 * @description E2E tests for P465 + P822: Point card footer — unified row, no actor confusion
 *
 * Tests 4 flows from the spec:
 * - Flow 1: Own profile, no story → pill CTA visible inline with "0 stories" (P822 parity)
 * - Flow 2: Own profile, story exists → CTA hidden, single unified row (no duplication)
 * - Flow 3: Other profile → CTA does NOT render (P579 + P822 isOwnProfile gate)
 * - Flow 4: Other profile, viewer has story → CTA hidden, "✏ your story" visible
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
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

    const cta = page.getByRole('button', { name: /add your story for this point/i });
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

  test('story count appears exactly once (no duplication)', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // After P822: "0 stories" appears exactly once inline with the pill
    const count = await page.getByText(/0 stories/i).count();
    expect(count).toBe(1);
  });

  test('CTA pill renders inline with story count (P822 symmetry)', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    const cta = page.getByRole('button', { name: /add your story for this point/i });
    await expect(cta).toBeVisible();

    // Structural: pill and "0 stories" label share the same flex parent
    const sharedParent = cta.locator('xpath=..');
    await expect(sharedParent).toContainText(/0 stories/i);
    await expect(sharedParent).toHaveClass(/flex/);
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

    await expect(
      page.getByRole('button', { name: /add your story for this point/i })
    ).not.toBeVisible();
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

// ── Flow 3: Other profile ─────────────────────────────────────────────────
test.describe('Flow 3 — Other profile: CTA absent (P579 + P822 isOwnProfile gate)', () => {
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

  test('Add-your-story CTA does not render on other profiles (P579 + P822)', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /add your story for this point/i })
    ).not.toBeVisible();
  });

  test('stories row attributes to profile owner, not viewer', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // "by [owner name]" should appear — owner attribution, not viewer's
    await expect(page.getByText(/by p465 f3 owner/i)).toBeVisible();
  });
});

// ── Flow 4: Other profile, viewer HAS a story ─────────────────────────────
test.describe('Flow 4 — Other profile, viewer has story: CTA hidden, edit link visible', () => {
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

    await expect(
      page.getByRole('button', { name: /add your story for this point/i })
    ).not.toBeVisible();
  });

  test('"✏ your story" edit link visible in stories row when viewer has a story', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/✏ your story/i)).toBeVisible();
  });
});
