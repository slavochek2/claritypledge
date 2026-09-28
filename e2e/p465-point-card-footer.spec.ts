/**
 * @file p465-point-card-footer.spec.ts
 * @description E2E tests for P465 + P822: Point card footer — unified row, no actor confusion
 *
 * Tests 4 flows from the spec:
 * - Flow 1: Own profile, no story → pill CTA visible inline with "0 stories" (P822 parity)
 * - Flow 2: Own profile, story exists → CTA hidden, single unified row (no duplication)
 * - Flow 3: Other profile → CTA does NOT render (P579 + P822 isOwnProfile gate)
 * - Flow 4: Other profile, viewer has story → CTA hidden, "✏ your story" visible
 *
 * P1366 re-laid the profile list footer (prototype K) and changed three of these rules:
 * - the CTA is "+ Add a story"; at 0 stories it stands ALONE (no "0 stories" beside it);
 * - the profile's expander names whose story it is ("Your story" / "<First>'s story"), no count;
 * - a viewer holding a position on SOMEONE ELSE's profile is now invited too (Flow 3), and a
 *   viewer who wrote one sees "✓ Your story", which opens it to read — no edit param (Flow 4).
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

    const cta = page.getByRole('button', { name: /add a story for this point/i });
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

  test('P1366: at 0 stories the link stands alone — no "0 stories" beside it', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /add a story for this point/i })).toBeVisible();
    expect(await page.getByText(/0 stories/i).count()).toBe(0);
  });

  test('P1366: the link sits in the footer row with Details →', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    const cta = page.getByRole('button', { name: /add a story for this point/i });
    await expect(cta).toBeVisible();
    // left group → the row that also holds `Details →`
    const row = cta.locator('xpath=../..');
    await expect(row.getByRole('button', { name: 'Details for this point' })).toBeVisible();
    await expect(row).toHaveClass(/flex/);
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
      page.getByRole('button', { name: /add a story for this point/i })
    ).not.toBeVisible();
  });

  test('P1366: the expander reads "Your story" exactly once (no P456 duplication, no ✓ link on one\'s own profile)', async ({ page }) => {
    await page.goto(`/p/${viewer.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // Duplication would show 2 — this is the core regression check for P465
    await expect(page.getByRole('button', { name: 'Your story' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Your story' })).toHaveAttribute('aria-expanded', 'false');
  });
});

// ── Flow 3: Other profile ─────────────────────────────────────────────────
test.describe('Flow 3 — Other profile: P1366 invites the viewer too', () => {
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

  test('P1366: a viewer holding a position on someone else\'s profile sees + Add a story', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /add a story for this point/i })
    ).toBeVisible();
  });

  test('stories row attributes to profile owner, not viewer', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // P1366: the expander names the owner by first name ("P465 F3 Owner" → "P465's story").
    await expect(page.getByRole('button', { name: "P465's story" })).toBeVisible();
  });
});

// ── Flow 4: Other profile, viewer HAS a story ─────────────────────────────
test.describe('Flow 4 — Other profile, viewer has story: CTA hidden, ✓ Your story visible', () => {
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
      page.getByRole('button', { name: /add a story for this point/i })
    ).not.toBeVisible();
  });

  test('P1366: "✓ Your story" is visible and opens the story to READ (no edit param)', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    const mine = page.getByRole('button', { name: 'Your story' });
    await expect(mine).toBeVisible();
    await mine.click();
    await expect(page).toHaveURL(new RegExp(`/story/${viewerStoryId}$`));
  });
});
