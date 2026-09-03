/**
 * @file story-position-isolation.spec.ts
 * @description E2E regression test: viewer's position must not affect author's displayed position
 *
 * Bug: On the story detail page, when a viewer sets their position on a linked point,
 * the position badge next to the *author's* name changed to reflect the viewer's choice.
 *
 * Fix (StoryCardDetail.tsx): separate `profileOwnerPositions` (author's) from
 * `userPositions` (viewer's). The badge uses the author's data; the buttons use the viewer's.
 *
 * Setup notes:
 * - Story must be created via browser UI (story_versions trigger blocks admin API inserts)
 * - Point and position are created via admin API after story creation
 * - Two-user scenario: author creates story/point, viewer sets a different position
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('Story Detail - Position Isolation', () => {
  let authorUser: TestUser;
  let viewerUser: TestUser;
  let storyId: string;
  let pointId: string;

  test.beforeEach(async ({ page }) => {
    authorUser = await createTestUser({ name: 'Author User' });
    viewerUser = await createTestUser({ name: 'Viewer User' });

    // Step 1: Create story via browser UI as the author (required — admin insert blocked by story_versions trigger)
    await setTestSession(page, authorUser.email);
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    await page.locator('textarea#story-content').fill('Position isolation test story');
    await page.getByRole('button', { name: /save story/i }).click();

    // Wait for redirect to story detail and extract story ID
    await expect(page).toHaveURL(/\/story\/[a-f0-9-]+/, { timeout: 15000 });
    storyId = page.url().split('/story/')[1];

    // Step 2: Create a point via admin API and link it to the story
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Position isolation test point',
        first_validator_id: authorUser.user.id,
        tags: ['test', 'position-isolation'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) throw new Error(`Failed to create point: ${pointError?.message}`);
    pointId = pointData.id;

    // Link point to story (service_role bypass policy exists for story_points)
    const { error: linkError } = await supabaseAdmin
      .from('story_points')
      .insert({ story_id: storyId, point_id: pointId });
    if (linkError) throw new Error(`Failed to link point: ${linkError.message}`);

    // Step 3: Set author's position to "agree" via direct insert (upsert hits UPDATE RLS — insert OK)
    const { error: positionError } = await supabaseAdmin
      .from('point_positions')
      .insert({ point_id: pointId, user_id: authorUser.user.id, position: 'agree' });
    if (positionError) throw new Error(`Failed to create author position: ${positionError.message}`);
  });

  test.afterEach(async () => {
    if (pointId) await supabaseAdmin.from('points').delete().eq('id', pointId);
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    if (authorUser?.user?.id) await deleteTestUser(authorUser.user.id);
    if (viewerUser?.user?.id) await deleteTestUser(viewerUser.user.id);
  });

  test('author position badge does not change when viewer sets their own position', async ({ page }) => {
    // Viewer navigates to the story (fresh page load — viewer has no prior position)
    await setTestSession(page, viewerUser.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    // Story and linked point should be visible (isDetailView=true → auto-expanded)
    await expect(page.getByText('Position isolation test story')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Position isolation test point')).toBeVisible({ timeout: 10000 });

    // The author header in QuotedPoint: a flex div containing the author name span + PositionBadge
    // Target the <span class="font-medium"> that exactly contains the author name
    const authorNameSpan = page.locator('span.font-medium', { hasText: /^Author User$/ });
    await expect(authorNameSpan).toBeVisible();

    // Author's badge should show "Agrees" (their own position — profileOwnerPositions)
    // The badge is a sibling span inside the same flex row
    const authorRow = page.locator('div.flex.items-center', {
      has: page.locator('span.font-medium', { hasText: /^Author User$/ }),
    }).first();
    await expect(authorRow.getByText('Agrees')).toBeVisible();

    // Viewer clicks Disagree
    const disagreeButton = page.getByRole('button', { name: /^Disagree/i }).first();
    await expect(disagreeButton).toBeVisible();
    await disagreeButton.click();
    await page.waitForTimeout(1000);

    // THE KEY ASSERTION: author's badge must still show "Agrees" — not "Disagrees"
    await expect(authorRow.getByText('Agrees')).toBeVisible();
    await expect(authorRow.getByText('Disagrees')).not.toBeVisible();
  });

  test('viewer position buttons update independently of author badge', async ({ page }) => {
    await setTestSession(page, viewerUser.email);
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Position isolation test point')).toBeVisible({ timeout: 10000 });

    const authorRow = page.locator('div.flex.items-center', {
      has: page.locator('span.font-medium', { hasText: /^Author User$/ }),
    }).first();

    // Viewer clicks Agree — author badge must stay "Agrees"
    const agreeButton = page.getByRole('button', { name: /^Agree/i }).first();
    await agreeButton.click();
    await page.waitForTimeout(800);
    await expect(authorRow.getByText('Agrees')).toBeVisible();

    // Viewer switches to Disagree — author badge must STILL stay "Agrees"
    const disagreeButton = page.getByRole('button', { name: /^Disagree/i }).first();
    await disagreeButton.click();
    await page.waitForTimeout(800);

    await expect(authorRow.getByText('Agrees')).toBeVisible();
    await expect(authorRow.getByText('Disagrees')).not.toBeVisible();
  });
});
