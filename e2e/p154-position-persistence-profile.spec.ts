/**
 * @file p154-position-persistence-profile.spec.ts
 * @description E2E tests for P154 - Position Persistence on Profile Page
 *
 * Bug: Position buttons don't persist when clicked on profile page.
 * Root cause: Missing currentUserId prop and onPositionSelect callback wiring.
 *
 * Related: P154 - Position persistence broken on profile page
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('Position Persistence on Profile Page (P154)', () => {
  let testUser: TestUser;
  let testPointIds: string[] = [];

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'Position Persistence Test User' });
    testPointIds = [];
  });

  test.afterEach(async () => {
    // Clean up test points (must delete positions and history first due to FK constraints)
    if (testPointIds.length > 0) {
      // Delete position history entries first
      await supabaseAdmin.from('point_position_history').delete().in('point_id', testPointIds);

      // Delete positions
      await supabaseAdmin.from('point_positions').delete().in('point_id', testPointIds);

      // Delete points
      await supabaseAdmin.from('points').delete().in('id', testPointIds);
    }

    // Clean up test user
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('position buttons should be visible on profile page for authenticated users', async ({ page }) => {
    // Create a test point
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Test point: Position buttons should be visible',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p154'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointIds.push(pointData.id);

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();

    // Verify point appears
    await expect(page.getByText('Test point: Position buttons should be visible')).toBeVisible({ timeout: 10000 });

    // Verify position buttons are visible
    // Expected: Three position buttons (Agree, Disagree, Unsure) should be rendered
    const pointCard = page.locator('.border-l-4', { hasText: 'Test point: Position buttons should be visible' });
    await expect(pointCard).toBeVisible();

    // Find position buttons within the point card (use .first() to avoid matching dropdown)
    const agreeButton = pointCard.getByRole('button', { name: /^Agree/i }).first();
    const disagreeButton = pointCard.getByRole('button', { name: /^Disagree/i }).first();
    const unsureButton = pointCard.getByRole('button', { name: /^Unsure/i }).first();

    await expect(agreeButton).toBeVisible();
    await expect(disagreeButton).toBeVisible();
    await expect(unsureButton).toBeVisible();
  });

  test('clicking position button should save and persist after refresh', async ({ page }) => {
    // Create a test point
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Test point: Click should persist',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p154'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointIds.push(pointData.id);

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await expect(page.getByText('Test point: Click should persist')).toBeVisible({ timeout: 10000 });

    // Click "Agree" button
    const pointCard = page.locator('.border-l-4', { hasText: 'Test point: Click should persist' });
    const agreeButton = pointCard.getByRole('button', { name: /^Agree/i }).first();
    await agreeButton.click();

    // Wait for mutation to complete
    await page.waitForTimeout(3000);

    // Verify in database FIRST (to ensure mutation completed)
    const { data: savedPosition } = await supabaseAdmin
      .from('point_positions')
      .select('*')
      .eq('point_id', pointData.id)
      .eq('user_id', testUser.user.id)
      .single();
    expect(savedPosition?.position).toBe('agree');

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();

    // Verify position still shows after refresh
    await expect(page.getByText('Test point: Click should persist')).toBeVisible();
    const refreshedCard = page.locator('.border-l-4', { hasText: 'Test point: Click should persist' });

    // Check the segment div which has the bg-blue-600 class when active
    // The segment div has rounded corners (rounded-r-lg for last segment) and min-h classes
    const agreeSegment = refreshedCard.locator('.rounded-r-lg').filter({ has: page.locator('button', { hasText: /Agree/ }) });
    // Allow extra time: auth resolves async after reload, triggering a second effect run that loads positions
    await expect(agreeSegment).toHaveClass(/bg-blue-600/, { timeout: 10000 });
  });

  test('toggling position (clicking same button twice) should remove it', async ({ page }) => {
    // Create a test point
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Test point: Toggle should remove',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p154'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointIds.push(pointData.id);

    // Pre-set a position
    await supabaseAdmin.from('point_positions').insert({
      point_id: pointData.id,
      user_id: testUser.user.id,
      position: 'agree',
    });

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await expect(page.getByText('Test point: Toggle should remove')).toBeVisible({ timeout: 10000 });

    // Verify position button shows as selected (refresh to load from DB)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();

    const pointCard = page.locator('.border-l-4', { hasText: 'Test point: Toggle should remove' });
    const agreeSegment = pointCard.locator('.rounded-r-lg').filter({ has: page.locator('button', { hasText: /Agree/ }) });
    // Allow extra time: auth resolves async after reload, triggering a second effect run that loads positions
    await expect(agreeSegment).toHaveClass(/bg-blue-600/, { timeout: 10000 });

    // Click "Agree" button (toggle off) - find the clickable button inside the segment
    const agreeButton = pointCard.getByRole('button', { name: /^Agree/i }).first();
    await agreeButton.click();
    await page.waitForTimeout(3000);

    // Verify in database that position was removed
    const { data: positions } = await supabaseAdmin
      .from('point_positions')
      .select('*')
      .eq('point_id', pointData.id)
      .eq('user_id', testUser.user.id);
    expect(positions).toHaveLength(0);

    // Refresh and verify button is no longer selected
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();

    const refreshedCard = page.locator('.border-l-4', { hasText: 'Test point: Toggle should remove' });
    const refreshedSegment = refreshedCard.locator('.rounded-r-lg').filter({ has: page.locator('button', { hasText: /Agree/ }) });
    // Allow extra time: auth resolves async after reload, triggering a second effect run that loads positions
    await expect(refreshedSegment).not.toHaveClass(/bg-blue-600/, { timeout: 10000 });
    await expect(refreshedSegment).toHaveClass(/bg-white/, { timeout: 10000 });
  });

  test('position counts should update immediately after click', async ({ page }) => {
    // Create a test point
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Test point: Counts should update',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p154'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointIds.push(pointData.id);

    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to profile Points tab
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await expect(page.getByText('Test point: Counts should update')).toBeVisible({ timeout: 10000 });

    // Get initial counts (should be 0 for all)
    const pointCard = page.locator('.border-l-4', { hasText: 'Test point: Counts should update' });

    // Click "Disagree" button
    const disagreeButton = pointCard.getByRole('button', { name: /^Disagree/i }).first();
    await disagreeButton.click();
    await page.waitForTimeout(3000);

    // Verify in database FIRST
    const { data: savedPosition } = await supabaseAdmin
      .from('point_positions')
      .select('*')
      .eq('point_id', pointData.id)
      .eq('user_id', testUser.user.id)
      .single();
    expect(savedPosition?.position).toBe('disagree');

    // Refresh and verify count persists
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /points/i }).click();
    const refreshedCard = page.locator('.border-l-4', { hasText: 'Test point: Counts should update' });

    // Check the segment div - Disagree is the first segment (leftmost) with rounded-l-lg
    const disagreeSegment = refreshedCard.locator('.rounded-l-lg').filter({ has: page.locator('button', { hasText: /Disagree/ }) });
    // Allow extra time: auth resolves async after reload, triggering a second effect run that loads positions
    await expect(disagreeSegment).toHaveClass(/bg-blue-600/, { timeout: 10000 });

    // P155 REGRESSION: Verify count label shows 1 (not 0) after position save
    // Root cause was: getPointPositionCounts used sparse positions map (at most 1 entry)
    // instead of positionCounts from DB. After fix it should use toSevenPointCounts(p.positionCounts).
    // Counts render as "(1)" in the button accessible name "Disagree (1)"
    await expect(refreshedCard.getByRole('button', { name: 'Disagree (1)' })).toBeVisible({ timeout: 10000 });
  });

  test('p155 regression: story expand should not crash (StoryCardFull explicit props)', async ({ page }) => {
    // Create a story linked to a point — exercises StoryCardFull expand path
    const { data: pointData } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Test point for story expand regression',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p155'],
      })
      .select('id')
      .single();

    if (!pointData) throw new Error('Failed to create test point');
    testPointIds.push(pointData.id);

    const { data: storyData } = await supabaseAdmin
      .from('stories')
      .insert({
        content: 'Test story for expand regression test',
        author_id: testUser.user.id,
        visibility: 'public',
      })
      .select('id')
      .single();

    if (!storyData) throw new Error('Failed to create test story');

    // Link point to story
    await supabaseAdmin.from('story_points').insert({
      story_id: storyData.id,
      point_id: pointData.id,
    });

    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    await page.goto(`/p/${testUser.slug}`);
    // Stories tab is default — story card should be visible
    await expect(page.getByText('Test story for expand regression test')).toBeVisible({ timeout: 10000 });

    // Click "N points" to expand — this triggered ReferenceError before fix
    const expandButton = page.getByRole('button', { name: /\d+ points?/i }).first();
    await expandButton.click();

    // Verify no crash: page still alive, expanded points visible
    // Use .first() because the point text appears twice (in QuotedPointCard and story detail Key Points section)
    await expect(page.getByText('Test point for story expand regression').first()).toBeVisible({ timeout: 5000 });

    // Cleanup story
    await supabaseAdmin.from('story_points').delete().eq('story_id', storyData.id);
    await supabaseAdmin.from('stories').delete().eq('id', storyData.id);
  });

  test('unauthenticated users see position counts but cannot position', async ({ page }) => {
    // Create a test point with a position
    const { data: pointData, error: pointError } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Test point: Unauthenticated view',
        first_validator_id: testUser.user.id,
        tags: ['test', 'p154'],
      })
      .select('id')
      .single();

    if (pointError || !pointData) {
      throw new Error(`Failed to create test point: ${pointError?.message}`);
    }
    testPointIds.push(pointData.id);

    // Add a position from the test user
    await supabaseAdmin.from('point_positions').insert({
      point_id: pointData.id,
      user_id: testUser.user.id,
      position: 'strongly_agree',
    });

    // Visit profile WITHOUT authenticating
    await page.goto(`/p/${testUser.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await expect(page.getByText('Test point: Unauthenticated view')).toBeVisible({ timeout: 10000 });

    // Verify position buttons are NOT visible for unauthenticated users
    // Since currentUserId is undefined, buttons should not render at all
    const pointCard = page.locator('.border-l-4', { hasText: 'Test point: Unauthenticated view' });
    const agreeButton = pointCard.getByRole('button', { name: /^Agree/i }).first();
    const disagreeButton = pointCard.getByRole('button', { name: /^Disagree/i }).first();
    const unsureButton = pointCard.getByRole('button', { name: /^Unsure/i }).first();

    // Buttons should not be visible (currentUserId guard prevents rendering)
    await expect(agreeButton).not.toBeVisible();
    await expect(disagreeButton).not.toBeVisible();
    await expect(unsureButton).not.toBeVisible();
  });
});
