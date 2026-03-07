/**
 * @file p486-smoke.spec.ts
 * @description Smoke tests for P486: Replace /chat "Add your story" with simple /create form.
 *
 * Fast regression detection:
 * - /create page loads without JS errors (plain, no pointId)
 * - /create?pointId=X loads without JS errors (with valid point)
 * - /chat redirects to /create (preserving query params)
 * - /clarity-chat cascades through /chat to /create
 * - Unauthenticated /create redirects to /signup
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from './helpers/test-point';

test.describe('P486 Smoke -- /create page + /chat redirect', () => {
  test.setTimeout(30000);

  let testUser: TestUser;
  let testPoint: TestPoint;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P486Smoke' });
    testPoint = await createTestPoint(testUser.user.id, {
      statement: 'P486 smoke: simple create form replaces chat',
    });
    await createTestPosition(testPoint.id, testUser.user.id, 'agree');
  });

  test.afterAll(async () => {
    await deleteTestPoint(testPoint.id);
    await deleteTestUser(testUser.user.id);
  });

  // -- /create loads --

  test('/create loads without console errors (plain, no pointId)', async ({ page }) => {
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
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Create a Story')).toBeVisible({ timeout: 10000 });
    expect(consoleErrors).toHaveLength(0);
  });

  test('/create?pointId=X loads without console errors (with valid point)', async ({ page }) => {
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
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Create a Story')).toBeVisible({ timeout: 10000 });
    expect(consoleErrors).toHaveLength(0);
  });

  // -- /chat redirect --

  test('/chat redirects to /create (bare URL)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Should end up at /create (or /signup if auth gate fires first then /create)
    expect(page.url()).toContain('/create');
  });

  test('/chat?pointId=X redirects to /create?pointId=X (preserves query params)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/chat?from=position&pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/create');
    expect(page.url()).toContain(`pointId=${testPoint.id}`);
  });

  test('/clarity-chat cascades through /chat to /create', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/clarity-chat');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/create');
  });

  // -- Unauthenticated --

  test('Unauthenticated /create redirects to /signup', async ({ page }) => {
    // No session set
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/signup');
  });

  // -- No 404/500 for static assets --

  test('/create?pointId=X does not trigger 404 or 500 for static assets', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('response', response => {
      const url = response.url();
      const origin = new URL(page.url()).origin;
      if (url.startsWith(origin) && [404, 500].includes(response.status())) {
        failedRequests.push(`${response.status()} ${url}`);
      }
    });

    await setTestSession(page, testUser.email);
    await page.goto(`/create?pointId=${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    expect(
      failedRequests,
      `Failed requests: ${failedRequests.join('\n')}`
    ).toHaveLength(0);
  });
});
