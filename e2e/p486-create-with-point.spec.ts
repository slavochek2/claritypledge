/**
 * @file p486-create-with-point.spec.ts
 * @description E2E tests for P486: Replace /chat "Add your story" with simple /create form.
 *
 * Tests:
 * - /create?pointId=X shows ChatContextHeader with point text + position chip
 * - /create (no pointId) shows NO context banner
 * - Loading skeleton visible while point is fetching
 * - Textarea disabled while point loading, enabled after
 * - Error fallback: invalid pointId degrades to plain create (no error toast)
 * - Save with pointId creates story AND links it to the point
 * - Save without pointId creates story only (no link attempt)
 * - Partial failure: linkPointToStory fails, story still saved, toast includes warning
 * - /chat?pointId=X redirects to /create?pointId=X
 * - /chat?ideaId=Y redirects to /create?ideaId=Y
 * - ChatContextHeader is NOT sticky (static positioning in create context)
 * - Focus auto-set to textarea after point loads
 *
 * P1043 copy repair (2026-08-11): the assertions below were updated to match
 * shipped UI copy, not to make failing tests pass. Both renames predate this file's
 * last edit and were deliberate product changes:
 *   - h1 "Create a Story" -> "Share a Story"        (d4a4f181, 2026-03-13)
 *   - button "Publish Story" -> "Publish Public Story" (790675b8, 2026-03-26)
 * The button label is visibility-derived (create-story-page.tsx:74 — inherits the
 * point's visibility, else 'public'); createTestPoint omits visibility, so the DB
 * default 'public' applies and "Publish Public Story" is the correct label here.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from './helpers/test-point';
import { deleteTestStory } from './helpers/test-story';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P486 -- /create with pointId context', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: TestUser;
  let testPoint: TestPoint;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P486Create' });
    testPoint = await createTestPoint(testUser.user.id, {
      statement: 'Simple forms beat complex wizards for most tasks',
    });
    await createTestPosition(testPoint.id, testUser.user.id, 'agree');
  });

  test.afterAll(async () => {
    // Clean up stories created during tests
    const { data: stories } = await supabaseAdmin
      .from('stories')
      .select('id')
      .eq('author_id', testUser.user.id);
    if (stories) {
      for (const s of stories) {
        await deleteTestStory(s.id);
      }
    }
    await deleteTestPoint(testPoint.id);
    await deleteTestUser(testUser.user.id);
  });

  // -- Context banner rendering --

  test('ChatContextHeader shows point text and position chip when pointId provided', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    // Point text visible
    await expect(contextHeader).toContainText('Simple forms beat complex wizards');

    // Position chip shows "You agree"
    const chip = contextHeader.getByTestId('position-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText('You agree');
  });

  test('No context banner when no pointId param', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    // Page loads normally
    await expect(page.getByText('Share a Story')).toBeVisible({ timeout: 10000 });

    // No context header
    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).not.toBeAttached();
  });

  // -- Loading state --

  test('Skeleton pulse visible during point loading, then replaced by banner', async ({ page }) => {
    await setTestSession(page, testUser.email);

    // Use route handler to slow down point fetch so we can observe loading state
    await page.route('**/rest/v1/points*', async route => {
      await new Promise(r => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto(`/create?pointId=${testPoint.id}`);

    // Skeleton should appear (aria-busy="true" on banner container)
    const bannerArea = page.locator('[aria-busy="true"]');
    await expect(bannerArea).toBeVisible({ timeout: 5000 });

    // After loading completes, context header replaces skeleton
    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 15000 });

    // Skeleton no longer visible
    await expect(bannerArea).not.toBeAttached();
  });

  test('Textarea is disabled while point is loading', async ({ page }) => {
    await setTestSession(page, testUser.email);

    // Slow down point fetch
    await page.route('**/rest/v1/points*', async route => {
      await new Promise(r => setTimeout(r, 2000));
      await route.continue();
    });

    await page.goto(`/create?pointId=${testPoint.id}`);

    // During loading: textarea should be disabled
    const textarea = page.locator('#story-content');
    await expect(textarea).toBeDisabled({ timeout: 3000 });

    // After point loads, textarea should be enabled
    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 15000 });
    await expect(textarea).toBeEnabled();
  });

  // -- Error fallback --

  test('Invalid pointId degrades gracefully to plain create (no banner, no error)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (
        msg.type() === 'error' &&
        !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)
      ) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, testUser.email);
    await page.goto('/create?pointId=00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    // Page loads as plain create
    await expect(page.getByText('Share a Story')).toBeVisible({ timeout: 10000 });

    // No context header
    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).not.toBeAttached();

    // Textarea is enabled
    const textarea = page.locator('#story-content');
    await expect(textarea).toBeEnabled();

    // No error toast
    const toastError = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(toastError).not.toBeAttached();
  });

  test('Empty string pointId treated as no pointId (plain create)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/create?pointId=');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Share a Story')).toBeVisible({ timeout: 10000 });

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).not.toBeAttached();
  });

  // -- Save with pointId --

  test('Save with pointId creates story AND links it to the point', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Wait for context header to load
    await expect(page.getByTestId('chat-context-header')).toBeVisible({ timeout: 10000 });

    // Type story content
    const textarea = page.locator('#story-content');
    await textarea.fill('My story about why simple forms are better than complex wizards.');

    // Click Publish
    await page.getByRole('button', { name: 'Publish Public Story' }).click();

    // Wait for navigation to /story/:id
    await page.waitForURL(/\/story\//, { timeout: 15000 });

    // Verify story was created and linked
    const storyId = page.url().split('/story/')[1]?.split('?')[0];
    expect(storyId).toBeTruthy();

    // Check DB: story_points junction table should have the link
    const { data: link } = await supabaseAdmin
      .from('story_points')
      .select('story_id, point_id')
      .eq('story_id', storyId)
      .eq('point_id', testPoint.id)
      .single();

    expect(link).not.toBeNull();
    expect(link?.point_id).toBe(testPoint.id);
  });

  test('Save without pointId creates story only (no link)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('#story-content');
    await textarea.fill('A standalone story with no point context.');

    await page.getByRole('button', { name: 'Publish Public Story' }).click();

    await page.waitForURL(/\/story\//, { timeout: 15000 });

    const storyId = page.url().split('/story/')[1]?.split('?')[0];
    expect(storyId).toBeTruthy();

    // No story_points link should exist
    const { data: links } = await supabaseAdmin
      .from('story_points')
      .select('story_id')
      .eq('story_id', storyId);

    expect(links).toHaveLength(0);
  });

  // -- ChatContextHeader positioning --

  test('ChatContextHeader is NOT sticky in /create context (static positioning)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    // Check that position is NOT sticky
    const position = await contextHeader.evaluate(el => getComputedStyle(el).position);
    expect(position).not.toBe('sticky');
  });

  // -- Focus management --

  test('Focus auto-set to textarea after point loads (with pointId)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Wait for context header (point loaded)
    await expect(page.getByTestId('chat-context-header')).toBeVisible({ timeout: 10000 });

    // Textarea should be focused
    const textarea = page.locator('#story-content');
    await expect(textarea).toBeFocused({ timeout: 3000 });
  });

  test('Focus on textarea on mount when no pointId', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Share a Story')).toBeVisible({ timeout: 10000 });

    // Textarea should be focused
    const textarea = page.locator('#story-content');
    await expect(textarea).toBeFocused({ timeout: 3000 });
  });

  // -- /chat redirect --

  test('/chat?from=position&pointId=X redirects to /create with pointId', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/create');
    expect(page.url()).toContain(`pointId=${testPoint.id}`);
  });

  test('/chat?ideaId=Y redirects to /create?ideaId=Y', async ({ page }) => {
    await setTestSession(page, testUser.email);
    const fakeIdeaId = '00000000-0000-0000-0000-000000000099';
    await page.goto(`/chat?ideaId=${fakeIdeaId}`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/create');
    expect(page.url()).toContain(`ideaId=${fakeIdeaId}`);
  });

  // -- Context header content --

  test('ChatContextHeader shows [arrow] link to /point/:id', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    const contextHeader = page.getByTestId('chat-context-header');
    await expect(contextHeader).toBeVisible({ timeout: 10000 });

    const openLink = contextHeader.getByRole('link', { name: 'Open point detail' });
    await expect(openLink).toBeVisible();
    await expect(openLink).toHaveAttribute('href', `/point/${testPoint.id}`);
  });

  test('ChatContextHeader without position shows no chip', async ({ page }) => {
    // Create a user with no position on the point
    const noPositionUser = await createTestUser({ name: 'P486NoPos' });

    try {
      await setTestSession(page, noPositionUser.email);
      await page.goto(`/create?pointId=${testPoint.id}`);
      await page.waitForLoadState('networkidle');

      const contextHeader = page.getByTestId('chat-context-header');
      await expect(contextHeader).toBeVisible({ timeout: 10000 });

      // Point text present
      await expect(contextHeader).toContainText('Simple forms beat complex wizards');

      // No position chip
      const chip = contextHeader.getByTestId('position-chip');
      await expect(chip).not.toBeAttached();
    } finally {
      await deleteTestUser(noPositionUser.user.id);
    }
  });
});
